import type { Clock } from '../src/shared/application/ports/clock.port';
import { RegexSensitiveDataAdapter } from '../src/shared/infrastructure/security/regex-sensitive-data.adapter';
import type { TicketRepository } from '../src/modules/tickets/domain/repositories/ticket.repository';
import { createTicketsModule } from '../src/modules/tickets/tickets.module';

export const sensitive = new RegexSensitiveDataAdapter('test-salt-at-least-16-chars');

/** Reloj controlable para probar SLA. */
export function fixedClock(iso = '2026-09-26T10:00:00Z'): Clock & { advance(minutes: number): void } {
  let current = new Date(iso);
  return { now: () => new Date(current), advance: (m) => { current = new Date(current.getTime() + m * 60_000); } };
}

export function buildModule(repo: TicketRepository, clock = fixedClock()) {
  return { ...createTicketsModule({ repo, sensitive, clock }), clock };
}

/** Crea y clasifica un ticket de VPN automatizable (ruta a diagnostics). */
export async function vpnTicket(uc: ReturnType<typeof buildModule>['useCases']) {
  const { code } = await uc.create.execute({ description: 'La VPN no conecta desde casa', reporter: 'jperez', channel: 'chat' });
  await uc.classify.execute({ code, agent: 'triage', category: 'INFRA_SOFTWARE', subtype: 'VPN_CONNECTIVITY', priority: 'P3', confidence: 0.9, service: 'VPN', rationale: 'Falla de VPN individual' });
  return code;
}

// ---------- Sistema completo sobre Postgres en memoria ----------
import { spawn, type ChildProcess } from 'node:child_process';
import { buildApp } from '../src/app';
import { createDatabase } from '../src/shared/infrastructure/db/database';
import { seedAll } from '../src/shared/infrastructure/db/seed';
import { loadEnv } from '../src/shared/infrastructure/config/env';
import type { DiagnosticRunner } from '../src/modules/diagnostics/domain/diagnostic.ports';

export async function buildSystem(overrides: { runner?: DiagnosticRunner } = {}) {
  const handle = await createDatabase('pglite://memory');
  const env = loadEnv({ DATABASE_URL: 'pglite://memory', PSEUDONYM_SALT: 'test-salt-at-least-16-chars' });
  const app = buildApp(handle.db, env, { clock: fixedClock(), ...overrides });
  await seedAll(handle.db, app.sensitive);
  return { ...app, db: handle.db, close: () => handle.close() };
}

/** Abre un ticket, lo clasifica y lo deja en diagnostics. */
export async function ticketInDiagnosis(
  m: Awaited<ReturnType<typeof buildSystem>>['modules'],
  description: string,
  reporter: string,
  classification: { category: 'ACCESS_IDENTITY' | 'INFRA_SOFTWARE'; subtype: 'ACCOUNT_LOCKED' | 'PASSWORD_RESET' | 'VPN_CONNECTIVITY' | 'PERFORMANCE'; service: string },
) {
  const { code } = await m.tickets.useCases.create.execute({ description, reporter, channel: 'chat' });
  await m.tickets.useCases.classify.execute({ code, agent: 'triage', priority: 'P3', confidence: 0.9, rationale: 'Caso de prueba', ...classification });
  await m.tickets.useCases.handoff.execute({ code, agent: 'triage', to: 'diagnostics', reason: 'R5_AUTOMATABLE' });
  return code;
}

/** Levanta los servicios simulados y espera a que estén listos. */
export async function startMockServices(env: Record<string, string> = {}): Promise<ChildProcess> {
  const child = spawn(process.execPath, ['tools/mock-services.mjs'], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
  const expected = env.MOCK_NO_GATEWAY ? 1 : 2;
  await new Promise<void>((resolve) => {
    let ready = 0;
    child.stdout!.on('data', (d: Buffer) => { ready += d.toString().split('\n').filter(Boolean).length; if (ready >= expected) resolve(); });
  });
  return child;
}
