import type { Evidence, Handoff, TicketEvent, TicketProps } from '../domain/ticket.entity';
import { Ticket } from '../domain/ticket.entity';
import type { Agent, Queue } from '../domain/ticket.constants';
import type { ticketEvents, ticketEvidence, ticketHandoffs, tickets } from './ticket.schema';

type TicketRow = typeof tickets.$inferSelect;
type HandoffRow = typeof ticketHandoffs.$inferSelect;
type EvidenceRow = typeof ticketEvidence.$inferSelect;
type EventRow = typeof ticketEvents.$inferSelect;

/** Traduce entre filas de la base y el agregado. El dominio no conoce las columnas. */
export const TicketMapper = {
  toDomain(row: TicketRow, handoffs: HandoffRow[], evidence: EvidenceRow[]): Ticket {
    const props: TicketProps = {
      id: row.id,
      version: row.version,
      state: row.state,
      owner: row.owner,
      channel: row.channel,
      description: row.description,
      redactionFindings: row.redactionFindings,
      reporterRef: row.reporterRef,
      affectedUserRef: row.affectedUserRef,
      classification:
        row.category && row.subtype && row.priority && row.llmPriority
          ? {
              category: row.category,
              subtype: row.subtype,
              priority: row.priority,
              llmPriority: row.llmPriority,
              confidence: row.confidence ?? 0,
              service: row.service ?? '',
              rationale: row.rationale ?? '',
              rulesSubtype: row.rulesSubtype,
            }
          : null,
      routing:
        row.routingRule && row.routingTo
          ? { rule: row.routingRule, to: row.routingTo as Exclude<Agent, 'triage'>, queue: row.routingQueue, why: row.routingWhy ?? '' }
          : null,
      slaDueAt: row.slaDueAt,
      userMessage: row.userMessage,
      escalation: row.escalationQueue ? { queue: row.escalationQueue as Queue, reason: row.escalationReason ?? '' } : null,
      resolution: row.resolutionSummary ? { summary: row.resolutionSummary, evidenceReference: row.resolutionEvidence ?? '' } : null,
      closureReason: row.closureReason,
      handoffs: handoffs.map((h): Handoff => ({ id: h.id, from: h.fromAgent, to: h.toAgent, reason: h.reason, at: h.createdAt })),
      evidence: evidence.map((e): Evidence => ({ id: e.id, kind: e.kind, reference: e.reference, verified: e.verified, summary: e.summary, data: e.data, at: e.createdAt })),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
    return Ticket.restore(props);
  },

  toRow(p: Readonly<TicketProps>) {
    const c = p.classification;
    return {
      state: p.state,
      owner: p.owner,
      channel: p.channel,
      description: p.description,
      redactionFindings: p.redactionFindings,
      reporterRef: p.reporterRef,
      affectedUserRef: p.affectedUserRef,
      category: c?.category ?? null,
      subtype: c?.subtype ?? null,
      priority: c?.priority ?? null,
      llmPriority: c?.llmPriority ?? null,
      confidence: c?.confidence ?? null,
      service: c?.service ?? null,
      rationale: c?.rationale ?? null,
      rulesSubtype: c?.rulesSubtype ?? null,
      routingRule: p.routing?.rule ?? null,
      routingTo: p.routing?.to ?? null,
      routingQueue: p.routing?.queue ?? null,
      routingWhy: p.routing?.why ?? null,
      slaDueAt: p.slaDueAt,
      userMessage: p.userMessage,
      escalationQueue: p.escalation?.queue ?? null,
      escalationReason: p.escalation?.reason ?? null,
      resolutionSummary: p.resolution?.summary ?? null,
      resolutionEvidence: p.resolution?.evidenceReference ?? null,
      closureReason: p.closureReason,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  },

  eventToDomain(row: EventRow): TicketEvent & { id: number } {
    return {
      id: row.id,
      type: row.type as TicketEvent['type'],
      actor: row.actor as TicketEvent['actor'],
      fromState: row.fromState,
      toState: row.toState,
      reason: row.reason,
      data: row.data,
      at: row.createdAt,
    };
  },
};
