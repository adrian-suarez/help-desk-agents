import { GetRecentActivityUseCase, GetTimelineUseCase } from './application/audit.use-cases';
import type { AuditReader } from './domain/timeline';

export function createAuditModule(deps: { reader: AuditReader }) {
  return { useCases: { timeline: new GetTimelineUseCase(deps.reader), recent: new GetRecentActivityUseCase(deps.reader) } };
}

export type AuditModule = ReturnType<typeof createAuditModule>;
