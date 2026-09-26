import type { SensitiveDataPort } from '../../../shared/application/ports/sensitive-data.port';
import type { Database } from '../../../shared/infrastructure/db/database';
import { userAccounts } from './user.schema';

/**
 * Cuentas de demostración. Los nombres solo existen aquí para generar el seudónimo;
 * en la base se guarda únicamente usr_xxxx. Idempotente: se puede ejecutar varias veces.
 */
export const DEMO_USERS = [
  { user: 'jperez', status: 'locked', lockReason: 'failed_attempts', failedAttempts: 5, selfServiceEnrolled: true },
  { user: 'acastro', status: 'locked', lockReason: 'security_hold', failedAttempts: 0, selfServiceEnrolled: false },
  { user: 'mgarcia', status: 'disabled', lockReason: 'inactivity', failedAttempts: 0, selfServiceEnrolled: true },
  { user: 'lrodriguez', status: 'active', lockReason: null, failedAttempts: 0, selfServiceEnrolled: true },
] as const;

export async function seedUsers(db: Database, sensitive: SensitiveDataPort): Promise<number> {
  const rows = DEMO_USERS.map(({ user, ...rest }) => ({ userRef: sensitive.pseudonymize(user), ...rest }));
  const inserted = await db.insert(userAccounts).values(rows).onConflictDoNothing().returning({ ref: userAccounts.userRef });
  return inserted.length;
}
