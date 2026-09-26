import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { toolHandler } from '../../../shared/presentation/mcp/tool-response';
import { TicketCode } from '../../tickets/domain/ticket-code';
import { REMEDIATION_ACTIONS } from '../domain/policies/remediation.policy';
import type { UsersModule } from '../users.module';

const code = z.string().regex(TicketCode.PATTERN).describe('Código del ticket, p. ej. T-0001');

export function registerUserTools(server: McpServer, uc: UsersModule['useCases']): void {
  server.registerTool(
    'users_account_status',
    {
      title: 'Estado de la cuenta afectada',
      description: 'Muestra el estado de la cuenta del usuario afectado por el ticket (sin datos personales) y qué acciones de remediación serían aplicables.',
      inputSchema: z.object({ code }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    toolHandler((i) => uc.status.execute(i)),
  );

  server.registerTool(
    'users_remediate',
    {
      title: 'Remediar cuenta',
      description:
        'Ejecuta UNA acción de la lista blanca sobre la cuenta afectada (unlock_account o send_reset_link). Valida precondiciones, verifica el resultado y lo adjunta al ticket como evidencia. Cada acción solo se intenta una vez por ticket; si el resultado no es DONE, escala.',
      inputSchema: z.object({
        code,
        agent: z.literal('diagnostics').describe('Solo el agente diagnostics puede remediar'),
        action: z.enum(REMEDIATION_ACTIONS),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    toolHandler((i) => uc.remediate.execute(i)),
  );
}
