import type { TicketGateway } from '../../shared/application/ports/ticket-gateway.port';
import { RunDiagnosticUseCase } from './application/run-diagnostic.use-case';
import type { DiagnosticRunner, DiagnosticRunRepository } from './domain/diagnostic.ports';

export function createDiagnosticsModule(deps: { runner: DiagnosticRunner; repo: DiagnosticRunRepository; tickets: TicketGateway }) {
  return { useCases: { run: new RunDiagnosticUseCase(deps.runner, deps.repo, deps.tickets) } };
}

export type DiagnosticsModule = ReturnType<typeof createDiagnosticsModule>;
