import { boolean, index, integer, jsonb, pgEnum, pgTable, real, serial, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { AGENTS, CATEGORIES, CHANNELS, PRIORITIES, QUEUES, SUBTYPES, TICKET_STATES } from '../domain/ticket.constants';

// Los enums de Postgres se generan desde las constantes del dominio (una sola fuente de verdad).
export const ticketStateEnum = pgEnum('ticket_state', TICKET_STATES);
export const agentEnum = pgEnum('agent_name', AGENTS);
export const channelEnum = pgEnum('ticket_channel', CHANNELS);
export const priorityEnum = pgEnum('ticket_priority', PRIORITIES);
export const categoryEnum = pgEnum('ticket_category', CATEGORIES);
export const subtypeEnum = pgEnum('ticket_subtype', SUBTYPES);
export const queueEnum = pgEnum('escalation_queue', QUEUES);
export const evidenceKindEnum = pgEnum('evidence_kind', ['DIAGNOSTIC', 'ACTION']);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const tickets = pgTable(
  'tickets',
  {
    id: serial('id').primaryKey(),
    /** Bloqueo optimista: se incrementa en cada actualización. */
    version: integer('version').notNull().default(0),
    state: ticketStateEnum('state').notNull().default('NEW'),
    owner: agentEnum('owner').notNull().default('triage'),
    channel: channelEnum('channel').notNull(),
    /** Siempre la versión redactada; el texto original nunca llega aquí. */
    description: text('description').notNull(),
    redactionFindings: text('redaction_findings').array().notNull().default([]),
    reporterRef: text('reporter_ref'),
    affectedUserRef: text('affected_user_ref'),

    category: categoryEnum('category'),
    subtype: subtypeEnum('subtype'),
    priority: priorityEnum('priority'),
    llmPriority: priorityEnum('llm_priority'),
    confidence: real('confidence'),
    service: text('service'),
    rationale: text('rationale'),
    rulesSubtype: subtypeEnum('rules_subtype'),

    routingRule: text('routing_rule'),
    routingTo: agentEnum('routing_to'),
    routingQueue: queueEnum('routing_queue'),
    routingWhy: text('routing_why'),

    slaDueAt: timestamp('sla_due_at', { withTimezone: true }),
    userMessage: text('user_message'),
    escalationQueue: queueEnum('escalation_queue'),
    escalationReason: text('escalation_reason'),
    resolutionSummary: text('resolution_summary'),
    resolutionEvidence: text('resolution_evidence'),
    closureReason: text('closure_reason'),

    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('tickets_state_idx').on(t.state), index('tickets_sla_idx').on(t.slaDueAt)],
);

export const ticketHandoffs = pgTable(
  'ticket_handoffs',
  {
    id: serial('id').primaryKey(),
    ticketId: integer('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
    fromAgent: agentEnum('from_agent').notNull(),
    toAgent: agentEnum('to_agent').notNull(),
    reason: text('reason').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('ticket_handoffs_ticket_idx').on(t.ticketId)],
);

export const ticketEvidence = pgTable(
  'ticket_evidence',
  {
    id: serial('id').primaryKey(),
    ticketId: integer('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
    kind: evidenceKindEnum('kind').notNull(),
    reference: text('reference').notNull(),
    verified: boolean('verified').notNull(),
    summary: text('summary').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [unique('ticket_evidence_reference_uq').on(t.ticketId, t.reference)],
);

/** Bitácora append-only del ticket: una fila por decisión, escrita en la misma transacción que el cambio. */
export const ticketEvents = pgTable(
  'ticket_events',
  {
    id: serial('id').primaryKey(),
    ticketId: integer('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    actor: text('actor').notNull(),
    fromState: ticketStateEnum('from_state'),
    toState: ticketStateEnum('to_state').notNull(),
    reason: text('reason').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('ticket_events_ticket_idx').on(t.ticketId)],
);
