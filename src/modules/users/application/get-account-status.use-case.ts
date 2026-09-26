import type { TicketGateway } from '../../../shared/application/ports/ticket-gateway.port';
import { DomainError } from '../../../shared/domain/domain-error';
import { ACTION_DEFINITIONS, REMEDIATION_ACTIONS } from '../domain/policies/remediation.policy';
import type { UserAccountRepository } from '../domain/repositories/user-account.repository';

/** Estado de la cuenta afectada por un ticket y qué acciones serían aplicables. Solo lectura, sin PII. */
export class GetAccountStatusUseCase {
  constructor(private readonly accounts: UserAccountRepository, private readonly tickets: TicketGateway) {}

  async execute(input: { code: string }) {
    const ctx = await this.tickets.getContext(input.code);
    if (!ctx.affectedUserRef) throw new DomainError('USER_NOT_IDENTIFIED', 'El ticket no tiene usuario afectado identificado');
    const account = await this.accounts.findByRef(ctx.affectedUserRef);
    if (!account) throw new DomainError('ACCOUNT_NOT_FOUND', 'La cuenta no existe en el directorio');

    const applicable = REMEDIATION_ACTIONS.filter((a) => ctx.subtype && ACTION_DEFINITIONS[a].subtypes.includes(ctx.subtype)).map((a) => ({
      action: a,
      description: ACTION_DEFINITIONS[a].description,
      blockedBy: ACTION_DEFINITIONS[a].precheck(account),
    }));
    return { code: input.code, account: account.toSafeView(), applicableActions: applicable };
  }
}
