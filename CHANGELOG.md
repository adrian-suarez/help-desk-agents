# Registro de cambios

Este archivo sigue el formato de [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [versionado semántico](https://semver.org/lang/es/).
Los pasos para instalar cada versión están en [UPGRADE.md](UPGRADE.md).

## [v1.0.0-RC1] - 2026-09-26

Primera versión candidata. Los cambios aparecen agrupados por componente, en el orden en que se construyeron.

### Añadido

#### 1. Base compartida (`src/shared`)

- Configuración validada con zod (`config/env.ts`): el servidor no arranca si falta `DATABASE_URL` o si `PSEUDONYM_SALT` tiene menos de 16 caracteres.
- Conexión a base de datos (`db/database.ts`) con dos modos: Postgres real (`postgres://…`) y Postgres embebido en memoria (`pglite://memory`), que aplica las migraciones al arrancar.
- `DomainError` y `NotFoundError`: errores de negocio con un `code` estable que el agente usa para decidir el siguiente paso.
- Puertos compartidos: `Clock` (reloj reemplazable en pruebas), `SensitiveDataPort` (redacción y seudonimización) y `TicketGateway` (contrato entre módulos).
- `RegexSensitiveDataAdapter`: redacta credenciales, tokens, correos, teléfonos, tarjetas, documentos y nombres de usuario. Seudonimiza usuarios con HMAC-SHA256 (`usr_xxxxxxxxxxxx`).
- `toolHandler`: adapta cada caso de uso al formato de respuesta MCP (`ok`, `code`, `next`) y oculta los errores internos al agente.
- `assertDiagnosticStage`: impide remediar o diagnosticar fuera de `IN_DIAGNOSIS` o desde un agente que no sea `diagnostics`.

#### 2. Módulo de tickets (`src/modules/tickets`)

- Agregado `Ticket`: es la única vía para cambiar un ticket y registra un evento de bitácora por cada decisión.
- Vocabulario cerrado (`ticket.constants.ts`): 7 estados, 3 agentes, 4 prioridades, 3 canales, 5 colas humanas y una taxonomía de 3 categorías con 10 subtipos.
- Políticas del dominio (`domain/policies`):
  - `lifecycle.policy`: máquina de estados y campos obligatorios;
  - `handoff.policy`: grafo de traspasos sin ciclos, con un máximo de 2 saltos;
  - `routing.policy`: reglas R1 a R6 evaluadas en orden;
  - `sla.policy`: plazos de respuesta y resolución por prioridad.
- Clasificador por reglas (`rule-classifier.ts`): da una segunda opinión sobre el subtipo y puede subir la prioridad ante señales de impacto o urgencia, nunca bajarla.
- Código visible del ticket (`T-0001`) como objeto de valor.
- Repositorios (`infrastructure/repositories`):
  - Drizzle/Postgres, con bloqueo optimista por `version` y con el cambio, los traspasos, la evidencia y los eventos guardados en una sola transacción;
  - en memoria, para las pruebas unitarias.
- Contexto mínimo por destino en cada traspaso: diagnostics no recibe la evidencia ni el historial.
- Resolución condicionada: `tickets_resolve` exige una acción verificada (`ACT-…` con `verified: true`).
- 9 herramientas MCP: `tickets_create`, `tickets_classify`, `tickets_handoff`, `tickets_get`, `tickets_list`, `tickets_set_pending`, `tickets_escalate`, `tickets_resolve` y `tickets_close`.

#### 3. Servidor MCP

- Raíz de composición (`src/app.ts`): conecta los módulos con sus implementaciones y permite sustituir el reloj y el ejecutor de diagnóstico en las pruebas.
- Punto de entrada (`src/main.ts`) con transporte stdio, carga de las cuentas demo en modo memoria y cierre ordenado ante `SIGINT` y `SIGTERM`. Los registros van a stderr para no interferir con el protocolo.
- Registro del servidor `helpdesk` en VS Code (`.vscode/mcp.json`).

#### 4. Módulo de usuarios (`src/modules/users`)

- Directorio simulado de cuentas (`user_accounts`), que solo guarda seudónimos.
- Lista blanca de acciones de remediación (`domain/policies/remediation.policy.ts`): `unlock_account` y `send_reset_link`, cada una con precondición y verificación posterior.
- Un bloqueo por seguridad (`security_hold`) nunca se desbloquea de forma automática.
- Cada acción se intenta una sola vez por ticket (`ALREADY_ATTEMPTED`). Todo intento queda en `account_actions` y en el ticket como evidencia `ACT-{id}`.
- Herramientas `users_account_status` y `users_remediate`.
- Cuentas de demostración: `jperez`, `acastro`, `mgarcia` y `lrodriguez`.

#### 5. Módulo de diagnóstico (`src/modules/diagnostics`)

- Ejecutor del script de la skill como proceso hijo, con tiempo límite configurable (20 s por defecto).
- Un reintento automático. Si el script falla dos veces, la respuesta es `DIAGNOSTIC_TOOL_UNAVAILABLE`, sin inventar un resultado.
- El objetivo del diagnóstico (`vpn` o `services`) se deduce del subtipo, no lo elige el modelo.
- Tabla de decisión `NEXT_STEP`: cada diagnóstico tiene un siguiente paso fijo y un mensaje para el usuario redactado sin jerga.
- Máximo de 2 ejecuciones por ticket. Cada ejecución queda en `diagnostic_runs` y en el ticket como evidencia informativa `DIAG-{id}` (nunca verificada).
- Herramienta `diagnostics_run`.

#### 6. Módulo de auditoría (`src/modules/audit`)

- Modelo de lectura que une eventos del ticket, remediaciones y diagnósticos en una sola línea de tiempo.
- Herramientas `audit_timeline` y `audit_recent`.
- Triggers en la base de datos que vuelven de solo inserción las tablas `ticket_events`, `account_actions` y `diagnostic_runs`.

#### 7. Integración con VS Code (`.github`)

- Custom Instructions:
  - `copilot-instructions.md`, con las reglas globales de uso de herramientas, seguridad y tono;
  - `instructions/ticket-lifecycle.instructions.md`, con estados, transiciones, campos obligatorios y la condición de resuelto.
- Custom Agents: `triage`, `diagnostics` y `escalation`, cada uno con su lista explícita de herramientas y sus traspasos declarados. `escalation` no tiene traspasos de salida.
- Agent Skills:
  - `diagnostico-conectividad`, con un procedimiento de 4 pasos, el script `diagnose.mjs`, la configuración `targets.json` y el manejo de fallos;
  - `remediacion-cuentas`.
- Prompt Files: `nuevo-ticket`, `ticket-desde-seleccion`, `atender-diagnostico`, `escalar-ticket` y `reporte-sla`, con variables `${input:…}` y `${selection}` e invocación de herramientas con `#tool:helpdesk/…`.

#### 8. Herramientas de desarrollo (`tools/`)

- `seed.ts`: carga las cuentas demo (idempotente).
- `demo.ts`: 7 escenarios de punta a punta a través del protocolo MCP.
- `mock-services.mjs`: servicios corporativos simulados, con opciones para provocar fallos (`MOCK_FAIL`, `MOCK_SLOW`, `MOCK_NO_GATEWAY`).

#### 9. Pruebas (`test/`)

- 54 pruebas con `node:test`:
  - unitarias de dominio y casos de uso;
  - de integración sobre PGlite y contra el script real;
  - de punta a punta con un cliente MCP por stdio;
  - de coherencia entre `.github` y el servidor.

#### 10. Base de datos (`drizzle/`)

- `0000_naive_wong.sql`: esquema completo (tickets, traspasos, evidencia, eventos, cuentas, acciones y diagnósticos). Los tipos enumerados se generan a partir de las constantes del dominio.
- `0001_append_only_audit.sql`: migración personalizada con la función `forbid_audit_mutation()` y los triggers de solo inserción.

### Verificación

- `tsc` sin errores, 54 de 54 pruebas y los 7 escenarios de la demo sobre PGlite.
- Preparación con Docker (`postgres:18-alpine`): migraciones y cuentas demo.
- VS Code con GitHub Copilot:
  - el servidor arranca desde `mcp.json` y expone 14 herramientas;
  - `/nuevo-ticket` funciona;
  - aparecen los botones de traspaso;
  - un ticket de VPN recorre triage, diagnostics y escalation hasta la cola `N2-Redes`.
- Capturas en `docs/evidences/`.

---

<p align="center">
  <strong>Adrián Suárez</strong><br/>
  Desarrollador full stack · Líder técnico · Arquitecto de software<br/>
  <a href="mailto:adriansuarezucv@gmail.com">adriansuarezucv@gmail.com</a> · <a href="https://github.com/adrian-suarez">github.com/adrian-suarez</a>
</p>
