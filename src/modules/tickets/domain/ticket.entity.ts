import { DomainError } from '../../../shared/domain/domain-error';
import { assertHandoffAllowed } from './policies/handoff.policy';
import { assertTransition, requireText } from './policies/lifecycle.policy';
import { decideRoute, type RoutingDecision } from './policies/routing.policy';
import type { RuleGuess } from './rule-classifier';
import { highestPriority, resolutionDueAt } from './policies/sla.policy';
import { TicketCode } from './ticket-code';
import { categoryOf, type Agent, type Category, type Channel, type Priority, type Queue, type Subtype, type TicketState } from './ticket.constants';

// ---------- Tipos del agregado ----------

export interface Classification {
  category: Category;
  subtype: Subtype;
  /** Prioridad final (la del LLM, elevada por las reglas si hay señales de urgencia). */
  priority: Priority;
  llmPriority: Priority;
  confidence: number;
  service: string;
  rationale: string;
  rulesSubtype: Subtype | null;
}

export interface Handoff {
  id?: number;
  from: Agent;
  to: Agent;
  reason: string;
  at: Date;
}

export interface Evidence {
  id?: number;
  kind: 'DIAGNOSTIC' | 'ACTION';
  /** Identificador del resultado que la respalda (p. ej. DIAG-1, ACT-3f9a). */
  reference: string;
  verified: boolean;
  summary: string;
  data: Record<string, unknown>;
  at: Date;
}

export type TicketEventType =
  | 'CREATED'
  | 'CLASSIFIED'
  | 'HANDOFF'
  | 'EVIDENCE_ADDED'
  | 'PENDING_USER'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'CLOSED';

/** Registro de bitácora. Se persiste en la misma transacción que el cambio que describe. */
export interface TicketEvent {
  type: TicketEventType;
  actor: Agent | 'system';
  fromState: TicketState | null;
  toState: TicketState;
  reason: string;
  data: Record<string, unknown>;
  at: Date;
}

export interface TicketProps {
  id: number | null;
  version: number;
  state: TicketState;
  owner: Agent;
  channel: Channel;
  description: string;
  redactionFindings: string[];
  reporterRef: string | null;
  affectedUserRef: string | null;
  classification: Classification | null;
  routing: RoutingDecision | null;
  slaDueAt: Date | null;
  userMessage: string | null;
  escalation: { queue: Queue; reason: string } | null;
  resolution: { summary: string; evidenceReference: string } | null;
  closureReason: string | null;
  handoffs: Handoff[];
  evidence: Evidence[];
  createdAt: Date;
  updatedAt: Date;
}

/** Comprueba que un texto dirigido al usuario no contenga datos sensibles. */
export type SensitiveCheck = (text: string) => boolean;

// ---------- Agregado ----------

/**
 * Agregado raíz del módulo. Toda modificación pasa por sus métodos, que aplican
 * las políticas (estados, handoffs, enrutamiento, evidencia) y registran un evento.
 * No conoce la base de datos ni MCP.
 */
export class Ticket {
  private pendingEvents: TicketEvent[] = [];

  private constructor(private props: TicketProps) {}

  static open(input: {
    channel: Channel;
    redactedDescription: string;
    redactionFindings: string[];
    reporterRef: string | null;
    affectedUserRef: string | null;
    now: Date;
  }): Ticket {
    const ticket = new Ticket({
      id: null,
      version: 0,
      state: 'NEW',
      owner: 'triage',
      channel: input.channel,
      description: requireText('description', input.redactedDescription),
      redactionFindings: input.redactionFindings,
      reporterRef: input.reporterRef,
      affectedUserRef: input.affectedUserRef,
      classification: null,
      routing: null,
      slaDueAt: null,
      userMessage: null,
      escalation: null,
      resolution: null,
      closureReason: null,
      handoffs: [],
      evidence: [],
      createdAt: input.now,
      updatedAt: input.now,
    });
    ticket.record('CREATED', 'system', null, 'NEW', 'Ingreso de ticket', { channel: input.channel, redactionFindings: input.redactionFindings }, input.now);
    return ticket;
  }

