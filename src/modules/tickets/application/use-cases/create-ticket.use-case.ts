import type { Clock } from '../../../../shared/application/ports/clock.port';
import type { SensitiveDataPort } from '../../../../shared/application/ports/sensitive-data.port';
import { Ticket } from '../../domain/ticket.entity';
import type { Channel } from '../../domain/ticket.constants';
import type { TicketRepository } from '../../domain/repositories/ticket.repository';

export interface CreateTicketInput {
  description: string;
  reporter?: string;
  channel: Channel;
}

export class CreateTicketUseCase {
  constructor(
    private readonly repo: TicketRepository,
    private readonly sensitive: SensitiveDataPort,
    private readonly clock: Clock,
  ) {}

  /** El texto original se usa solo en memoria para extraer el usuario; nunca se persiste. */
  async execute(input: CreateTicketInput) {
    const redaction = this.sensitive.redact(input.description);
    const ticket = Ticket.open({
      channel: input.channel,
      redactedDescription: redaction.text,
      redactionFindings: redaction.findings,
      reporterRef: input.reporter ? this.sensitive.pseudonymize(input.reporter) : null,
      affectedUserRef: this.sensitive.extractAffectedUserRef(input.description, input.reporter),
      now: this.clock.now(),
    });
    const saved = await this.repo.create(ticket);
    return {
      code: saved.code!,
      state: saved.state,
      description: saved.description,
      redactionFindings: redaction.findings,
      warning: redaction.secretDetected
        ? 'El usuario compartió una credencial. Se eliminó del registro. Recomiéndale no compartir credenciales y cambiarla por autoservicio.'
        : null,
    };
  }
}
