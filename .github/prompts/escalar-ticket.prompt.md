---
name: escalar-ticket
description: Escalar a una cola humana un ticket ya delegado a escalation.
agent: escalation
tools: ['helpdesk/tickets_get', 'helpdesk/audit_timeline', 'helpdesk/tickets_escalate']
argument-hint: Código del ticket y cola
---
Escala el ticket **${input:codigo:T-0001}** a la cola **${input:cola:N1-Humano, N2-Guardia, N2-Redes, N2-Infraestructura o Aprovisionamiento}**.
Motivo indicado por el operador: ${input:motivo:Motivo del escalamiento}

1. Revisa el caso con #tool:helpdesk/tickets_get y #tool:helpdesk/audit_timeline.
2. Si el dueño no es `escalation`, detente e indica al operador que use el botón **Escalar a atención humana** desde el agente dueño actual: tú no puedes tomar el ticket.
3. Escala con #tool:helpdesk/tickets_escalate.
4. Entrega el resumen de escalamiento definido en tus instrucciones.
