import { index, integer, jsonb, pgEnum, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { DIAGNOSES, DIAGNOSTIC_TARGETS, RUN_STATUSES } from '../domain/diagnostic.policy';

export const diagnosticTargetEnum = pgEnum('diagnostic_target', DIAGNOSTIC_TARGETS);
export const diagnosisEnum = pgEnum('diagnosis', DIAGNOSES);
export const runStatusEnum = pgEnum('diagnostic_run_status', RUN_STATUSES);

/** Registro append-only de cada ejecución de la skill de diagnóstico. */
export const diagnosticRuns = pgTable(
  'diagnostic_runs',
  {
    id: serial('id').primaryKey(),
    ticketCode: text('ticket_code').notNull(),
    target: diagnosticTargetEnum('target').notNull(),
    status: runStatusEnum('status').notNull(),
    diagnosis: diagnosisEnum('diagnosis').notNull(),
    attempts: integer('attempts').notNull(),
    report: jsonb('report').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('diagnostic_runs_ticket_idx').on(t.ticketCode)],
);
