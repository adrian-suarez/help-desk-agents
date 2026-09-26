import type { Clock } from '../../../../shared/application/ports/clock.port';
import type { SensitiveDataPort } from '../../../../shared/application/ports/sensitive-data.port';
import type { Evidence } from '../../domain/ticket.entity';
import type { TicketRepository } from '../../domain/repositories/ticket.repository';
import { loadTicket } from '../ticket-loader';

export type AddEvidenceInput = { code: string } & Omit<Evidence, 'id' | 'at'>;

/**
 * No se expone como herramienta MCP: lo invocan otros módulos (diagnostics, users)
 * cuando producen un resultado verificable. Así el agente no puede fabricar evidencia.
 */
export class AddEvidenceUseCase {
  constructor(
    private readonly repo: TicketRepository,
    private readonly sensitive: SensitiveDataPort,
    private readonly clock: Clock,
  ) {}

  async execute(input: AddEvidenceInput) {
    let ticket = await loadTicket(this.repo, input.code);
    const data = JSON.parse(this.sensitive.redact(JSON.stringify(input.data)).text) as Record<string, unknown>;
    ticket.addEvidence({ kind: input.kind, reference: input.reference, verified: input.verified, summary: input.summary, data }, this.clock.now());
    ticket = await this.repo.save(ticket);
    return { code: input.code, reference: input.reference, verified: input.verified };
  }
}
