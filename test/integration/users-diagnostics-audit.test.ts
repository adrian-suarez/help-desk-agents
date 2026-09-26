import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { eq } from 'drizzle-orm';
import type { DiagnosticRunner, RunnerOutcome } from '../../src/modules/diagnostics/domain/diagnostic.ports';
import { ticketEvents } from '../../src/modules/tickets/infrastructure/ticket.schema';
import { buildSystem, ticketInDiagnosis } from '../helpers';

/** Runner falso: devuelve las respuestas en orden, para simular fallos del script. */
class FakeRunner implements DiagnosticRunner {
  calls = 0;
  constructor(private readonly outcomes: RunnerOutcome[]) {}
  async run(): Promise<RunnerOutcome> {
    return this.outcomes[Math.min(this.calls++, this.outcomes.length - 1)]!;
  }
}

describe('Módulo users (remediación de cuentas)', () => {
  let sys: Awaited<ReturnType<typeof buildSystem>>;
  before(async () => { sys = await buildSystem(); });
  after(() => sys.close());

  it('desbloquea una cuenta bloqueada por intentos y permite resolver', async () => {
    const m = sys.modules;
    const code = await ticketInDiagnosis(m, 'Mi usuario jperez quedó bloqueado', 'jperez', { category: 'ACCESS_IDENTITY', subtype: 'ACCOUNT_LOCKED', service: 'SSO' });
    const status = await m.users.useCases.status.execute({ code });
    assert.equal(status.account.status, 'locked');
    assert.equal(status.applicableActions.find((a) => a.action === 'unlock_account')?.blockedBy, null);

    const r = await m.users.useCases.remediate.execute({ code, agent: 'diagnostics', action: 'unlock_account' });
    assert.equal(r.outcome, 'DONE');
    assert.equal(r.verified, true);

    const resolved = await m.tickets.useCases.resolve.execute({ code, agent: 'diagnostics', summary: 'Cuenta desbloqueada', userMessage: 'Tu cuenta ya está habilitada.' });
    assert.equal(resolved.evidence, r.reference);
  });

  it('no desbloquea un bloqueo de seguridad y sugiere escalar', async () => {
    const m = sys.modules;
    const code = await ticketInDiagnosis(m, 'Mi usuario acastro está bloqueado', 'acastro', { category: 'ACCESS_IDENTITY', subtype: 'ACCOUNT_LOCKED', service: 'SSO' });
    const r = await m.users.useCases.remediate.execute({ code, agent: 'diagnostics', action: 'unlock_account' });
    assert.equal(r.outcome, 'PRECONDITION_FAILED');
    assert.equal(r.next.tool, 'tickets_handoff');
    await assert.rejects(m.tickets.useCases.resolve.execute({ code, agent: 'diagnostics', summary: 'x x x', userMessage: 'Listo ya' }), { code: 'NOT_VERIFIED' });
  });

  it('no permite repetir la misma acción en el ticket', async () => {
    const m = sys.modules;
    const code = await ticketInDiagnosis(m, 'Mi usuario acastro sigue bloqueado', 'acastro', { category: 'ACCESS_IDENTITY', subtype: 'ACCOUNT_LOCKED', service: 'SSO' });
    await m.users.useCases.remediate.execute({ code, agent: 'diagnostics', action: 'unlock_account' });
    await assert.rejects(m.users.useCases.remediate.execute({ code, agent: 'diagnostics', action: 'unlock_account' }), { code: 'ALREADY_ATTEMPTED' });
  });

  it('solo actúa en IN_DIAGNOSIS y desde diagnostics', async () => {
    const m = sys.modules;
    const { code } = await m.tickets.useCases.create.execute({ description: 'usuario jperez bloqueado', reporter: 'jperez', channel: 'chat' });
    await assert.rejects(m.users.useCases.remediate.execute({ code, agent: 'diagnostics', action: 'unlock_account' }), { code: 'WRONG_STAGE' });
  });
});

