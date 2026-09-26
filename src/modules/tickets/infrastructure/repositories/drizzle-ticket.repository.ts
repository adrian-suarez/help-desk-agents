import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { DomainError } from '../../../../shared/domain/domain-error';
import type { Database } from '../../../../shared/infrastructure/db/database';
import type { Ticket, TicketEvent } from '../../domain/ticket.entity';
import type { TicketState } from '../../domain/ticket.constants';
import type { TicketRepository } from '../../domain/repositories/ticket.repository';
import { TicketMapper } from '../ticket.mapper';
import { ticketEvents, ticketEvidence, ticketHandoffs, tickets } from '../ticket.schema';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type Executor = Database | Tx;

export class DrizzleTicketRepository implements TicketRepository {
  constructor(private readonly db: Database) {}

  async create(ticket: Ticket): Promise<Ticket> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.insert(tickets).values({ ...TicketMapper.toRow(ticket.snapshot), version: 0 }).returning({ id: tickets.id });
      await this.insertEvents(tx, row!.id, ticket.pullEvents());
      return (await this.load(tx, row!.id))!;
    });
  }

  async save(ticket: Ticket): Promise<Ticket> {
    const id = ticket.id;
    if (id === null) throw new Error('save() requiere un ticket persistido; usa create()');
    const snapshot = ticket.snapshot;

    return this.db.transaction(async (tx) => {
      // Bloqueo optimista: solo actualiza si nadie lo modificó desde que se leyó.
      const updated = await tx
        .update(tickets)
        .set({ ...TicketMapper.toRow(snapshot), version: snapshot.version + 1 })
        .where(and(eq(tickets.id, id), eq(tickets.version, snapshot.version)))
        .returning({ id: tickets.id });
      if (updated.length === 0) {
        throw new DomainError('CONCURRENT_UPDATE', 'El ticket fue modificado por otro proceso; vuelve a consultarlo');
      }

      const newHandoffs = snapshot.handoffs.filter((h) => h.id === undefined);
      if (newHandoffs.length) {
        await tx.insert(ticketHandoffs).values(newHandoffs.map((h) => ({ ticketId: id, fromAgent: h.from, toAgent: h.to, reason: h.reason, createdAt: h.at })));
      }
      const newEvidence = snapshot.evidence.filter((e) => e.id === undefined);
      if (newEvidence.length) {
        await tx.insert(ticketEvidence).values(newEvidence.map((e) => ({ ticketId: id, kind: e.kind, reference: e.reference, verified: e.verified, summary: e.summary, data: e.data, createdAt: e.at })));
      }
      await this.insertEvents(tx, id, ticket.pullEvents());
      return (await this.load(tx, id))!;
    });
  }

  async findById(id: number): Promise<Ticket | null> {
    return this.load(this.db, id);
  }

  async list(filter: { states?: TicketState[]; limit: number }): Promise<Ticket[]> {
    const rows = await this.db
      .select()
      .from(tickets)
      .where(filter.states?.length ? inArray(tickets.state, filter.states) : undefined)
      .orderBy(asc(tickets.slaDueAt), desc(tickets.id))
      .limit(filter.limit);
    // El listado no necesita handoffs ni evidencia.
    return rows.map((r) => TicketMapper.toDomain(r, [], []));
  }

  async history(id: number) {
    const rows = await this.db.select().from(ticketEvents).where(eq(ticketEvents.ticketId, id)).orderBy(asc(ticketEvents.id));
    return rows.map(TicketMapper.eventToDomain);
  }

  private async load(db: Executor, id: number): Promise<Ticket | null> {
    const [row] = await db.select().from(tickets).where(eq(tickets.id, id));
    if (!row) return null;
    const [handoffs, evidence] = await Promise.all([
      db.select().from(ticketHandoffs).where(eq(ticketHandoffs.ticketId, id)).orderBy(asc(ticketHandoffs.id)),
      db.select().from(ticketEvidence).where(eq(ticketEvidence.ticketId, id)).orderBy(asc(ticketEvidence.id)),
    ]);
    return TicketMapper.toDomain(row, handoffs, evidence);
  }

  private async insertEvents(tx: Executor, ticketId: number, events: TicketEvent[]): Promise<void> {
    if (!events.length) return;
    await tx.insert(ticketEvents).values(
      events.map((e) => ({ ticketId, type: e.type, actor: e.actor, fromState: e.fromState, toState: e.toState, reason: e.reason, data: e.data, createdAt: e.at })),
    );
  }
}