  /** Reconstruye un ticket existente (lo usa el repositorio). No genera eventos. */
  static restore(props: TicketProps): Ticket {
    return new Ticket(props);
  }

  // ---------- Lectura ----------

  get id(): number | null { return this.props.id; }
  get code(): string | null { return this.props.id === null ? null : TicketCode.format(this.props.id); }
  get state(): TicketState { return this.props.state; }
  get owner(): Agent { return this.props.owner; }
  get version(): number { return this.props.version; }
  get description(): string { return this.props.description; }
  get snapshot(): Readonly<TicketProps> { return this.props; }

  /** Devuelve y vacía los eventos pendientes de persistir. */
  pullEvents(): TicketEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  isSlaBreached(now: Date): boolean {
    return this.props.slaDueAt !== null && !['RESOLVED', 'CLOSED'].includes(this.props.state) && this.props.slaDueAt < now;
  }

  // ---------- Comportamiento ----------

  /**
   * Registra la clasificación propuesta por el LLM, la contrasta con las reglas
   * y fija el enrutamiento. Las reglas pueden subir la prioridad, nunca bajarla.
   */
  classify(
    input: { agent: Agent; subtype: Subtype; category: Category; priority: Priority; confidence: number; service: string; rationale: string },
    rules: RuleGuess,
    now: Date,
  ): RoutingDecision {
    this.assertOwner(input.agent);
    if (categoryOf(input.subtype) !== input.category) {
      throw new DomainError('INCONSISTENT_CLASSIFICATION', `El subtipo ${input.subtype} no pertenece a la categoría ${input.category}`, {
        expectedCategory: categoryOf(input.subtype),
      });
    }
    assertTransition(this.props.state, 'TRIAGED');

    const priority = rules.priorityFloor ? highestPriority(input.priority, rules.priorityFloor) : input.priority;
    const routing = decideRoute({ category: input.category, subtype: input.subtype, priority, confidence: input.confidence, rules });

    this.props.classification = {
      category: input.category,
      subtype: input.subtype,
      priority,
      llmPriority: input.priority,
      confidence: input.confidence,
      service: requireText('service', input.service),
      rationale: requireText('rationale', input.rationale),
      rulesSubtype: rules.subtype,
    };
    this.props.routing = routing;
    this.props.slaDueAt = resolutionDueAt(priority, this.props.createdAt);
    this.changeState('TRIAGED', input.agent, `${input.subtype} ${priority} → ${routing.rule}`, { routing, rulesSubtype: rules.subtype }, now, 'CLASSIFIED');
    return routing;
  }

  handoff(input: { from: Agent; to: Agent; reason: string }, now: Date): void {
    if (this.props.state === 'NEW') throw new DomainError('NOT_CLASSIFIED', 'El ticket debe clasificarse antes de delegarse');
    assertHandoffAllowed({
      owner: this.props.owner,
      from: input.from,
      to: input.to,
      visited: ['triage', ...this.props.handoffs.map((h) => h.to)],
      routedTo: this.props.routing?.to ?? null,
    });
    const reason = requireText('reason', input.reason);
    this.props.handoffs.push({ from: input.from, to: input.to, reason, at: now });
    this.props.owner = input.to;

    // Al recibir el ticket, diagnostics lo pone en diagnóstico. Escalation lo deja como está
    // hasta que ejecute el escalamiento (necesita cola, motivo y mensaje).
    if (input.to === 'diagnostics' && this.props.state !== 'IN_DIAGNOSIS') {
      this.changeState('IN_DIAGNOSIS', input.from, `Handoff a diagnostics: ${reason}`, { from: input.from, to: input.to }, now, 'HANDOFF');
    } else {
      this.record('HANDOFF', input.from, this.props.state, this.props.state, reason, { from: input.from, to: input.to }, now);
    }
  }

