import type { Queue } from '../../tickets/domain/ticket.constants';

export const DIAGNOSTIC_TARGETS = ['vpn', 'services'] as const;
export type DiagnosticTarget = (typeof DIAGNOSTIC_TARGETS)[number];

export const DIAGNOSES = ['INFRA_OK_CLIENT_SIDE', 'SERVICE_DEGRADED', 'GATEWAY_UNREACHABLE', 'DNS_RESOLUTION_FAILED', 'DIAGNOSTIC_TOOL_UNAVAILABLE'] as const;
export type Diagnosis = (typeof DIAGNOSES)[number];

export const RUN_STATUSES = ['ok', 'issues', 'unavailable'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

/** El objetivo lo determina el subtipo, no el modelo. */
export const TARGET_BY_SUBTYPE: Readonly<Record<string, DiagnosticTarget>> = {
  VPN_CONNECTIVITY: 'vpn',
  PERFORMANCE: 'services',
};

/** 1 ejecución + 1 reintento si el recurso auxiliar falla. */
export const MAX_ATTEMPTS = 2;
/** Evita que el agente repita el diagnóstico en bucle. */
export const MAX_RUNS_PER_TICKET = 2;

export type NextStep =
  | { action: 'SET_PENDING'; reason: Diagnosis; userMessage: string }
  | { action: 'ESCALATE'; reason: Diagnosis; queue: Queue; userMessage: string };

/** Tabla de decisión: mismo diagnóstico ⇒ mismo siguiente paso. Los mensajes ya están redactados sin jerga. */
export const NEXT_STEP: Readonly<Record<Diagnosis, NextStep>> = {
  INFRA_OK_CLIENT_SIDE: {
    action: 'SET_PENDING',
    reason: 'INFRA_OK_CLIENT_SIDE',
    userMessage:
      'Revisamos los servicios de conexión y funcionan con normalidad. Para terminar: 1) cierra por completo la aplicación de conexión remota, 2) reinicia tu equipo, 3) vuelve a conectarte. Si sigue fallando, responde a este mensaje.',
  },
  SERVICE_DEGRADED: {
    action: 'ESCALATE',
    reason: 'SERVICE_DEGRADED',
    queue: 'N2-Infraestructura',
    userMessage: 'Detectamos lentitud en uno de nuestros servicios internos. Un especialista ya está trabajando en ello y te avisaremos cuando se normalice.',
  },
  GATEWAY_UNREACHABLE: {
    action: 'ESCALATE',
    reason: 'GATEWAY_UNREACHABLE',
    queue: 'N2-Redes',
    userMessage: 'Encontramos una falla en el servicio de conexión remota que no depende de tu equipo. El equipo de redes ya fue notificado.',
  },
  DNS_RESOLUTION_FAILED: {
    action: 'ESCALATE',
    reason: 'DNS_RESOLUTION_FAILED',
    queue: 'N2-Redes',
    userMessage: 'Encontramos un problema en la red corporativa que impide localizar algunos servicios. El equipo de redes ya fue notificado.',
  },
  DIAGNOSTIC_TOOL_UNAVAILABLE: {
    action: 'ESCALATE',
    reason: 'DIAGNOSTIC_TOOL_UNAVAILABLE',
    queue: 'N2-Infraestructura',
    userMessage: 'Estamos revisando tu caso. Un especialista lo atenderá personalmente y te contactará pronto.',
  },
};
