import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { toolHandler } from '../../../shared/presentation/mcp/tool-response';
import { TicketCode } from '../../tickets/domain/ticket-code';
import type { DiagnosticsModule } from '../diagnostics.module';

export function registerDiagnosticTools(server: McpServer, uc: DiagnosticsModule['useCases']): void {
  server.registerTool(
    'diagnostics_run',
    {
      title: 'Ejecutar diagnóstico de conectividad',
      description:
        'Ejecuta la skill diagnostico-conectividad (DNS, gateway VPN, salud y latencia de servicios) para un ticket VPN_CONNECTIVITY o PERFORMANCE en IN_DIAGNOSIS. El objetivo se deduce del subtipo. Reintenta una vez si el script falla. Devuelve el diagnóstico y el siguiente paso exacto en "next".',
      inputSchema: z.object({
        code: z.string().regex(TicketCode.PATTERN),
        agent: z.literal('diagnostics'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    toolHandler((i) => uc.run.execute(i)),
  );
}
