import type { RemediationAction, RemediationOutcome } from '../policies/remediation.policy';
import type { UserAccount } from '../user-account.entity';

export interface ActionLog {
  userRef: string | null;
  ticketCode: string;
  action: RemediationAction;
  outcome: RemediationOutcome;
  detail: string;
}

export interface UserAccountRepository {
  findByRef(userRef: string): Promise<UserAccount | null>;
  /** Guarda la cuenta y el registro de la acción en una transacción. Devuelve el id de la acción. */
  saveWithAction(account: UserAccount, log: ActionLog): Promise<number>;
  /** Registra un intento que no modificó la cuenta (precondición fallida, no aplicable…). */
  logAction(log: ActionLog): Promise<number>;
  countAttempts(ticketCode: string, action: RemediationAction): Promise<number>;
}
