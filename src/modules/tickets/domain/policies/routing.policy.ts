import { AUTOMATABLE_SUBTYPES, type Agent, type Category, type Priority, type Queue, type Subtype } from '../ticket.constants';
import type { RuleGuess } from '../rule-classifier';

export const MIN_CONFIDENCE = 0.6;

export interface RoutingInput {
  category: Category;
  subtype: Subtype;
  priority: Priority;
  confidence: number;
  rules: RuleGuess;
}

export interface RoutingDecision {
  rule: string;
  to: Exclude<Agent, 'triage'>;
  queue: Queue | null;
  why: string;
}

/**
 * Reglas evaluadas en orden; gana la primera que aplica.
 * Mismo ticket ⇒ misma decisión: el destino del handoff no lo elige el modelo.
 */
const RULES: ReadonlyArray<{ id: string; when: (i: RoutingInput) => boolean; to: RoutingDecision['to']; queue: Queue | null; why: string }> = [
  { id: 'R1_CRITICAL', when: (i) => i.priority === 'P1', to: 'escalation', queue: 'N2-Guardia', why: 'Severidad crítica: requiere atención humana inmediata' },
  { id: 'R2_LOW_CONFIDENCE', when: (i) => i.confidence < MIN_CONFIDENCE, to: 'escalation', queue: 'N1-Humano', why: 'Clasificación con baja confianza' },
  { id: 'R3_DISAGREEMENT', when: (i) => i.rules.subtype !== null && i.rules.subtype !== i.subtype, to: 'escalation', queue: 'N1-Humano', why: 'El LLM y las reglas no coinciden en el subtipo' },
  { id: 'R4_APPROVAL_REQUIRED', when: (i) => i.category === 'PROVISIONING', to: 'escalation', queue: 'Aprovisionamiento', why: 'Requiere aprobación del responsable del recurso' },
  { id: 'R5_AUTOMATABLE', when: (i) => AUTOMATABLE_SUBTYPES.has(i.subtype), to: 'diagnostics', queue: null, why: 'Caso con procedimiento automatizado seguro' },
  { id: 'R6_DEFAULT', when: () => true, to: 'escalation', queue: 'N1-Humano', why: 'Sin procedimiento automatizado seguro' },
];

export function decideRoute(input: RoutingInput): RoutingDecision {
  const rule = RULES.find((r) => r.when(input))!;
  return { rule: rule.id, to: rule.to, queue: rule.queue, why: rule.why };
}
