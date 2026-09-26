export const TIMELINE_SOURCES = ['ticket', 'remediation', 'diagnostic'] as const;
export type TimelineSource = (typeof TIMELINE_SOURCES)[number];

/** Una decisión o acción registrada, venga del módulo que venga. */
export interface TimelineEntry {
  at: Date;
  source: TimelineSource;
  type: string;
  actor: string;
  summary: string;
  reference: string | null;
}

/** Puerto de lectura. Es un "read model": consulta los registros de varios módulos sin modificarlos. */
export interface AuditReader {
  ticketExists(code: string): Promise<boolean>;
  timeline(code: string): Promise<TimelineEntry[]>;
  recent(limit: number): Promise<(TimelineEntry & { ticketCode: string })[]>;
}

export function sortByTime<T extends { at: Date }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => a.at.getTime() - b.at.getTime());
}
