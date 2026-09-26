import type { TicketGateway } from '../../../shared/application/ports/ticket-gateway.port';
import { DomainError } from '../../../shared/domain/domain-error';
import { assertDiagnosticStage } from '../../../shared/domain/stage-guard';
import type { DiagnosticRunner, DiagnosticRunRepository, RunnerOutcome } from '../domain/diagnostic.ports';
import { MAX_ATTEMPTS, MAX_RUNS_PER_TICKET, NEXT_STEP, TARGET_BY_SUBTYPE, type Diagnosis, type RunStatus } from '../domain/diagnostic.policy';

/**
 * Ejecuta la skill de diagnóstico con reintento, guarda el resultado, lo adjunta al ticket
 * como evidencia informativa (no resuelve) y devuelve el siguiente paso de la tabla de decisión.
 * Si el recurso auxiliar falla dos veces, NUNCA inventa un diagnóstico: devuelve DIAGNOSTIC_TOOL_UNAVAILABLE.
 */
export class RunDiagnosticUseCase {
  constructor(
    private readonly runner: DiagnosticRunner,
    private readonly runs: DiagnosticRunRepository,
    private readonly tickets: TicketGateway,
  ) {}

  async execute(input: { code: string; agent: string }) {
    const ctx = await this.tickets.getContext(input.code);
    assertDiagnosticStage(ctx, input.agent);
    const target = ctx.subtype ? TARGET_BY_SUBTYPE[ctx.subtype] : undefined;
    if (!target) throw new DomainError('NOT_APPLICABLE', `No hay diagnóstico automatizado para el subtipo ${ctx.subtype}`);
    if ((await this.runs.countByTicket(input.code)) >= MAX_RUNS_PER_TICKET) {
      throw new DomainError('MAX_RUNS', `Ya se ejecutaron ${MAX_RUNS_PER_TICKET} diagnósticos en este ticket; escala el caso`);
    }

    const failures: { attempt: number; error: string; exitCode: number | null }[] = [];
    let outcome: RunnerOutcome | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const result = await this.runner.run(target);
      if (result.ok) { outcome = result; break; }
      failures.push({ attempt, error: result.error, exitCode: result.exitCode });
    }

    const status: RunStatus = outcome ? outcome.status : 'unavailable';
    const diagnosis: Diagnosis = outcome ? outcome.diagnosis : 'DIAGNOSTIC_TOOL_UNAVAILABLE';
    const attempts = outcome ? failures.length + 1 : failures.length;
    const nextStep = NEXT_STEP[diagnosis];
    const report = outcome ? { checks: outcome.checks } : { failures };

    const runId = await this.runs.save({ ticketCode: input.code, target, status, diagnosis, attempts, report: { ...report, nextStep } });
    const reference = `DIAG-${runId}`;
    await this.tickets.addEvidence({
      code: input.code,
      kind: 'DIAGNOSTIC',
      reference,
      verified: false, // un diagnóstico informa; no prueba que el problema se resolvió
      summary: `${target}: ${diagnosis}`,
      data: { target, status, diagnosis, attempts, recommendedQueue: nextStep.action === 'ESCALATE' ? nextStep.queue : null },
    });

    return {
      code: input.code,
      reference,
      target,
      status,
      diagnosis,
      attempts,
      ...(failures.length && { failures }),
      recommendedNextStep: nextStep,
      next:
        nextStep.action === 'SET_PENDING'
          ? { tool: 'tickets_set_pending', args: { code: input.code, agent: 'diagnostics', reason: diagnosis, userMessage: nextStep.userMessage } }
          : { tool: 'tickets_handoff', args: { code: input.code, agent: 'diagnostics', to: 'escalation', reason: `${diagnosis} → ${nextStep.queue}` } },
    };
  }
}
