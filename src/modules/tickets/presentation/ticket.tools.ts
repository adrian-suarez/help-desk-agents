import type { McpServer } from '@modelcontextprotocol/server';
import { toolHandler } from '../../../shared/presentation/mcp/tool-response';
import type { TicketsModule } from '../tickets.module';
import {
  ClassifyTicketSchema,
  CloseTicketSchema,
  CreateTicketSchema,
  EscalateTicketSchema,
  GetTicketSchema,
  HandoffTicketSchema,
  ListTicketsSchema,
  ResolveTicketSchema,
  SetPendingSchema,
} from './ticket.schemas';

/**
 * Adaptador de entrada MCP. Solo traduce: valida con el esquema, llama al caso de uso
 * y convierte el resultado. No contiene reglas de negocio.
 *
 * Una herramienta por acción permite asignar a cada agente solo las suyas en su .agent.md:
 *   triage      → tickets_create, tickets_classify, tickets_handoff, tickets_get
 *   diagnostics → tickets_get, tickets_handoff, tickets_set_pending, tickets_resolve, tickets_close
 *   escalation  → tickets_get, tickets_escalate, tickets_list
 */
export function registerTicketTools(server: McpServer, uc: TicketsModule['useCases']): void {
  const readOnly = { readOnlyHint: true, openWorldHint: false } as const;
  const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

  server.registerTool(
    'tickets_create',
    { title: 'Crear ticket', description: 'Registra un ticket nuevo. Redacta credenciales y datos personales antes de guardar. Devuelve el código.', inputSchema: CreateTicketSchema, annotations: write },
    toolHandler((i) => uc.create.execute(i)),
  );

  server.registerTool(
    'tickets_classify',
    {
      title: 'Clasificar ticket',
      description: 'Registra tu clasificación (categoría, subtipo, prioridad, confianza). El servidor la contrasta con reglas y decide el enrutamiento; sigue el campo "next" de la respuesta.',
      inputSchema: ClassifyTicketSchema,
      annotations: write,
    },
    toolHandler((i) => uc.classify.execute(i)),
  );

  server.registerTool(
    'tickets_handoff',
    { title: 'Traspasar ticket', description: 'Delega el ticket a otro agente. Solo el dueño actual puede hacerlo; no se permiten ciclos.', inputSchema: HandoffTicketSchema, annotations: write },
    toolHandler((i) => uc.handoff.execute(i)),
  );

  server.registerTool(
    'tickets_get',
    { title: 'Consultar ticket', description: 'Devuelve el estado actual del ticket, su clasificación, evidencia y opcionalmente la bitácora.', inputSchema: GetTicketSchema, annotations: readOnly },
    toolHandler((i) => uc.get.execute(i)),
  );

  server.registerTool(
    'tickets_list',
    { title: 'Listar tickets', description: 'Lista tickets ordenados por vencimiento de SLA, indicando si están vencidos.', inputSchema: ListTicketsSchema, annotations: readOnly },
    toolHandler((i) => uc.list.execute(i)),
  );

  server.registerTool(
    'tickets_set_pending',
    { title: 'Esperar al usuario', description: 'Pasa el ticket a PENDING_USER con pasos claros para el usuario.', inputSchema: SetPendingSchema, annotations: write },
    toolHandler((i) => uc.setPending.execute(i)),
  );

  server.registerTool(
    'tickets_escalate',
    { title: 'Escalar a humano', description: 'Envía el ticket a una cola humana. Solo el agente escalation.', inputSchema: EscalateTicketSchema, annotations: write },
    toolHandler((i) => uc.escalate.execute(i)),
  );

  server.registerTool(
    'tickets_resolve',
    {
      title: 'Resolver ticket',
      description: 'Marca el ticket como resuelto. Solo funciona si existe evidencia verificada registrada por el servidor; si responde NOT_VERIFIED, escala.',
      inputSchema: ResolveTicketSchema,
      annotations: write,
    },
    toolHandler((i) => uc.resolve.execute(i)),
  );

  server.registerTool(
    'tickets_close',
    { title: 'Cerrar ticket', description: 'Cierra un ticket resuelto o sin respuesta del usuario.', inputSchema: CloseTicketSchema, annotations: write },
    toolHandler((i) => uc.close.execute(i)),
  );
}
