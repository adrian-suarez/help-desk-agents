import { boolean, index, integer, pgEnum, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { ACCOUNT_STATUSES, LOCK_REASONS } from '../domain/user-account.entity';
import { REMEDIATION_ACTIONS, REMEDIATION_OUTCOMES } from '../domain/policies/remediation.policy';

export const accountStatusEnum = pgEnum('account_status', ACCOUNT_STATUSES);
export const lockReasonEnum = pgEnum('lock_reason', LOCK_REASONS);
export const remediationActionEnum = pgEnum('remediation_action', REMEDIATION_ACTIONS);
export const remediationOutcomeEnum = pgEnum('remediation_outcome', REMEDIATION_OUTCOMES);

/** Directorio simulado (en producción sería Entra ID / Active Directory detrás de este mismo puerto). */
export const userAccounts = pgTable('user_accounts', {
  userRef: text('user_ref').primaryKey(),
  status: accountStatusEnum('status').notNull(),
  lockReason: lockReasonEnum('lock_reason'),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  selfServiceEnrolled: boolean('self_service_enrolled').notNull().default(false),
  lastResetLinkAt: timestamp('last_reset_link_at', { withTimezone: true }),
  version: integer('version').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Registro append-only de cada intento de remediación. */
export const accountActions = pgTable(
  'account_actions',
  {
    id: serial('id').primaryKey(),
    userRef: text('user_ref'),
    ticketCode: text('ticket_code').notNull(),
    action: remediationActionEnum('action').notNull(),
    outcome: remediationOutcomeEnum('outcome').notNull(),
    detail: text('detail').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('account_actions_ticket_idx').on(t.ticketCode)],
);
