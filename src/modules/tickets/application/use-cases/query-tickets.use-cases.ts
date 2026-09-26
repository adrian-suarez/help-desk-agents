import type { Clock } from '../../../../shared/application/ports/clock.port';
import type { TicketState } from '../../domain/ticket.constants';
import type { TicketRepository } from '../../domain/repositories/ticket.repository';
import { toTicketDto } from '../ticket.dto';
import { loadTicket } from '../ticket-loader';

export class GetTicketUseCase {
  constructor(private readonly repo: TicketRepository, private readonly clock: Clock) {}

  async execute(input: { code: string; includeHistory?: boolean }) {
    const ticket = await loadTicket(this.repo, input.code);
    const history = input.includeHistory
      ? (await this.repo.history(ticket.id!)).map((e) => ({ at: e.at.toISOString(), type: e.type, actor: e.actor, from: e.fromState, to: e.toState, reason: e.reason }))
      : undefined;
    return { ticket: toTicketDto(ticket, this.clock.now()), ...(history && { history }) };
  }
}

export class ListTicketsUseCase {
  constructor(private readonly repo: TicketRepository, private readonly clock: Clock) {}

  async execute(input: { states?: TicketState[]; limit?: number }) {
    const now = this.clock.now();
    const tickets = await this.repo.list({ states: input.states, limit: input.limit ?? 50 });
    return {
      count: tickets.length,
      tickets: tickets.map((t) => {
        const s = t.snapshot;
        return { code: t.code, state: s.state, owner: s.owner, priority: s.classification?.priority ?? null, subtype: s.classification?.subtype ?? null, slaDueAt: s.slaDueAt?.toISOString() ?? null, slaBreached: t.isSlaBreached(now) };
      }),
    };
  }
}
