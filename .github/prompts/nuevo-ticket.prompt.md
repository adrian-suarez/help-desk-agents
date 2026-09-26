---
name: nuevo-ticket
description: Registrar, clasificar y enrutar un ticket nuevo a partir del mensaje del usuario.
agent: triage
tools: ['helpdesk/tickets_create', 'helpdesk/tickets_classify', 'helpdesk/tickets_handoff']
argument-hint: Pega el mensaje del usuario
---
Procesa este ticket de soporte:

- Mensaje del usuario: ${input:descripcion:Pega aquí el mensaje del usuario}
- Usuario de red del reportante: ${input:reportante:p. ej. jperez}
- Canal: ${input:canal:chat, email o phone}

1. Regístralo con #tool:helpdesk/tickets_create.
2. Clasifícalo con #tool:helpdesk/tickets_classify según tus instrucciones.
3. Delega con #tool:helpdesk/tickets_handoff usando exactamente `next.args`.
4. Responde con:
   - una tabla para el operador: código, categoría, subtipo, prioridad, vencimiento del SLA, regla de enrutamiento y destino;
   - el mensaje listo para enviar al usuario.
