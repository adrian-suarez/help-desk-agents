---
applyTo: "**"
description: Ciclo de vida del ticket. Estados, transiciones permitidas, campos obligatorios y cuándo un caso está resuelto.
---
# Ciclo de vida de los tickets

El servidor `helpdesk` implementa estas reglas (`src/modules/tickets/domain`). Esta guía explica cómo cumplirlas; si algo difiere, manda el servidor.

## Estados y transiciones

| Desde | Hacia | Herramienta | Quién |
|---|---|---|---|
| NEW | TRIAGED | `tickets_classify` | triage |
| TRIAGED | IN_DIAGNOSIS | `tickets_handoff` a diagnostics | triage |
| TRIAGED | ESCALATED | `tickets_handoff` a escalation + `tickets_escalate` | triage → escalation |
| IN_DIAGNOSIS | PENDING_USER | `tickets_set_pending` | diagnostics |
| IN_DIAGNOSIS | RESOLVED | `tickets_resolve` | diagnostics |
| IN_DIAGNOSIS | ESCALATED | `tickets_handoff` a escalation + `tickets_escalate` | diagnostics → escalation |
| PENDING_USER | CLOSED | `tickets_close` (sin respuesta del usuario) | diagnostics |
| ESCALATED | RESOLVED | fuera del sistema de agentes (especialista humano) | humano |
| RESOLVED | CLOSED | `tickets_close` | dueño actual |

Cualquier otra transición se rechaza con `INVALID_TRANSITION`.

## Campos obligatorios en cada cambio
- **Toda escritura:** `agent` (debe ser el dueño actual del ticket, o el servidor responde `NOT_OWNER`).
- **TRIAGED:** `category`, `subtype` (de esa categoría), `priority`, `confidence` (0 a 1), `service`, `rationale`. El servidor calcula el SLA y el enrutamiento.
- **Traspaso (`tickets_handoff`):** `to` y `reason`. Desde triage, `to` debe ser igual a `routing.to`.
- **PENDING_USER:** `reason` y `userMessage` con los pasos que debe seguir el usuario.
- **ESCALATED:** `queue` (lista cerrada), `reason` para el especialista y `userMessage`.
- **RESOLVED:** `summary` y `userMessage`.
- **CLOSED:** `reason`.

Todo `userMessage` se rechaza si contiene datos personales o credenciales (`SENSITIVE_OUTPUT`).

## Cuándo un caso está resuelto
`tickets_resolve` solo funciona si el ticket tiene una **acción de remediación verificada** (`ACT-…` con `verified: true`), registrada por el servidor al ejecutar `users_remediate`. No puedes declarar la evidencia.

- Un diagnóstico (`DIAG-…`) informa, pero **no resuelve**: si la infraestructura está bien, el problema está del lado del usuario, así que el ticket va a `PENDING_USER`.
- Si `tickets_resolve` responde `NOT_VERIFIED`, el caso se escala.

## Bitácora
Cada cambio queda registrado automáticamente con actor, estado anterior, estado nuevo y motivo, en tablas que la base de datos no permite modificar. Escribe motivos concretos: el código de la regla o del resultado (`R5_AUTOMATABLE`, `PRECONDITION_FAILED`, `GATEWAY_UNREACHABLE`).
