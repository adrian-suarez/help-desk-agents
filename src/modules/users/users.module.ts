import type { Clock } from '../../shared/application/ports/clock.port';
import type { TicketGateway } from '../../shared/application/ports/ticket-gateway.port';
import { GetAccountStatusUseCase } from './application/get-account-status.use-case';
import { RemediateAccountUseCase } from './application/remediate-account.use-case';
import type { UserAccountRepository } from './domain/repositories/user-account.repository';

export function createUsersModule(deps: { repo: UserAccountRepository; tickets: TicketGateway; clock: Clock }) {
  return {
    useCases: {
      status: new GetAccountStatusUseCase(deps.repo, deps.tickets),
      remediate: new RemediateAccountUseCase(deps.repo, deps.tickets, deps.clock),
    },
  };
}

export type UsersModule = ReturnType<typeof createUsersModule>;
