import { DomainError } from '../../../shared/domain/domain-error';

export const ACCOUNT_STATUSES = ['active', 'locked', 'disabled'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const LOCK_REASONS = ['failed_attempts', 'security_hold', 'inactivity'] as const;
export type LockReason = (typeof LOCK_REASONS)[number];

export interface UserAccountProps {
  /** Seudónimo (usr_…). El directorio simulado nunca guarda nombres ni correos. */
  userRef: string;
  status: AccountStatus;
  lockReason: LockReason | null;
  failedAttempts: number;
  selfServiceEnrolled: boolean;
  lastResetLinkAt: Date | null;
  version: number;
}

/** Cuenta del directorio corporativo (simulado). Ninguna operación lee ni fija contraseñas. */
export class UserAccount {
  private constructor(private props: UserAccountProps) {}

  static restore(props: UserAccountProps): UserAccount {
    return new UserAccount({ ...props });
  }

  get userRef() { return this.props.userRef; }
  get status() { return this.props.status; }
  get lockReason() { return this.props.lockReason; }
  get failedAttempts() { return this.props.failedAttempts; }
  get selfServiceEnrolled() { return this.props.selfServiceEnrolled; }
  get lastResetLinkAt() { return this.props.lastResetLinkAt; }
  get version() { return this.props.version; }
  get snapshot(): Readonly<UserAccountProps> { return this.props; }

  unlock(): void {
    if (this.props.status !== 'locked') throw new DomainError('PRECONDITION_FAILED', 'La cuenta no está bloqueada');
    this.props.status = 'active';
    this.props.lockReason = null;
    this.props.failedAttempts = 0;
  }

  registerResetLinkSent(now: Date): void {
    this.props.lastResetLinkAt = now;
  }

  /** Resumen seguro para el agente: sin datos personales. */
  toSafeView() {
    const p = this.props;
    return { userRef: p.userRef, status: p.status, lockReason: p.lockReason, failedAttempts: p.failedAttempts, selfServiceEnrolled: p.selfServiceEnrolled };
  }
}
