import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

/**
 * Levanta el servidor real por stdio (igual que VS Code) y lo usa con un cliente MCP.
 * Usa PGlite en memoria para no depender de Docker.
 */
describe('Servidor MCP (stdio)', () => {
  const client = new Client({ name: 'e2e-test', version: '1.0.0-RC1' });
  const call = async (name: string, args: Record<string, unknown>) => {
    const res = await client.callTool({ name, arguments: args });
    return { isError: Boolean(res.isError), body: JSON.parse((res.content as { text: string }[])[0]!.text) };
  };

  before(async () => {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ['--import', 'tsx', 'src/main.ts'],
        env: { ...process.env, DATABASE_URL: 'pglite://memory', PSEUDONYM_SALT: 'e2e-salt-at-least-16' } as Record<string, string>,
        stderr: 'ignore',
      }),
    );
  });
  after(() => client.close());

  it('expone las herramientas de los cuatro módulos', async () => {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), [
      'audit_recent', 'audit_timeline', 'diagnostics_run',
      'tickets_classify', 'tickets_close', 'tickets_create', 'tickets_escalate', 'tickets_get',
      'tickets_handoff', 'tickets_list', 'tickets_resolve', 'tickets_set_pending',
      'users_account_status', 'users_remediate',
    ]);
  });

  it('cuenta bloqueada: se desbloquea y se resuelve con evidencia (cuentas demo sembradas)', async () => {
    const { body: t } = await call('tickets_create', { description: 'Hola, mi usuario jperez quedó bloqueado. Mi contraseña es Verano2026!', reporter: 'jperez' });
    assert.ok(t.warning);
    const { body: k } = await call('tickets_classify', { code: t.code, agent: 'triage', category: 'ACCESS_IDENTITY', subtype: 'ACCOUNT_LOCKED', priority: 'P3', confidence: 0.95, service: 'SSO', rationale: 'Bloqueo por intentos' });
    await call('tickets_handoff', k.next.args);
    const { body: r } = await call('users_remediate', { code: t.code, agent: 'diagnostics', action: 'unlock_account' });
    assert.equal(r.outcome, 'DONE');
    const { body: done } = await call('tickets_resolve', { code: t.code, agent: 'diagnostics', summary: 'Cuenta desbloqueada', userMessage: 'Tu cuenta ya está habilitada. Te recomendamos cambiar tu contraseña.' });
    assert.equal(done.state, 'RESOLVED');
    const { body: audit } = await call('audit_timeline', { code: t.code });
    assert.ok(audit.timeline.some((e: { source: string }) => e.source === 'remediation'));
  });

  it('flujo de triage completo por MCP', async () => {
    const created = await call('tickets_create', { description: 'Necesito acceso al repositorio del proyecto Atlas', reporter: 'lrodriguez' });
    const code = created.body.code;

    const classified = await call('tickets_classify', {
      code, agent: 'triage', category: 'PROVISIONING', subtype: 'FOLDER_REPO_ACCESS',
      priority: 'P4', confidence: 0.92, service: 'GitLab', rationale: 'Solicitud de acceso a repositorio',
    });
    assert.equal(classified.body.routing.rule, 'R4_APPROVAL_REQUIRED');
    assert.deepEqual(classified.body.next.args.to, 'escalation');

    const handoff = await call('tickets_handoff', classified.body.next.args);
    assert.equal(handoff.body.owner, 'escalation');

    const escalated = await call('tickets_escalate', {
      code, agent: 'escalation', queue: 'Aprovisionamiento', reason: 'Requiere aprobación del dueño del repositorio',
      userMessage: 'Tu solicitud fue enviada al responsable del repositorio para su aprobación.',
    });
    assert.equal(escalated.body.state, 'ESCALATED');
  });

  it('el esquema rechaza valores inventados por el LLM', async () => {
    const res = await call('tickets_classify', {
      code: 'T-0001', agent: 'triage', category: 'HARDWARE', subtype: 'PRINTER', priority: 'P9', confidence: 3, service: 'x', rationale: 'y',
    }).catch((e: Error) => ({ isError: true, body: { message: e.message } }));
    assert.equal(res.isError, true);
  });

  it('los errores de negocio llegan con código para el agente', async () => {
    const res = await call('tickets_get', { code: 'T-9999' });
    assert.equal(res.isError, true);
    assert.equal(res.body.code, 'NOT_FOUND');
  });
});