describe('Módulo diagnostics (skill con reintento)', () => {
  const ok: RunnerOutcome = { ok: true, status: 'ok', diagnosis: 'INFRA_OK_CLIENT_SIDE', checks: [] };
  const crash: RunnerOutcome = { ok: false, error: 'Timeout de 20000 ms', exitCode: null };

  it('recupera con un reintento si el script falla una vez', async () => {
    const runner = new FakeRunner([crash, ok]);
    const sys = await buildSystem({ runner });
    const code = await ticketInDiagnosis(sys.modules, 'La VPN no conecta', 'lrodriguez', { category: 'INFRA_SOFTWARE', subtype: 'VPN_CONNECTIVITY', service: 'VPN' });
    const r = await sys.modules.diagnostics.useCases.run.execute({ code, agent: 'diagnostics' });
    assert.equal(r.diagnosis, 'INFRA_OK_CLIENT_SIDE');
    assert.equal(r.attempts, 2);
    assert.equal(r.next.tool, 'tickets_set_pending');
    await sys.close();
  });

  it('si falla dos veces no inventa: DIAGNOSTIC_TOOL_UNAVAILABLE y escalar', async () => {
    const runner = new FakeRunner([crash, crash]);
    const sys = await buildSystem({ runner });
    const code = await ticketInDiagnosis(sys.modules, 'Todo está lento en la intranet', 'lrodriguez', { category: 'INFRA_SOFTWARE', subtype: 'PERFORMANCE', service: 'Intranet' });
    const r = await sys.modules.diagnostics.useCases.run.execute({ code, agent: 'diagnostics' });
    assert.equal(runner.calls, 2, 'exactamente un reintento');
    assert.equal(r.diagnosis, 'DIAGNOSTIC_TOOL_UNAVAILABLE');
    assert.equal(r.recommendedNextStep.action, 'ESCALATE');
    assert.equal(r.next.args.to, 'escalation');
    await sys.close();
  });

  it('un diagnóstico no sirve como evidencia para resolver', async () => {
    const sys = await buildSystem({ runner: new FakeRunner([ok]) });
    const code = await ticketInDiagnosis(sys.modules, 'La VPN no conecta', 'lrodriguez', { category: 'INFRA_SOFTWARE', subtype: 'VPN_CONNECTIVITY', service: 'VPN' });
    await sys.modules.diagnostics.useCases.run.execute({ code, agent: 'diagnostics' });
    await assert.rejects(sys.modules.tickets.useCases.resolve.execute({ code, agent: 'diagnostics', summary: 'Infra OK', userMessage: 'Todo bien' }), { code: 'NOT_VERIFIED' });
    await sys.close();
  });

  it('rechaza subtipos sin diagnóstico automatizado', async () => {
    const sys = await buildSystem({ runner: new FakeRunner([ok]) });
    const code = await ticketInDiagnosis(sys.modules, 'usuario jperez bloqueado', 'jperez', { category: 'ACCESS_IDENTITY', subtype: 'ACCOUNT_LOCKED', service: 'SSO' });
    await assert.rejects(sys.modules.diagnostics.useCases.run.execute({ code, agent: 'diagnostics' }), { code: 'NOT_APPLICABLE' });
    await sys.close();
  });
});

describe('Módulo audit', () => {
  it('une ticket, remediación y diagnóstico en una línea de tiempo', async () => {
    const sys = await buildSystem({ runner: new FakeRunner([{ ok: true, status: 'issues', diagnosis: 'GATEWAY_UNREACHABLE', checks: [] }]) });
    const m = sys.modules;
    const code = await ticketInDiagnosis(m, 'La VPN no conecta', 'lrodriguez', { category: 'INFRA_SOFTWARE', subtype: 'VPN_CONNECTIVITY', service: 'VPN' });
    await m.diagnostics.useCases.run.execute({ code, agent: 'diagnostics' });
    const { timeline } = await m.audit.useCases.timeline.execute({ code });
    assert.deepEqual([...new Set(timeline.map((e) => e.source))].sort(), ['diagnostic', 'ticket']);
    assert.ok(timeline.some((e) => e.reference === 'DIAG-1'));
    await sys.close();
  });

  it('la base de datos impide modificar o borrar la bitácora', async () => {
    const sys = await buildSystem();
    await sys.modules.tickets.useCases.create.execute({ description: 'La VPN no conecta', channel: 'chat' });
    // Drizzle envuelve el error de Postgres; el mensaje del trigger viene en `cause`.
    const blockedByTrigger = (e: unknown) => /solo inserción/.test(String((e as { cause?: Error }).cause?.message));
    await assert.rejects(sys.db.update(ticketEvents).set({ reason: 'manipulado' }).where(eq(ticketEvents.id, 1)), blockedByTrigger);
    await assert.rejects(sys.db.delete(ticketEvents).where(eq(ticketEvents.id, 1)), blockedByTrigger);
    await sys.close();
  });
});
