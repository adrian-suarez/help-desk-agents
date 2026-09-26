---
name: atender-diagnostico
description: Ejecutar bajo demanda el diagnóstico o la remediación de un ticket delegado a diagnostics.
agent: diagnostics
tools: ['helpdesk/tickets_get', 'helpdesk/diagnostics_run', 'helpdesk/users_account_status', 'helpdesk/users_remediate', 'helpdesk/tickets_set_pending', 'helpdesk/tickets_resolve', 'helpdesk/tickets_handoff']
argument-hint: Código del ticket
---
Atiende el ticket **${input:codigo:T-0001}**.

1. Consulta el ticket con #tool:helpdesk/tickets_get y verifica que esté en IN_DIAGNOSIS con dueño diagnostics.
2. Según el subtipo, sigue paso a paso la skill `diagnostico-conectividad` (#tool:helpdesk/diagnostics_run) o `remediacion-cuentas` (#tool:helpdesk/users_account_status y #tool:helpdesk/users_remediate).
3. Aplica el `next` de la respuesta.
4. Informa al operador: herramientas ejecutadas, referencias de evidencia (`DIAG-…`, `ACT-…`), estado final y mensaje para el usuario.
