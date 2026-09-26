import type { Clock } from '../../../../shared/application/ports/clock.port';
import type { SensitiveDataPort } from '../../../../shared/application/ports/sensitive-data.port';
import type { Agent, Queue } from '../../domain/ticket.constants';
import type { TicketRepository } from '../../domain/repositories/ticket.repository';
import { loadTicket } from '../ticket-loader';

/**
 * Casos de uso de cambio de estado. Son cortos porque las reglas viven en la entidad;
 * la aplicación solo orquesta: cargar → ejecutar regla → guardar → responder.
 * Los textos libres (motivos, resúmenes) se redactan; el mensaje al usuario se rechaza si trae datos sensibles.
 */
abstract class StatusUseCase {
  constructor(
    protected readonly repo: TicketRepository,
    protected readonly sensitive: SensitiveDataPort,
    protected readonly clock: Clock,
  ) {}
  protected clean = (text: string) => this.sensitive.redact(text).text;
  protected isSensitive = (text: string) => this.sensitive.containsSensitive(text);
}

export class SetPendingUserUseCase extends StatusUseCase {
  async execute(input: { code: string; agent: Agent; reason: string; userMessage: string }) {
    let ticket = await loadTicket(this.repo, input.code);
    ticket.setPendingUser({ agent: input.agent, reason: this.clean(input.reason), userMessage: input.userMessage }, this.isSensitive, this.clock.now());
    ticket = await this.repo.save(ticket);
    return { code: input.code, state: ticket.state, userMessage: ticket.snapshot.userMessage };
  }
}

export class EscalateTicketUseCase extends StatusUseCase {
  async execute(input: { code: string; agent: Agent; queue: Queue; reason: string; userMessage: string }) {
    let ticket = await loadTicket(this.repo, input.code);
    ticket.escalate({ agent: input.agent, queue: input.queue, reason: this.clean(input.reason), userMessage: input.userMessage }, this.isSensitive, this.clock.now());
    ticket = await this.repo.save(ticket);
    const t = ticket.snapshot;
    return { code: input.code, state: t.state, escalation: t.escalation, priority: t.classification?.priority ?? null, slaDueAt: t.slaDueAt?.toISOString() ?? null, userMessage: t.userMessage };
  }
}

export class ResolveTicketUseCase extends StatusUseCase {
  async execute(input: { code: string; agent: Agent; summary: string; userMessage: string }) {
    let ticket = await loadTicket(this.repo, input.code);
    const evidence = ticket.resolve({ agent: input.agent, summary: this.clean(input.summary), userMessage: input.userMessage }, this.isSensitive, this.clock.now());
    ticket = await this.repo.save(ticket);
    return { code: input.code, state: ticket.state, evidence: evidence.reference, userMessage: ticket.snapshot.userMessage };
  }
}

export class CloseTicketUseCase extends StatusUseCase {
  async execute(input: { code: string; agent: Agent; reason: string }) {
    let ticket = await loadTicket(this.repo, input.code);
    ticket.close({ agent: input.agent, reason: this.clean(input.reason) }, this.clock.now());
    ticket = await this.repo.save(ticket);
    return { code: input.code, state: ticket.state };
  }
}
