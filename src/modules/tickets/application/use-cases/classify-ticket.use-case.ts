import type { Clock } from '../../../../shared/application/ports/clock.port';
import type { SensitiveDataPort } from '../../../../shared/application/ports/sensitive-data.port';
import { guessByRules } from '../../domain/rule-classifier';
import type { Agent, Category, Priority, Subtype } from '../../domain/ticket.constants';
import type { TicketRepository } from '../../domain/repositories/ticket.repository';
import { loadTicket } from '../ticket-loader';

export interface ClassifyTicketInput {
  code: string;
  agent: Agent;
  category: Category;
  subtype: Subtype;
  priority: Priority;
  confidence: number;
  service: string;
  rationale: string;
}

/**
 * Clasificación híbrida: el LLM (agente de triage) propone, las reglas dan una segunda
 * opinión y la política de enrutamiento decide el destino de forma determinista.
 */
export class ClassifyTicketUseCase {
  constructor(
    private readonly repo: TicketRepository,
    private readonly sensitive: SensitiveDataPort,
    private readonly clock: Clock,
  ) {}

  async execute(input: ClassifyTicketInput) {
    let ticket = await loadTicket(this.repo, input.code);
    const rules = guessByRules(ticket.description);
    const routing = ticket.classify(
      { ...input, rationale: this.sensitive.redact(input.rationale).text },
      rules,
      this.clock.now(),
    );
    ticket = await this.repo.save(ticket);
    const c = ticket.snapshot.classification!;
    return {
      code: input.code,
      state: ticket.state,
      priority: c.priority,
      priorityRaisedByRules: c.priority !== c.llmPriority,
      rulesSubtype: rules.subtype,
      slaDueAt: ticket.snapshot.slaDueAt!.toISOString(),
      routing,
      next: { tool: 'tickets_handoff', args: { code: input.code, agent: 'triage', to: routing.to, reason: routing.rule } },
    };
  }
}
