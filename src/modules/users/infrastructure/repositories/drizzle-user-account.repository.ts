import { and, count, eq } from 'drizzle-orm';
import { DomainError } from '../../../../shared/domain/domain-error';
import type { Database } from '../../../../shared/infrastructure/db/database';
import type { RemediationAction } from '../../domain/policies/remediation.policy';
import { UserAccount } from '../../domain/user-account.entity';
import type { ActionLog, UserAccountRepository } from '../../domain/repositories/user-account.repository';
import { accountActions, userAccounts } from '../user.schema';

export class DrizzleUserAccountRepository implements UserAccountRepository {
  constructor(private readonly db: Database) {}

  async findByRef(userRef: string): Promise<UserAccount | null> {
    const [row] = await this.db.select().from(userAccounts).where(eq(userAccounts.userRef, userRef));
    return row ? UserAccount.restore(row) : null;
  }

  async saveWithAction(account: UserAccount, log: ActionLog): Promise<number> {
    const s = account.snapshot;
    return this.db.transaction(async (tx) => {
      const updated = await tx
        .update(userAccounts)
        .set({ status: s.status, lockReason: s.lockReason, failedAttempts: s.failedAttempts, lastResetLinkAt: s.lastResetLinkAt, version: s.version + 1, updatedAt: new Date() })
        .where(and(eq(userAccounts.userRef, s.userRef), eq(userAccounts.version, s.version)))
        .returning({ ref: userAccounts.userRef });
      if (!updated.length) throw new DomainError('CONCURRENT_UPDATE', 'La cuenta fue modificada por otro proceso');
      const [row] = await tx.insert(accountActions).values(log).returning({ id: accountActions.id });
      return row!.id;
    });
  }

  async logAction(log: ActionLog): Promise<number> {
    const [row] = await this.db.insert(accountActions).values(log).returning({ id: accountActions.id });
    return row!.id;
  }

  async countAttempts(ticketCode: string, action: RemediationAction): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(accountActions).where(and(eq(accountActions.ticketCode, ticketCode), eq(accountActions.action, action)));
    return Number(row?.n ?? 0);
  }
}
