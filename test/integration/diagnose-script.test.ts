import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import type { ChildProcess } from 'node:child_process';
import { ScriptDiagnosticRunner } from '../../src/modules/diagnostics/infrastructure/script-diagnostic.runner';
import { loadEnv } from '../../src/shared/infrastructure/config/env';
import { startMockServices } from '../helpers';

/** Prueba el script real de la skill contra servicios simulados. */
describe('Script de la skill diagnostico-conectividad', () => {
  const { DIAGNOSTIC_SCRIPT } = loadEnv({ DATABASE_URL: 'x', PSEUDONYM_SALT: 'test-salt-at-least-16-chars' });
  const runner = new ScriptDiagnosticRunner(DIAGNOSTIC_SCRIPT, 15_000);
  let mocks: ChildProcess | undefined;
  after(() => mocks?.kill());

  it('sin servicios: gateway inalcanzable (resultado válido, no fallo)', async () => {
    const r = await runner.run('vpn');
    assert.deepEqual(r.ok && [r.status, r.diagnosis], ['issues', 'GATEWAY_UNREACHABLE']);
  });

  it('con servicios sanos: el problema es del equipo del usuario', async () => {
    mocks = await startMockServices();
    const r = await runner.run('vpn');
    assert.deepEqual(r.ok && [r.status, r.diagnosis], ['ok', 'INFRA_OK_CLIENT_SIDE']);
    mocks.kill();
  });

  it('servicio lento: degradado', async () => {
    mocks = await startMockServices({ MOCK_SLOW: 'erp' });
    const r = await runner.run('services');
    assert.deepEqual(r.ok && r.diagnosis, 'SERVICE_DEGRADED');
    mocks.kill();
  });

  it('script inexistente o timeout: fallo del recurso', async () => {
    assert.equal((await new ScriptDiagnosticRunner('/no/existe.mjs', 5000).run('vpn')).ok, false);
    const r = await new ScriptDiagnosticRunner(DIAGNOSTIC_SCRIPT, 1).run('vpn');
    assert.deepEqual(r, { ok: false, error: 'Timeout de 1 ms', exitCode: null });
  });
});
