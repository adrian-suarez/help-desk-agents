import { DomainError } from '../../../../shared/domain/domain-error';
import { Ticket, type TicketEvent, type TicketProps } from '../../domain/ticket.entity';
import type { TicketState } from '../../domain/ticket.constants';
import type { TicketRepository } from '../../domain/repositories/ticket.repository';

/**
 * Misma interfaz que el repositorio de Postgres, guardando en memoria.
 * Sirve para pruebas unitarias rápidas y demuestra que la persistencia es intercambiable.
 */
export class InMemoryTicketRepository implements TicketRepository {
  private rows = new Map<number, TicketProps>();
  private events: (TicketEvent & { id: number; ticketId: number })[] = [];
  private seq = 0;
  private childSeq = 0;

  async create(ticket: Ticket): Promise<Ticket> {
    const id = ++this.seq;
    this.rows.set(id, { ...structuredClone(ticket.snapshot), id, version: 0 });
    this.appendEvents(id, ticket.pullEvents());
    return this.restore(id);
  }

  async save(ticket: Ticket): Promise<Ticket> {
    const id = ticket.id!;
    const current = this.rows.get(id);
    if (!current || current.version !== ticket.version) {
      throw new DomainError('CONCURRENT_UPDATE', 'El ticket fue modificado por otro proceso; vuelve a consultarlo');
    }
    const snapshot = structuredClone(ticket.snapshot) as TicketProps;
    this.rows.set(id, {
      ...snapshot,
      version: snapshot.version + 1,
      handoffs: snapshot.handoffs.map((h) => ({ ...h, id: h.id ?? ++this.childSeq })),
      evidence: snapshot.evidence.map((e) => ({ ...e, id: e.id ?? ++this.childSeq })),
    });
    this.appendEvents(id, ticket.pullEvents());
    return this.restore(id);
  }

  async findById(id: number): Promise<Ticket | null> {
    return this.rows.has(id) ? this.restore(id) : null;
  }

  async list(filter: { states?: TicketState[]; limit: number }): Promise<Ticket[]> {
    return [...this.rows.keys()]
      .map((id) => this.restore(id))
      .filter((t) => !filter.states?.length || filter.states.includes(t.state))
      .slice(0, filter.limit);
  }

  async history(id: number) {
    return this.events.filter((e) => e.ticketId === id).map(({ ticketId: _omit, ...e }) => e);
  }

  private restore(id: number): Ticket {
    return Ticket.restore(structuredClone(this.rows.get(id)!));
  }

  private appendEvents(ticketId: number, events: TicketEvent[]): void {
    for (const e of events) this.events.push({ ...structuredClone(e), id: this.events.length + 1, ticketId });
  }
}
