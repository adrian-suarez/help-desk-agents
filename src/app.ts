import { McpServer } from '@modelcontextprotocol/server';
import { systemClock, type Clock } from './shared/application/ports/clock.port';
import type { Env } from './shared/infrastructure/config/env';
import type { Database } from './shared/infrastructure/db/database';
import { RegexSensitiveDataAdapter } from './shared/infrastructure/security/regex-sensitive-data.adapter';
import { createTicketsModule } from './modules/tickets/tickets.module';
import { DrizzleTicketRepository } from './modules/tickets/infrastructure/repositories/drizzle-ticket.repository';
import { registerTicketTools } from './modules/tickets/presentation/ticket.tools';
import { createUsersModule } from './modules/users/users.module';
import { DrizzleUserAccountRepository } from './modules/users/infrastructure/repositories/drizzle-user-account.repository';
import { registerUserTools } from './modules/users/presentation/user.tools';
import { createDiagnosticsModule } from './modules/diagnostics/diagnostics.module';
import type { DiagnosticRunner } from './modules/diagnostics/domain/diagnostic.ports';
import { DrizzleDiagnosticRunRepository } from './modules/diagnostics/infrastructure/repositories/drizzle-diagnostic-run.repository';
import { ScriptDiagnosticRunner } from './modules/diagnostics/infrastructure/script-diagnostic.runner';
import { registerDiagnosticTools } from './modules/diagnostics/presentation/diagnostic.tools';
import { createAuditModule } from './modules/audit/audit.module';
import { DrizzleAuditReader } from './modules/audit/infrastructure/drizzle-audit.reader';
import { registerAuditTools } from './modules/audit/presentation/audit.tools';

/**
 * Raíz de composición: el único lugar que conoce las implementaciones concretas y las conecta.
 * `overrides` permite a los tests sustituir piezas (reloj, runner de diagnóstico).
 */
export function buildApp(db: Database, env: Env, overrides: { clock?: Clock; runner?: DiagnosticRunner } = {}) {
  const clock = overrides.clock ?? systemClock;
  const sensitive = new RegexSensitiveDataAdapter(env.PSEUDONYM_SALT);

  const tickets = createTicketsModule({ repo: new DrizzleTicketRepository(db), sensitive, clock });
  const users = createUsersModule({ repo: new DrizzleUserAccountRepository(db), tickets: tickets.gateway, clock });
  const diagnostics = createDiagnosticsModule({
    runner: overrides.runner ?? new ScriptDiagnosticRunner(env.DIAGNOSTIC_SCRIPT, env.DIAGNOSTIC_TIMEOUT_MS),
    repo: new DrizzleDiagnosticRunRepository(db),
    tickets: tickets.gateway,
  });
  const audit = createAuditModule({ reader: new DrizzleAuditReader(db) });

  const server = new McpServer(
    { name: 'helpdesk', version: '1.0.0-RC1' },
    { instructions: 'Servidor de la mesa de ayuda. Todas las operaciones sobre tickets pasan por estas herramientas; los errores traen un "code" que indica el siguiente paso.' },
  );
  registerTicketTools(server, tickets.useCases);
  registerUserTools(server, users.useCases);
  registerDiagnosticTools(server, diagnostics.useCases);
  registerAuditTools(server, audit.useCases);

  return { server, sensitive, modules: { tickets, users, diagnostics, audit } };
}
