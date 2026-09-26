import { DomainError } from '../../../../shared/domain/domain-error';
import type { TicketState } from '../ticket.constants';

/** Máquina de estados. Toda transición que no esté aquí es rechazada. */
export const TRANSITIONS: Readonly<Record<TicketState, readonly TicketState[]>> = {
  NEW: ['TRIAGED'],
  TRIAGED: ['IN_DIAGNOSIS', 'ESCALATED'],
  IN_DIAGNOSIS: ['RESOLVED', 'PENDING_USER', 'ESCALATED'],
  PENDING_USER: ['IN_DIAGNOSIS', 'ESCALATED', 'CLOSED'],
  ESCALATED: ['RESOLVED'],
  RESOLVED: ['CLOSED'],
  CLOSED: [],
};

export function assertTransition(from: TicketState, to: TicketState): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new DomainError('INVALID_TRANSITION', `Transición ${from} → ${to} no permitida`, {
      allowed: [...TRANSITIONS[from]],
    });
  }
}

/** Campo obligatorio: rechaza vacíos y textos de solo espacios. */
export function requireText(field: string, value: string | undefined | null): string {
  const clean = value?.trim();
  if (!clean) throw new DomainError('MISSING_FIELD', `El campo "${field}" es obligatorio`);
  return clean;
}
