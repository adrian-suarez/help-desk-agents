import type { Clock } from '../../../shared/application/ports/clock.port';
import type { TicketGateway } from '../../../shared/application/ports/ticket-gateway.port';
import { DomainError } from '../../../shared/domain/domain-error';
import { assertDiagnosticStage } from '../../../shared/domain/stage-guard';
import { ACTION_DEFINITIONS, type RemediationAction, type RemediationOutcome } from '../domain/policies/remediation.policy';
import type { UserAccountRepository } from '../domain/repositories/user-account.repository';

export interface RemediateInput {
  code: string;
  agent: string;
  action: RemediationAction;
}

/**
 * Ejecuta una acción de la lista blanca sobre la cuenta del usuario afectado.
 * Todo intento (exitoso o no) queda registrado y se adjunta al ticket como evidencia;
 * solo un resultado DONE con verificación posterior es evidencia verificada.
 */
export class RemediateAccountUseCase {
  constructor(
    private readonly accounts: UserAccountRepository,
    private readonly tickets: TicketGateway,
    private readonly clock: Clock,
  ) {}

  async execute(input: RemediateInput) {
    const ctx = await this.tickets.getContext(input.code);
    assertDiagnosticStage(ctx, input.agent);
    if ((await this.accounts.countAttempts(input.code, input.action)) > 0) {
      throw new DomainError('ALREADY_ATTEMPTED', `La acción ${input.action} ya se intentó en este ticket; no se reintenta, escala el caso`);
    }

    const def = ACTION_DEFINITIONS[input.action];
    const log = (outcome: RemediationOutcome, detail: string) => ({ userRef: ctx.affectedUserRef, ticketCode: input.code, action: input.action, outcome, detail });

    let outcome: RemediationOutcome;
    let detail: string;
    let actionId: number;

    const account = ctx.affectedUserRef ? await this.accounts.findByRef(ctx.affectedUserRef) : null;
    if (!ctx.subtype || !def.subtypes.includes(ctx.subtype)) {
      outcome = 'NOT_APPLICABLE';
      detail = `La acción no aplica al subtipo ${ctx.subtype}`;
      actionId = await this.accounts.logAction(log(outcome, detail));
    } else if (!account) {
      outcome = 'ACCOUNT_NOT_FOUND';
      detail = 'No se identificó la cuenta del usuario afectado';
      actionId = await this.accounts.logAction(log(outcome, detail));
    } else {
      const reason = def.precheck(account);
      if (reason) {
        outcome = 'PRECONDITION_FAILED';
        detail = reason;
        actionId = await this.accounts.logAction(log(outcome, detail));
      } else {
        def.apply(account, this.clock.now());
        const verified = def.postcheck(account);
        outcome = verified ? 'DONE' : 'POSTCHECK_FAILED';
        detail = verified ? def.description : 'La verificación posterior no confirmó el cambio';
        actionId = await this.accounts.saveWithAction(account, log(outcome, detail));
      }
    }

    const reference = `ACT-${actionId}`;
    const done = outcome === 'DONE';
    await this.tickets.addEvidence({
      code: input.code,
      kind: 'ACTION',
      reference,
      verified: done,
      summary: `${input.action}: ${outcome}`,
      data: { action: input.action, outcome, detail },
    });

    return {
      code: input.code,
      action: input.action,
      outcome,
      detail,
      reference,
      verified: done,
      next: done
        ? { tool: 'tickets_resolve', note: 'Resuelve con un resumen y un mensaje claro para el usuario' }
        : { tool: 'tickets_handoff', args: { code: input.code, agent: 'diagnostics', to: 'escalation', reason: outcome } },
    };
  }
}
