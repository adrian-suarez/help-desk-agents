import type { Clock } from '../../../../shared/application/ports/clock.port';
import type { SensitiveDataPort } from '../../../../shared/application/ports/sensitive-data.port';
import type { Agent } from '../../domain/ticket.constants';
import type { TicketRepository } from '../../domain/repositories/ticket.repository';
import { toTicketDto } from '../ticket.dto';
import { loadTicket } from '../ticket-loader';

export interface HandoffTicketInput {
  code: string;
  agent: Agent;
  to: Agent;
  reason: string;
}

/** Contexto mínimo que recibe cada destino (no se transfiere todo el ticket). */
const CONTEXT_FIELDS = {
  diagnostics: ['code', 'state', 'description', 'affectedUserRef', 'classification', 'routing', 'sla'],
  escalation: ['code', 'state', 'description', 'affectedUserRef', 'classification', 'routing', 'sla', 'evidence', 'handoffs'],
  triage: [],
} as const;

export class HandoffTicketUseCase {
  constructor(
    private readonly repo: TicketRepository,
    private readonly sensitive: SensitiveDataPort,
    private readonly clock: Clock,
  ) {}

  async execute(input: HandoffTicketInput) {
    let ticket = await loadTicket(this.repo, input.code);
    ticket.handoff({ from: input.agent, to: input.to, reason: this.sensitive.redact(input.reason).text }, this.clock.now());
    ticket = await this.repo.save(ticket);

    const dto = toTicketDto(ticket, this.clock.now()) as Record<string, unknown>;
    const context = Object.fromEntries(CONTEXT_FIELDS[input.to].map((k) => [k, dto[k]]));
    return { code: input.code, owner: ticket.owner, state: ticket.state, handoffContext: context };
  }
}
