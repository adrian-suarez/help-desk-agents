import { DomainError } from '../../../../shared/domain/domain-error';
import type { Agent } from '../ticket.constants';

/**
 * Grafo de delegación sin aristas de regreso (DAG): los ciclos son imposibles por construcción.
 * escalation es terminal: su salida es una cola humana, no otro agente.
 */
export const HANDOFF_GRAPH: Readonly<Record<Agent, readonly Agent[]>> = {
  triage: ['diagnostics', 'escalation'],
  diagnostics: ['escalation'],
  escalation: [],
};

export const MAX_HANDOFFS = 2;

export function assertHandoffAllowed(params: {
  owner: Agent;
  from: Agent;
  to: Agent;
  visited: readonly Agent[];
  routedTo: Agent | null;
}): void {
  const { owner, from, to, visited, routedTo } = params;
  if (from !== owner) {
    throw new DomainError('NOT_OWNER', `El ticket pertenece a "${owner}", no a "${from}"`);
  }
  if (!HANDOFF_GRAPH[from].includes(to)) {
    throw new DomainError('FORBIDDEN_HANDOFF', `"${from}" no puede delegar a "${to}"`, { allowed: [...HANDOFF_GRAPH[from]] });
  }
  if (visited.includes(to)) {
    throw new DomainError('CYCLE_DETECTED', `El ticket ya pasó por "${to}"`);
  }
  if (visited.length - 1 >= MAX_HANDOFFS) {
    throw new DomainError('MAX_HANDOFFS', `Se alcanzó el máximo de ${MAX_HANDOFFS} delegaciones`);
  }
  // Determinismo: desde triage el destino lo fija la política de enrutamiento.
  if (from === 'triage' && routedTo !== to) {
    throw new DomainError('ROUTING_MISMATCH', `La política de enrutamiento exige delegar a "${routedTo}"`);
  }
}
