import { DomainError } from '../../../shared/domain/domain-error';

/** Value object: el código visible (T-0001) se deriva del id interno. */
export const TicketCode = {
  format(id: number): string {
    return `T-${String(id).padStart(4, '0')}`;
  },
  parse(code: string): number {
    const match = /^T-(\d{4,})$/.exec(code.trim());
    if (!match) throw new DomainError('INVALID_CODE', `Código de ticket inválido: ${code}`);
    return Number(match[1]);
  },
  PATTERN: /^T-\d{4,}$/,
};
