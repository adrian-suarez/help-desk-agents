---
name: reporte-sla
description: Reporte de tickets abiertos y riesgo de incumplimiento del SLA.
agent: escalation
tools: ['helpdesk/tickets_list']
---
Usa #tool:helpdesk/tickets_list con los estados TRIAGED, IN_DIAGNOSIS, PENDING_USER y ESCALATED.

Presenta una tabla ordenada por vencimiento con: código, estado, dueño, prioridad, subtipo y vencimiento. Marca con ⚠️ los que tengan `slaBreached: true` o venzan en menos de ${input:horas:2} horas.

Termina con un máximo de 3 recomendaciones de priorización. No ejecutes ninguna otra herramienta ni modifiques tickets.
