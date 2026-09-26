import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { toolHandler } from '../../../shared/presentation/mcp/tool-response';
import { TicketCode } from '../../tickets/domain/ticket-code';
import type { AuditModule } from '../audit.module';

export function registerAuditTools(server: McpServer, uc: AuditModule['useCases']): void {
  const readOnly = { readOnlyHint: true, openWorldHint: false } as const;

  server.registerTool(
    'audit_timeline',
    {
      title: 'Bitácora del ticket',
      description: 'Línea de tiempo auditable del ticket: cambios de estado, handoffs, diagnósticos (DIAG-…) y remediaciones (ACT-…), con actor y motivo.',
      inputSchema: z.object({ code: z.string().regex(TicketCode.PATTERN) }),
      annotations: readOnly,
    },
    toolHandler((i) => uc.timeline.execute(i)),
  );

  server.registerTool(
    'audit_recent',
    {
      title: 'Actividad reciente',
      description: 'Últimas decisiones registradas en todos los tickets.',
      inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(20) }),
      annotations: readOnly,
    },
    toolHandler((i) => uc.recent.execute(i)),
  );
}
