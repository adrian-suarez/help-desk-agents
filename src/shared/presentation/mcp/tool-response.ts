import { DomainError } from '../../domain/domain-error';

type TextContent = { type: 'text'; text: string };
export interface ToolResponse {
  [key: string]: unknown;
  content: TextContent[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/**
 * Adapta un caso de uso al formato de respuesta MCP.
 *  - Éxito: { ok: true, ...datos } como texto JSON y como structuredContent.
 *  - DomainError: isError=true con código y mensaje para que el agente aplique sus reglas.
 *  - Error inesperado: se registra en stderr y al agente solo le llega un mensaje genérico.
 */
export function toolHandler<I>(fn: (input: I) => Promise<Record<string, unknown>>) {
  return async (input: I): Promise<ToolResponse> => {
    try {
      const data = { ok: true, ...(await fn(input)) };
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data };
    } catch (error) {
      const body =
        error instanceof DomainError
          ? { ok: false, code: error.code, message: error.message, ...(error.details && { details: error.details }) }
          : { ok: false, code: 'INTERNAL_ERROR', message: 'Error interno del servidor de soporte' };
      if (!(error instanceof DomainError)) console.error('[helpdesk] error inesperado:', error);
      return { isError: true, content: [{ type: 'text', text: JSON.stringify(body, null, 2) }], structuredContent: body };
    }
  };
}
