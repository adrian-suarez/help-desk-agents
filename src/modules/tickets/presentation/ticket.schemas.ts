import * as z from 'zod/v4';
import { AGENTS, CATEGORIES, CHANNELS, PRIORITIES, QUEUES, SUBTYPES, TICKET_STATES } from '../domain/ticket.constants';
import { TicketCode } from '../domain/ticket-code';

/**
 * Validación de entrada (primera barrera). Los z.enum salen del dominio: si el LLM
 * envía un valor fuera de la lista, el SDK rechaza la llamada antes de llegar al caso de uso.
 * Las descripciones de cada campo las lee el modelo para saber qué enviar.
 */
const code = z.string().regex(TicketCode.PATTERN).describe('Código del ticket, p. ej. T-0001');
const agent = z.enum(AGENTS).describe('Agente que ejecuta la acción; debe ser el dueño actual del ticket');
const shortText = (max: number, what: string) => z.string().trim().min(3).max(max).describe(what);
const userMessage = shortText(600, 'Mensaje final para el usuario: claro, sin jerga técnica y sin datos personales ni credenciales');

export const CreateTicketSchema = z.object({
  description: shortText(2000, 'Texto del usuario tal como llegó; el servidor redacta los datos sensibles antes de guardarlo'),
  reporter: z.string().trim().max(80).optional().describe('Usuario de red del reportante (se guarda seudonimizado)'),
  channel: z.enum(CHANNELS).default('chat'),
});

export const ClassifyTicketSchema = z.object({
  code,
  agent,
  category: z.enum(CATEGORIES).describe('ACCESS_IDENTITY | INFRA_SOFTWARE | PROVISIONING'),
  subtype: z.enum(SUBTYPES).describe('Debe pertenecer a la categoría elegida'),
  priority: z.enum(PRIORITIES).describe('P1 impacto amplio y urgente · P2 amplio o urgente · P3 individual · P4 solicitud planificada'),
  confidence: z.number().min(0).max(1).describe('Qué tan seguro estás de la clasificación (0 a 1)'),
  service: shortText(60, 'Servicio afectado, p. ej. VPN, SAP, Correo'),
  rationale: shortText(300, 'Justificación breve de la clasificación'),
});

export const HandoffTicketSchema = z.object({
  code,
  agent,
  to: z.enum(AGENTS).describe('Agente destino; desde triage debe coincidir con routing.to'),
  reason: shortText(200, 'Motivo del traspaso (p. ej. la regla de enrutamiento o el código de error)'),
});

export const GetTicketSchema = z.object({
  code,
  includeHistory: z.boolean().default(false).describe('Incluir la bitácora de decisiones'),
});

export const ListTicketsSchema = z.object({
  states: z.array(z.enum(TICKET_STATES)).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const SetPendingSchema = z.object({ code, agent, reason: shortText(200, 'Por qué se espera al usuario'), userMessage });

export const EscalateTicketSchema = z.object({
  code,
  agent,
  queue: z.enum(QUEUES).describe('Cola humana destino'),
  reason: shortText(300, 'Resumen técnico para el especialista'),
  userMessage,
});

export const ResolveTicketSchema = z.object({ code, agent, summary: shortText(300, 'Qué se hizo para resolverlo'), userMessage });

export const CloseTicketSchema = z.object({ code, agent, reason: shortText(200, 'Motivo del cierre') });