  /** Evidencia producida por otros módulos (diagnósticos, remediaciones). */
  addEvidence(input: Omit<Evidence, 'id' | 'at'>, now: Date): void {
    if (this.props.state !== 'IN_DIAGNOSIS' || this.props.owner !== 'diagnostics') {
      throw new DomainError('WRONG_STAGE', 'Solo se registra evidencia en IN_DIAGNOSIS con owner diagnostics');
    }
    this.props.evidence.push({ ...input, reference: requireText('reference', input.reference), at: now });
    this.record('EVIDENCE_ADDED', 'diagnostics', this.props.state, this.props.state, input.summary, { reference: input.reference, kind: input.kind, verified: input.verified }, now);
  }

  setPendingUser(input: { agent: Agent; reason: string; userMessage: string }, isSensitive: SensitiveCheck, now: Date): void {
    this.assertOwner(input.agent);
    this.props.userMessage = this.safeUserMessage(input.userMessage, isSensitive);
    this.changeState('PENDING_USER', input.agent, requireText('reason', input.reason), {}, now);
  }

  escalate(input: { agent: Agent; queue: Queue; reason: string; userMessage: string }, isSensitive: SensitiveCheck, now: Date): void {
    this.assertOwner(input.agent);
    if (input.agent !== 'escalation') throw new DomainError('NOT_ALLOWED', 'Solo el agente escalation puede escalar; primero haz el handoff');
    const reason = requireText('reason', input.reason);
    this.props.userMessage = this.safeUserMessage(input.userMessage, isSensitive);
    this.props.escalation = { queue: input.queue, reason };
    this.changeState('ESCALATED', input.agent, reason, { queue: input.queue }, now);
  }

  /**
   * Solo resuelve con evidencia verificada registrada en el propio ticket.
   * El agente no puede declarar la evidencia: se busca aquí.
   */
  resolve(input: { agent: Agent; summary: string; userMessage: string }, isSensitive: SensitiveCheck, now: Date): Evidence {
    this.assertOwner(input.agent);
    // Un diagnóstico informa; solo una acción con verificación posterior prueba que se resolvió.
    const evidence = [...this.props.evidence].reverse().find((e) => e.kind === 'ACTION' && e.verified);
    if (!evidence) throw new DomainError('NOT_VERIFIED', 'No hay una acción verificada: el ticket no puede resolverse, debe escalarse');
    const summary = requireText('summary', input.summary);
    this.props.userMessage = this.safeUserMessage(input.userMessage, isSensitive);
    this.props.resolution = { summary, evidenceReference: evidence.reference };
    this.changeState('RESOLVED', input.agent, summary, { evidence: evidence.reference }, now);
    return evidence;
  }

  close(input: { agent: Agent; reason: string }, now: Date): void {
    this.assertOwner(input.agent);
    const reason = requireText('reason', input.reason);
    this.props.closureReason = reason;
    this.changeState('CLOSED', input.agent, reason, {}, now);
  }

  // ---------- Internos ----------

  private assertOwner(agent: Agent): void {
    if (agent !== this.props.owner) {
      throw new DomainError('NOT_OWNER', `El ticket pertenece a "${this.props.owner}", no a "${agent}"`);
    }
  }

  private safeUserMessage(message: string, isSensitive: SensitiveCheck): string {
    const text = requireText('userMessage', message);
    if (isSensitive(text)) throw new DomainError('SENSITIVE_OUTPUT', 'El mensaje al usuario contiene datos personales o secretos');
    return text;
  }

  private changeState(
    to: TicketState,
    actor: Agent,
    reason: string,
    data: Record<string, unknown>,
    now: Date,
    type: TicketEventType = to as TicketEventType,
  ): void {
    const from = this.props.state;
    assertTransition(from, to);
    this.props.state = to;
    this.record(type, actor, from, to, reason, data, now);
  }

  private record(type: TicketEventType, actor: TicketEvent['actor'], fromState: TicketState | null, toState: TicketState, reason: string, data: Record<string, unknown>, at: Date): void {
    this.props.updatedAt = at;
    this.pendingEvents.push({ type, actor, fromState, toState, reason, data, at });
  }
}

