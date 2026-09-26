import type { Clock } from '../../shared/application/ports/clock.port';
import type { SensitiveDataPort } from '../../shared/application/ports/sensitive-data.port';
import { AddEvidenceUseCase } from './application/use-cases/add-evidence.use-case';
import { ClassifyTicketUseCase } from './application/use-cases/classify-ticket.use-case';
import { CreateTicketUseCase } from './application/use-cases/create-ticket.use-case';
import { HandoffTicketUseCase } from './application/use-cases/handoff-ticket.use-case';
import { GetTicketUseCase, ListTicketsUseCase } from './application/use-cases/query-tickets.use-cases';
import { CloseTicketUseCase, EscalateTicketUseCase, ResolveTicketUseCase, SetPendingUserUseCase } from './application/use-cases/update-status.use-cases';
import type { TicketGateway } from '../../shared/application/ports/ticket-gateway.port';
import type { TicketRepository } from './domain/repositories/ticket.repository';

/**
 * Composición del módulo: recibe sus dependencias (inyección manual, sin framework)
 * y expone los casos de uso. Otros módulos consumen `api` (p. ej. addEvidence), nunca la infraestructura.
 */
export function createTicketsModule(deps: { repo: TicketRepository; sensitive: SensitiveDataPort; clock: Clock }) {
  const { repo, sensitive, clock } = deps;
  const useCases = {
    create: new CreateTicketUseCase(repo, sensitive, clock),
    classify: new ClassifyTicketUseCase(repo, sensitive, clock),
    handoff: new HandoffTicketUseCase(repo, sensitive, clock),
    get: new GetTicketUseCase(repo, clock),
    list: new ListTicketsUseCase(repo, clock),
    setPending: new SetPendingUserUseCase(repo, sensitive, clock),
    escalate: new EscalateTicketUseCase(repo, sensitive, clock),
    resolve: new ResolveTicketUseCase(repo, sensitive, clock),
    close: new CloseTicketUseCase(repo, sensitive, clock),
  };
  const addEvidence = new AddEvidenceUseCase(repo, sensitive, clock);
  const api = { addEvidence, getTicket: useCases.get };

  /** Implementación del puerto compartido que usan los demás módulos. */
  const gateway: TicketGateway = {
    async getContext(code) {
      const { ticket } = await useCases.get.execute({ code });
      return { code, state: ticket.state, owner: ticket.owner, subtype: ticket.classification?.subtype ?? null, affectedUserRef: ticket.affectedUserRef };
    },
    async addEvidence(input) {
      await addEvidence.execute(input);
    },
  };
  return { useCases, api, gateway };
}

export type TicketsModule = ReturnType<typeof createTicketsModule>;
