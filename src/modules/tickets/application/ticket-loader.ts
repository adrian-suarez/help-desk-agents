import { NotFoundError } from '../../../shared/domain/domain-error';
import { TicketCode } from '../domain/ticket-code';
import type { Ticket } from '../domain/ticket.entity';
import type { TicketRepository } from '../domain/repositories/ticket.repository';

/** Carga por código o lanza NOT_FOUND. Compartido por todos los casos de uso. */
export async function loadTicket(repo: TicketRepository, code: string): Promise<Ticket> {
  const ticket = await repo.findById(TicketCode.parse(code));
  if (!ticket) throw new NotFoundError('Ticket', code);
  return ticket;
}
