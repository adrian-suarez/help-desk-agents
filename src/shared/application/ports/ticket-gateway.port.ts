/**
 * Contrato con el que los módulos users y diagnostics consultan tickets y registran evidencia.
 * Dependen de esta interfaz, no del módulo tickets: el acoplamiento entre módulos queda explícito y mínimo.
 */
export interface TicketContext {
  code: string;
  state: string;
  owner: string;
  subtype: string | null;
  affectedUserRef: string | null;
}

export interface EvidenceInput {
  code: string;
  kind: 'DIAGNOSTIC' | 'ACTION';
  reference: string;
  verified: boolean;
  summary: string;
  data: Record<string, unknown>;
}

export interface TicketGateway {
  getContext(code: string): Promise<TicketContext>;
  addEvidence(input: EvidenceInput): Promise<void>;
}
