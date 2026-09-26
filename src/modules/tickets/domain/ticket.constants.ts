/**
 * Vocabulario cerrado del dominio. Es la única fuente de verdad: de aquí salen
 * los enums de la base de datos y los z.enum de las herramientas MCP, así que
 * el LLM no puede inventar un estado, una categoría ni una cola.
 */
export const TICKET_STATES = ['NEW', 'TRIAGED', 'IN_DIAGNOSIS', 'PENDING_USER', 'ESCALATED', 'RESOLVED', 'CLOSED'] as const;
export type TicketState = (typeof TICKET_STATES)[number];

export const AGENTS = ['triage', 'diagnostics', 'escalation'] as const;
export type Agent = (typeof AGENTS)[number];

export const PRIORITIES = ['P1', 'P2', 'P3', 'P4'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CHANNELS = ['chat', 'email', 'phone'] as const;
export type Channel = (typeof CHANNELS)[number];

export const QUEUES = ['N1-Humano', 'N2-Guardia', 'N2-Redes', 'N2-Infraestructura', 'Aprovisionamiento'] as const;
export type Queue = (typeof QUEUES)[number];

export const TAXONOMY = {
  ACCESS_IDENTITY: ['ACCOUNT_LOCKED', 'PASSWORD_RESET', 'MFA_ISSUE', 'ACCOUNT_DISABLED'],
  INFRA_SOFTWARE: ['VPN_CONNECTIVITY', 'PERFORMANCE', 'APP_INCIDENT'],
  PROVISIONING: ['FOLDER_REPO_ACCESS', 'LICENSE_REQUEST', 'PROFILE_CHANGE'],
} as const;

export type Category = keyof typeof TAXONOMY;
export type Subtype = (typeof TAXONOMY)[Category][number];

export const CATEGORIES = Object.keys(TAXONOMY) as [Category, ...Category[]];
export const SUBTYPES = Object.values(TAXONOMY).flat() as [Subtype, ...Subtype[]];

/** Subtipos con un procedimiento automatizado y seguro (skill o acción de remediación). */
export const AUTOMATABLE_SUBTYPES: ReadonlySet<Subtype> = new Set(['ACCOUNT_LOCKED', 'PASSWORD_RESET', 'VPN_CONNECTIVITY', 'PERFORMANCE']);

export function categoryOf(subtype: Subtype): Category {
  return CATEGORIES.find((c) => (TAXONOMY[c] as readonly string[]).includes(subtype))!;
}
