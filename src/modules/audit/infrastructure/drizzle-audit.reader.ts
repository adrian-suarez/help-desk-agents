import { desc, eq } from 'drizzle-orm';
import type { Database } from '../../../shared/infrastructure/db/database';
import { TicketCode } from '../../tickets/domain/ticket-code';
import { ticketEvents, tickets } from '../../tickets/infrastructure/ticket.schema';
import { accountActions } from '../../users/infrastructure/user.schema';
import { diagnosticRuns } from '../../diagnostics/infrastructure/diagnostic.schema';
import { sortByTime, type AuditReader, type TimelineEntry } from '../domain/timeline';

/**
 * Read model de auditoría: une en una sola línea de tiempo los eventos del ticket,
 * los intentos de remediación y las ejecuciones de diagnóstico. Solo lectura.
 * Es el único lugar que lee tablas de otros módulos, y lo hace a propósito (CQRS de lectura).
 */
export class DrizzleAuditReader implements AuditReader {
  constructor(private readonly db: Database) {}

  async ticketExists(code: string): Promise<boolean> {
    const [row] = await this.db.select({ id: tickets.id }).from(tickets).where(eq(tickets.id, TicketCode.parse(code)));
    return Boolean(row);
  }

  async timeline(code: string): Promise<TimelineEntry[]> {
    const id = TicketCode.parse(code);
    const [events, actions, runs] = await Promise.all([
      this.db.select().from(ticketEvents).where(eq(ticketEvents.ticketId, id)),
      this.db.select().from(accountActions).where(eq(accountActions.ticketCode, code)),
      this.db.select().from(diagnosticRuns).where(eq(diagnosticRuns.ticketCode, code)),
    ]);
    return sortByTime([
      ...events.map((e): TimelineEntry => ({
        at: e.createdAt, source: 'ticket', type: e.type, actor: e.actor,
        summary: `${e.fromState ?? '∅'} → ${e.toState}: ${e.reason}`, reference: null,
      })),
      ...actions.map((a): TimelineEntry => ({
        at: a.createdAt, source: 'remediation', type: a.action, actor: 'diagnostics',
        summary: `${a.outcome}: ${a.detail}`, reference: `ACT-${a.id}`,
      })),
      ...runs.map((r): TimelineEntry => ({
        at: r.createdAt, source: 'diagnostic', type: `diagnose:${r.target}`, actor: 'skill:diagnostico-conectividad',
        summary: `${r.diagnosis} (${r.status}, ${r.attempts} intento/s)`, reference: `DIAG-${r.id}`,
      })),
    ]);
  }

  async recent(limit: number) {
    const rows = await this.db.select().from(ticketEvents).orderBy(desc(ticketEvents.id)).limit(limit);
    return rows.map((e) => ({
      ticketCode: TicketCode.format(e.ticketId), at: e.createdAt, source: 'ticket' as const, type: e.type, actor: e.actor,
      summary: `${e.fromState ?? '∅'} → ${e.toState}: ${e.reason}`, reference: null,
    }));
  }
}
