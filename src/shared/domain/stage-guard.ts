import { DomainError } from './domain-error';
import type { TicketContext } from '../application/ports/ticket-gateway.port';

/** Los módulos de diagnóstico y remediación solo actúan sobre tickets en diagnóstico y de su agente. */
export function assertDiagnosticStage(ctx: TicketContext, agent: string): void {
  if (agent !== 'diagnostics') throw new DomainError('NOT_ALLOWED', 'Solo el agente diagnostics puede ejecutar esta acción');
  if (ctx.state !== 'IN_DIAGNOSIS' || ctx.owner !== 'diagnostics') {
    throw new DomainError('WRONG_STAGE', `El ticket debe estar en IN_DIAGNOSIS con owner diagnostics (actual: ${ctx.state}/${ctx.owner})`);
  }
}
