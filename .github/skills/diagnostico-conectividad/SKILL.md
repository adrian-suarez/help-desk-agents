---
name: diagnostico-conectividad
description: Diagnóstico paso a paso de la conexión remota (VPN) y de la disponibilidad o lentitud de servicios internos (intranet, inicio de sesión, ERP). Úsala cuando un ticket en IN_DIAGNOSIS tenga subtipo VPN_CONNECTIVITY o PERFORMANCE, o cuando el usuario diga que la VPN no conecta, que FortiClient/AnyConnect/GlobalProtect falla o que un sistema interno está lento o caído. No la uses para contraseñas, MFA ni permisos.
---
# Skill: diagnóstico de conectividad

Procedimiento determinista y de solo lectura. El recurso auxiliar es [scripts/diagnose.mjs](./scripts/diagnose.mjs), configurado con [scripts/targets.json](./scripts/targets.json). No lo ejecutas tú: lo ejecuta el servidor `helpdesk` cuando llamas a `diagnostics_run`, con tiempo límite y reintento, y deja el resultado en la bitácora.

## Criterios de activación
- ✅ `state: IN_DIAGNOSIS`, `owner: diagnostics` y `subtype` ∈ {VPN_CONNECTIVITY, PERFORMANCE}.
- ❌ Cualquier otro caso: no la uses. Para cuentas está la skill `remediacion-cuentas`; para lo demás, escala.

## Procedimiento

### Paso 1: verificar precondiciones
Llama a `tickets_get` y confirma estado, dueño y subtipo. Si no cumplen, detente e informa el motivo.

### Paso 2: ejecutar el diagnóstico
Llama a `diagnostics_run` con `{ code, agent: "diagnostics" }`. El objetivo lo deduce el servidor del subtipo (VPN_CONNECTIVITY → `vpn`, PERFORMANCE → `services`). El script comprueba en orden la resolución de nombres, la conexión al gateway y la salud y latencia de cada servicio.

### Paso 3: interpretar con la tabla de decisión
Usa solo `diagnosis` y `next` de la respuesta:

| diagnosis | Significado | Siguiente paso |
|---|---|---|
| `INFRA_OK_CLIENT_SIDE` | Los servicios están sanos; el problema está en el equipo del usuario | `tickets_set_pending` con el mensaje recomendado |
| `SERVICE_DEGRADED` | Un servicio responde lento o con error | traspaso a escalation (cola N2-Infraestructura) |
| `GATEWAY_UNREACHABLE` | El gateway de conexión remota no responde | traspaso a escalation (cola N2-Redes) |
| `DNS_RESOLUTION_FAILED` | No se resuelven los nombres corporativos | traspaso a escalation (cola N2-Redes) |
| `DIAGNOSTIC_TOOL_UNAVAILABLE` | El recurso auxiliar falló | ver "Manejo de fallos" |

### Paso 4: aplicar el siguiente paso
Ejecuta la herramienta de `next` con sus `args` tal cual. Si fue un traspaso, ofrece el botón **Escalar a atención humana**.

## Manejo de fallos del recurso auxiliar
El script usa códigos de salida explícitos: `0` sin problemas, `1` problemas detectados (resultado **válido**), `2` error de configuración, `3` tiempo límite interno agotado. El servidor, además, corta el proceso si supera su propio tiempo límite.

1. Si el script falla (código 2 o 3, proceso colgado, JSON inválido o archivo inexistente), el servidor **reintenta una vez** automáticamente.
2. Si vuelve a fallar, responde `diagnosis: "DIAGNOSTIC_TOOL_UNAVAILABLE"` con los intentos en `failures`, y `next` indica el traspaso a escalation.
3. En ese caso:
   - **no inventes ni supongas** un diagnóstico;
   - no vuelvas a llamar a `diagnostics_run` (el servidor admite como máximo 2 ejecuciones por ticket);
   - escala con el mensaje neutro recomendado, sin mencionar la herramienta interna.

## Prohibido
- Suponer el estado de la red a partir de lo que cuenta el usuario.
- Resolver el ticket con un diagnóstico: un `DIAG-…` no es evidencia de resolución.
