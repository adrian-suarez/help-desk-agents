import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { eq } from 'drizzle-orm';
import { ticketHandoffs, tickets } from '../../src/modules/tickets/infrastructure/ticket.schema';
import { createDatabase, type DatabaseHandle } from '../../src/shared/infrastructure/db/database';
import { DrizzleTicketRepository } from '../../src/modules/tickets/infrastructure/repositories/drizzle-ticket.repository';
import { buildModule, vpnTicket } from '../helpers';

/**
 * Prueba el repositorio real contra Postgres (PGlite en memoria) aplicando las
 * migraciones generadas por drizzle-kit: valida el SQL, los enums y las transacciones.
 */
describe('DrizzleTicketRepository (Postgres)', () => {
  let handle: DatabaseHandle;
  let repo: DrizzleTicketRepository;

  before(async () => {
    handle = await createDatabase('pglite://memory');
    repo = new DrizzleTicketRepository(handle.db);
  });
  after(() => handle.close());

  it('persiste el flujo completo con eventos, handoffs y evidencia', async () => {
    const { useCases, api } = buildModule(repo);
    const code = await vpnTicket(useCases);
    await useCases.handoff.execute({ code, agent: 'triage', to: 'diagnostics', reason: 'R5_AUTOMATABLE' });
    await api.addEvidence.execute({ code, kind: 'DIAGNOSTIC', reference: 'DIAG-1', verified: false, summary: 'Infra OK', data: { latencyMs: 42 } });
    await api.addEvidence.execute({ code, kind: 'ACTION', reference: 'ACT-1', verified: true, summary: 'Acción verificada', data: {} });
    await useCases.resolve.execute({ code, agent: 'diagnostics', summary: 'Resuelto', userMessage: 'Tu conexión remota ya funciona.' });

    const { ticket, history } = await useCases.get.execute({ code, includeHistory: true });
    assert.equal(ticket.state, 'RESOLVED');
    assert.equal(ticket.handoffs.length, 1);
    assert.equal(ticket.evidence[0]!.reference, 'DIAG-1');
    assert.equal(history!.length, 6);
  });

  it('bloqueo optimista con la base real', async () => {
    const { useCases } = buildModule(repo);
    const code = await vpnTicket(useCases);
    const id = Number(code.slice(2));
    const a = (await repo.findById(id))!;
    const b = (await repo.findById(id))!;
    a.handoff({ from: 'triage', to: 'diagnostics', reason: 'R5' }, new Date());
    await repo.save(a);
    b.handoff({ from: 'triage', to: 'diagnostics', reason: 'R5' }, new Date());
    await assert.rejects(repo.save(b), { code: 'CONCURRENT_UPDATE' });
    const rows = await handle.db.select().from(ticketHandoffs).where(eq(ticketHandoffs.ticketId, id));
    assert.equal(rows.length, 1, 'la transacción fallida no dejó handoffs huérfanos');
  });

  it('nunca guarda el texto original con la credencial', async () => {
    const { useCases } = buildModule(repo);
    await useCases.create.execute({ description: 'mi password: SuperSecreta99 no funciona', channel: 'email' });
    const rows = await handle.db.select({ description: tickets.description }).from(tickets);
    assert.ok(rows.every((r) => !r.description.includes('SuperSecreta99')));
  });
});
