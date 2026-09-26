---
name: remediacion-cuentas
description: Auto-remediación segura de cuentas. Desbloqueo por intentos fallidos y envío de enlace de restablecimiento por autoservicio. Úsala cuando un ticket en IN_DIAGNOSIS tenga subtipo ACCOUNT_LOCKED o PASSWORD_RESET ("mi cuenta está bloqueada", "olvidé mi contraseña", "demasiados intentos"). Nunca para MFA, cuentas deshabilitadas ni bloqueos de seguridad.
---
# Skill: remediación de cuentas

Las acciones están en una lista blanca del servidor. Cada una tiene una **precondición** (solo se ejecuta si la cuenta está en el estado esperado) y una **verificación posterior**, cuyo resultado es la evidencia que permite resolver el ticket.

## Procedimiento
1. `tickets_get`: confirma `IN_DIAGNOSIS`, dueño `diagnostics` y subtipo ACCOUNT_LOCKED o PASSWORD_RESET.
2. `users_account_status`: revisa `applicableActions`. Si la acción tiene `blockedBy`, no la ejecutes: escala con ese motivo.
3. Elige la acción:

   | Subtipo | Acción |
   |---|---|
   | ACCOUNT_LOCKED | `unlock_account` |
   | PASSWORD_RESET | `send_reset_link` |

4. `users_remediate` con `{ code, agent: "diagnostics", action }`.
5. Según `outcome`:
   - `DONE`: `tickets_resolve` con un resumen y un mensaje claro. Si el usuario compartió su contraseña al crear el ticket, recomiéndale cambiarla.
   - Si era ACCOUNT_LOCKED y el usuario además olvidó su contraseña, ejecuta también `send_reset_link` antes de resolver.
   - `PRECONDITION_FAILED`, `ACCOUNT_NOT_FOUND`, `NOT_APPLICABLE` o `POSTCHECK_FAILED`: ejecuta `next` (traspaso a escalation con ese código).

## Reglas
- Nunca pidas, leas, sugieras ni fijes una contraseña. El usuario la define en el portal de autoservicio.
- No reintentes una acción que falló ni pruebes otra para "forzar" el resultado: el servidor lo impide (`ALREADY_ATTEMPTED`).
- Un bloqueo de seguridad (`security_hold`) siempre lo revisa un humano.
