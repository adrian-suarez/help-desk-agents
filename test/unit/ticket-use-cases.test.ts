import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InMemoryTicketRepository } from '../../src/modules/tickets/infrastructure/repositories/in-memory-ticket.repository';
import { buildModule, vpnTicket } from '../helpers';

const setup = () => {
  const repo = new InMemoryTicketRepository();
  return { repo, ...buildModule(repo) };
};

describe('Casos de uso de tickets (repositorio en memoria)', () => {
  it('crear: redacta credenciales, seudonimiza y avisa', async () => {
    const { useCases } = setup();
    const r = await useCases.create.execute({ description: 'usuario jperez bloqueado, mi contraseña es Verano2026! y mi correo jp@acme.com', reporter: 'jperez', channel: 'chat' });
    assert.equal(r.code, 'T-0001');
    assert.ok(!r.description.includes('Verano2026!'));
    assert.ok(!r.description.includes('jp@acme.com'));
    assert.ok(r.warning);
    const { ticket } = await useCases.get.execute({ code: r.code });
    assert.match(ticket.affectedUserRef!, /^usr_[a-f0-9]{12}$/);
  });

  it('flujo completo: clasificar → handoff → evidencia → resolver → cerrar', async () => {
    const { useCases, api } = setup();
    const code = await vpnTicket(useCases);
    const h = await useCases.handoff.execute({ code, agent: 'triage', to: 'diagnostics', reason: 'R5_AUTOMATABLE' });
    assert.equal(h.state, 'IN_DIAGNOSIS');
    assert.equal((h.handoffContext as Record<string, unknown>).evidence, undefined, 'diagnostics no recibe más contexto del necesario');

    await assert.rejects(useCases.resolve.execute({ code, agent: 'diagnostics', summary: 'Listo', userMessage: 'Ya funciona tu conexión' }), { code: 'NOT_VERIFIED' });

    await api.addEvidence.execute({ code, kind: 'ACTION', reference: 'ACT-1', verified: true, summary: 'Reinicio de túnel verificado', data: {} });
    const r = await useCases.resolve.execute({ code, agent: 'diagnostics', summary: 'Se restableció la conexión', userMessage: 'Tu conexión remota ya funciona.' });
    assert.equal(r.state, 'RESOLVED');
    assert.equal(r.evidence, 'ACT-1');

    await useCases.close.execute({ code, agent: 'diagnostics', reason: 'Usuario confirmó' });
    const { history } = await useCases.get.execute({ code, includeHistory: true });
    assert.deepEqual(history!.map((e) => e.type), ['CREATED', 'CLASSIFIED', 'HANDOFF', 'EVIDENCE_ADDED', 'RESOLVED', 'CLOSED']);
  });

  it('desde triage no se puede desviar el enrutamiento', async () => {
    const { useCases } = setup();
    const code = await vpnTicket(useCases);
    await assert.rejects(useCases.handoff.execute({ code, agent: 'triage', to: 'escalation', reason: 'prefiero escalar' }), { code: 'ROUTING_MISMATCH' });
  });

  it('solo escalation escala, y con cola y mensaje', async () => {
    const { useCases } = setup();
    const code = await vpnTicket(useCases);
    await useCases.handoff.execute({ code, agent: 'triage', to: 'diagnostics', reason: 'R5' });
    await assert.rejects(useCases.escalate.execute({ code, agent: 'diagnostics', queue: 'N2-Redes', reason: 'Gateway caído', userMessage: 'Lo revisa un especialista' }), { code: 'NOT_ALLOWED' });
    await useCases.handoff.execute({ code, agent: 'diagnostics', to: 'escalation', reason: 'GATEWAY_UNREACHABLE' });
    const r = await useCases.escalate.execute({ code, agent: 'escalation', queue: 'N2-Redes', reason: 'Gateway caído', userMessage: 'Un especialista de redes ya tomó tu caso.' });
    assert.equal(r.state, 'ESCALATED');
  });

  it('bloquea datos personales en el mensaje al usuario', async () => {
    const { useCases } = setup();
    const code = await vpnTicket(useCases);
    await useCases.handoff.execute({ code, agent: 'triage', to: 'diagnostics', reason: 'R5' });
    await assert.rejects(
      useCases.setPending.execute({ code, agent: 'diagnostics', reason: 'Infra OK', userMessage: 'Escríbenos a soporte@acme.com' }),
      { code: 'SENSITIVE_OUTPUT' },
    );
  });

  it('detecta modificaciones concurrentes (bloqueo optimista)', async () => {
    const { useCases, repo } = setup();
    const code = await vpnTicket(useCases);
    const a = (await repo.findById(1))!;
    const b = (await repo.findById(1))!;
    a.handoff({ from: 'triage', to: 'diagnostics', reason: 'R5' }, new Date());
    await repo.save(a);
    b.handoff({ from: 'triage', to: 'diagnostics', reason: 'R5' }, new Date());
    await assert.rejects(repo.save(b), { code: 'CONCURRENT_UPDATE' });
    assert.ok(code);
  });

  it('lista con SLA vencido', async () => {
    const { useCases, clock } = setup();
    await vpnTicket(useCases);
    clock.advance(25 * 60);
    const { tickets } = await useCases.list.execute({});
    assert.equal(tickets[0]!.slaBreached, true);
  });
});
