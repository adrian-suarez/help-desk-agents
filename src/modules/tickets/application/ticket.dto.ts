import { SLA_POLICY } from '../domain/policies/sla.policy';
import type { Ticket } from '../domain/ticket.entity';

/**
 * Lo que sale del módulo hacia afuera (agentes). Nunca se expone la entidad directamente:
 * así controlamos qué campos ve el LLM y podemos cambiar el dominio sin romper las herramientas.
 */
export function toTicketDto(ticket: Ticket, now: Date) {
  const t = ticket.snapshot;
  return {
    code: ticket.code,
    state: t.state,
    owner: t.owner,
    channel: t.channel,
    description: t.description,
    affectedUserRef: t.affectedUserRef,
    classification: t.classification && {
      category: t.classification.category,
      subtype: t.classification.subtype,
      priority: t.classification.priority,
      severity: SLA_POLICY[t.classification.priority].severity,
      confidence: t.classification.confidence,
      service: t.classification.service,
    },
    routing: t.routing,
    sla: t.slaDueAt && { resolutionDueAt: t.slaDueAt.toISOString(), breached: ticket.isSlaBreached(now) },
    handoffs: t.handoffs.map((h) => ({ from: h.from, to: h.to, reason: h.reason, at: h.at.toISOString() })),
    evidence: t.evidence.map((e) => ({ reference: e.reference, kind: e.kind, verified: e.verified, summary: e.summary })),
    userMessage: t.userMessage,
    escalation: t.escalation,
    resolution: t.resolution,
    updatedAt: t.updatedAt.toISOString(),
  };
}

export type TicketDto = ReturnType<typeof toTicketDto>;
