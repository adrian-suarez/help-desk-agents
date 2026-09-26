import type { Priority } from '../ticket.constants';

export const SLA_POLICY: Readonly<Record<Priority, { responseMinutes: number; resolutionMinutes: number; severity: string }>> = {
  P1: { responseMinutes: 15, resolutionMinutes: 240, severity: 'Crítica' },
  P2: { responseMinutes: 30, resolutionMinutes: 480, severity: 'Alta' },
  P3: { responseMinutes: 240, resolutionMinutes: 1440, severity: 'Media' },
  P4: { responseMinutes: 480, resolutionMinutes: 4320, severity: 'Baja' },
};

export function resolutionDueAt(priority: Priority, createdAt: Date): Date {
  return new Date(createdAt.getTime() + SLA_POLICY[priority].resolutionMinutes * 60_000);
}

const RANK: Record<Priority, number> = { P1: 1, P2: 2, P3: 3, P4: 4 };

/** Devuelve la prioridad más alta (más urgente) de las dos. */
export function highestPriority(a: Priority, b: Priority): Priority {
  return RANK[a] <= RANK[b] ? a : b;
}
