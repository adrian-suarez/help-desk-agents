import { NotFoundError } from '../../../shared/domain/domain-error';
import type { AuditReader } from '../domain/timeline';

const view = (e: { at: Date; source: string; type: string; actor: string; summary: string; reference: string | null }) => ({
  at: e.at.toISOString(), source: e.source, type: e.type, actor: e.actor, summary: e.summary, reference: e.reference,
});

export class GetTimelineUseCase {
  constructor(private readonly reader: AuditReader) {}

  async execute(input: { code: string }) {
    if (!(await this.reader.ticketExists(input.code))) throw new NotFoundError('Ticket', input.code);
    const entries = await this.reader.timeline(input.code);
    return { code: input.code, count: entries.length, timeline: entries.map(view) };
  }
}

export class GetRecentActivityUseCase {
  constructor(private readonly reader: AuditReader) {}

  async execute(input: { limit: number }) {
    const entries = await this.reader.recent(input.limit);
    return { count: entries.length, activity: entries.map((e) => ({ ticketCode: e.ticketCode, ...view(e) })) };
  }
}
