---
name: ticket-desde-seleccion
description: Crear un ticket a partir del correo o texto seleccionado en el editor.
agent: triage
tools: ['helpdesk/tickets_create', 'helpdesk/tickets_classify', 'helpdesk/tickets_handoff']
---
El operador seleccionó este texto en el editor (un correo de un usuario):

```
${selection}
```

Remitente (usuario de red): ${input:reportante:p. ej. lrodriguez}

Si la selección está vacía, pide al operador que seleccione el texto y detente.
Si no, crea el ticket con #tool:helpdesk/tickets_create usando `channel: "email"`, clasifícalo con #tool:helpdesk/tickets_classify y delega con #tool:helpdesk/tickets_handoff. Termina con el acuse de recibo para el usuario.
