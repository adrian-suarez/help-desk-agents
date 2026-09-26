import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertHandoffAllowed } from '../../src/modules/tickets/domain/policies/handoff.policy';
import { assertTransition } from '../../src/modules/tickets/domain/policies/lifecycle.policy';
import { decideRoute } from '../../src/modules/tickets/domain/policies/routing.policy';
import { guessByRules } from '../../src/modules/tickets/domain/rule-classifier';
import { Ticket } from '../../src/modules/tickets/domain/ticket.entity';

const noRules = { subtype: null, priorityFloor: null };
const now = new Date('2026-09-26T10:00:00Z');

describe('lifecycle.policy', () => {
  it('rechaza transiciones no definidas', () => {
    assert.throws(() => assertTransition('NEW', 'RESOLVED'), { code: 'INVALID_TRANSITION' });
    assert.throws(() => assertTransition('CLOSED', 'TRIAGED'), { code: 'INVALID_TRANSITION' });
    assert.doesNotThrow(() => assertTransition('IN_DIAGNOSIS', 'PENDING_USER'));
  });
});

describe('routing.policy (orden de reglas)', () => {
  const base = { category: 'INFRA_SOFTWARE', subtype: 'VPN_CONNECTIVITY', priority: 'P3', confidence: 0.9, rules: noRules } as const;
  it('automatizable va a diagnostics', () => assert.equal(decideRoute(base).rule, 'R5_AUTOMATABLE'));
  it('P1 gana a todo lo demás', () => assert.equal(decideRoute({ ...base, priority: 'P1', confidence: 0.1 }).rule, 'R1_CRITICAL'));
  it('baja confianza escala', () => assert.equal(decideRoute({ ...base, confidence: 0.4 }).rule, 'R2_LOW_CONFIDENCE'));
  it('desacuerdo LLM vs reglas escala', () => assert.equal(decideRoute({ ...base, rules: { subtype: 'MFA_ISSUE', priorityFloor: null } }).rule, 'R3_DISAGREEMENT'));
  it('si las reglas no reconocen nada, se confía en el LLM', () => assert.equal(decideRoute({ ...base, rules: noRules }).to, 'diagnostics'));
  it('aprovisionamiento requiere aprobación', () =>
    assert.equal(decideRoute({ ...base, category: 'PROVISIONING', subtype: 'LICENSE_REQUEST' }).rule, 'R4_APPROVAL_REQUIRED'));
  it('MFA no es automatizable', () => assert.equal(decideRoute({ ...base, category: 'ACCESS_IDENTITY', subtype: 'MFA_ISSUE' }).rule, 'R6_DEFAULT'));
});

describe('rule-classifier', () => {
  it('detecta subtipo y señales de urgencia', () => {
    assert.deepEqual(guessByRules('Todo el equipo sin VPN, es urgente'), { subtype: 'VPN_CONNECTIVITY', priorityFloor: 'P1' });
  });
  it('no opina con texto mixto o desconocido', () => {
    assert.equal(guessByRules('la bpn no me deja entrar').subtype, null);
    assert.equal(guessByRules('VPN lenta y cuenta bloqueada').subtype, null);
  });
});

describe('handoff.policy', () => {
  const ok = { owner: 'triage', from: 'triage', to: 'diagnostics', visited: ['triage'], routedTo: 'diagnostics' } as const;
  it('permite el camino definido', () => assert.doesNotThrow(() => assertHandoffAllowed(ok)));
  it('impide devolver el ticket (ciclo)', () =>
    assert.throws(() => assertHandoffAllowed({ ...ok, owner: 'diagnostics', from: 'diagnostics', to: 'triage', visited: ['triage', 'diagnostics'] }), { code: 'FORBIDDEN_HANDOFF' }));
  it('impide que un no-dueño delegue', () => assert.throws(() => assertHandoffAllowed({ ...ok, from: 'diagnostics' }), { code: 'NOT_OWNER' }));
  it('impide desviarse del enrutamiento', () => assert.throws(() => assertHandoffAllowed({ ...ok, to: 'escalation' }), { code: 'ROUTING_MISMATCH' }));
  it('escalation es terminal', () =>
    assert.throws(() => assertHandoffAllowed({ ...ok, owner: 'escalation', from: 'escalation', to: 'diagnostics', visited: ['triage', 'escalation'] }), { code: 'FORBIDDEN_HANDOFF' }));
});

describe('Ticket (agregado)', () => {
  const open = () => Ticket.open({ channel: 'chat', redactedDescription: 'VPN no conecta', redactionFindings: [], reporterRef: null, affectedUserRef: null, now });
  const classifyInput = { agent: 'triage', category: 'INFRA_SOFTWARE', subtype: 'VPN_CONNECTIVITY', priority: 'P3', confidence: 0.9, service: 'VPN', rationale: 'VPN caída' } as const;

  it('rechaza subtipo que no pertenece a la categoría', () => {
    assert.throws(() => open().classify({ ...classifyInput, category: 'PROVISIONING' }, noRules, now), { code: 'INCONSISTENT_CLASSIFICATION' });
  });

  it('las reglas suben la prioridad pero nunca la bajan', () => {
    const t = open();
    t.classify(classifyInput, { subtype: null, priorityFloor: 'P2' }, now);
    assert.equal(t.snapshot.classification?.priority, 'P2');
    const t2 = open();
    t2.classify({ ...classifyInput, priority: 'P1' }, { subtype: null, priorityFloor: 'P2' }, now);
    assert.equal(t2.snapshot.classification?.priority, 'P1');
  });

  it('calcula el vencimiento de SLA según la prioridad', () => {
    const t = open();
    t.classify(classifyInput, noRules, now);
    assert.equal(t.snapshot.slaDueAt?.toISOString(), '2026-09-27T10:00:00.000Z'); // P3 = 24 h
  });

  it('cada cambio genera un evento de bitácora', () => {
    const t = open();
    t.classify(classifyInput, noRules, now);
    assert.deepEqual(t.pullEvents().map((e) => e.type), ['CREATED', 'CLASSIFIED']);
    assert.equal(t.pullEvents().length, 0, 'pullEvents vacía la cola');
  });
});
