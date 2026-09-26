import type { Ticket, TicketEvent } from '../ticket.entity';
import type { TicketState } from '../ticket.constants';

/**
 * Puerto de persistencia (lo define el dominio, lo implementa la infraestructura).
 * Hay dos implementaciones: Drizzle/Postgres y en memoria (tests). Se pueden
 * intercambiar sin tocar dominio ni aplicación.
 */
export interface TicketRepository {
  /** Inserta el ticket, le asigna id y guarda sus eventos, todo en una transacción. */
  create(ticket: Ticket): Promise<Ticket>;
  findById(id: number): Promise<Ticket | null>;
  /**
   * Guarda cambios con bloqueo optimista: si otro proceso modificó el ticket
   * (versión distinta) lanza CONCURRENT_UPDATE. Inserta handoffs, evidencia y eventos nuevos.
   */
  save(ticket: Ticket): Promise<Ticket>;
  list(filter: { states?: TicketState[]; limit: number }): Promise<Ticket[]>;
  history(id: number): Promise<(TicketEvent & { id: number })[]>;
}
