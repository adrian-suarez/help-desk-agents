import type { UserAccount } from '../user-account.entity';

export const REMEDIATION_ACTIONS = ['unlock_account', 'send_reset_link'] as const;
export type RemediationAction = (typeof REMEDIATION_ACTIONS)[number];

export const REMEDIATION_OUTCOMES = ['DONE', 'NOT_APPLICABLE', 'ACCOUNT_NOT_FOUND', 'PRECONDITION_FAILED', 'POSTCHECK_FAILED'] as const;
export type RemediationOutcome = (typeof REMEDIATION_OUTCOMES)[number];

interface ActionDefinition {
  description: string;
  /** Subtipos de ticket donde la acción es aplicable. */
  subtypes: readonly string[];
  /** Condición determinista para poder ejecutarla. Devuelve el motivo si no se cumple. */
  precheck(account: UserAccount): string | null;
  apply(account: UserAccount, now: Date): void;
  /** Verificación posterior: su resultado es la evidencia de resolución. */
  postcheck(account: UserAccount): boolean;
}

/**
 * Lista blanca de acciones de auto-remediación. Nada fuera de aquí puede ejecutarse.
 * Un bloqueo por seguridad (security_hold) nunca se desbloquea automáticamente.
 */
export const ACTION_DEFINITIONS: Readonly<Record<RemediationAction, ActionDefinition>> = {
  unlock_account: {
    description: 'Desbloquear cuenta bloqueada por intentos fallidos',
    subtypes: ['ACCOUNT_LOCKED'],
    precheck: (a) =>
      a.status !== 'locked' ? `La cuenta está ${a.status}, no bloqueada`
        : a.lockReason !== 'failed_attempts' ? `Bloqueo por "${a.lockReason}": requiere revisión humana`
        : null,
    apply: (a) => a.unlock(),
    postcheck: (a) => a.status === 'active' && a.failedAttempts === 0,
  },
  send_reset_link: {
    description: 'Enviar enlace de restablecimiento al canal registrado del usuario (autoservicio)',
    subtypes: ['PASSWORD_RESET', 'ACCOUNT_LOCKED'],
    precheck: (a) =>
      a.status !== 'active' ? `La cuenta está ${a.status}; primero debe estar activa`
        : !a.selfServiceEnrolled ? 'El usuario no está inscrito en autoservicio'
        : null,
    apply: (a, now) => a.registerResetLinkSent(now),
    postcheck: (a) => a.lastResetLinkAt !== null,
  },
};
