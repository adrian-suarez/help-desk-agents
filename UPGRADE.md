# Guía de instalación y actualización

Pasos para poner en marcha cada versión del servidor `helpdesk` y de su integración con VS Code. Los cambios de cada versión están en [CHANGELOG.md](CHANGELOG.md).

## v1.0.0-RC1 - 2026-09-26

Primera versión. No hay datos ni esquemas anteriores que migrar: la instalación parte de cero.

### 1. Requisitos

| Componente | Versión | Uso |
| --- | --- | --- |
| Node.js | 22.12 o superior (probado en 24.15) | Ejecuta el servidor MCP, las pruebas y las herramientas |
| npm | La incluida con Node.js | Instalación de dependencias y scripts |
| Docker con Compose v2 | Reciente | Postgres 18. Opcional si se usa el modo en memoria |
| VS Code con GitHub Copilot | Con soporte de MCP, agentes personalizados y skills | Interfaz de los agentes |

Puertos locales que deben estar libres:

| Puerto | Servicio |
| --- | --- |
| 5432 | Postgres (Docker) |
| 18080 | Servicios corporativos simulados (HTTP) |
| 10443 | Gateway VPN simulado (TCP) |

### 2. Variables de entorno

Se definen en `.env`, en la raíz del proyecto. La plantilla es `.env.example`. El servidor las valida al arrancar y se detiene con un mensaje claro si alguna es inválida.

| Variable | Obligatoria | Valor por defecto | Validación | Descripción |
| --- | :-: | --- | --- | --- |
| `DATABASE_URL` | Sí | — | No vacía | `postgres://usuario:clave@host:puerto/base` para Postgres, o `pglite://memory` para la base embebida en memoria |
| `PSEUDONYM_SALT` | Sí | — | 16 caracteres o más | Sal secreta del HMAC que seudonimiza a los usuarios. Si cambia, los seudónimos ya guardados dejan de coincidir |
| `DIAGNOSTIC_SCRIPT` | No | `.github/skills/diagnostico-conectividad/scripts/diagnose.mjs` | — | Ruta absoluta al script de diagnóstico |
| `DIAGNOSTIC_TIMEOUT_MS` | No | `20000` | Entero entre 1000 y 60000 | Tiempo límite de cada ejecución del script, en milisegundos |

Ejemplo:

```dotenv
DATABASE_URL=postgres://helpdesk:helpdesk@localhost:5432/helpdesk
PSEUDONYM_SALT=una-sal-larga-y-distinta-en-cada-entorno
```

### 3. Base de datos con Docker Compose

`docker-compose.yml` define un único servicio:

| Parámetro | Valor |
| --- | --- |
| Imagen | `postgres:18-alpine` |
| Contenedor | `helpdesk-db` |
| Usuario / clave / base | `helpdesk` / `helpdesk` / `helpdesk` |
| Puerto publicado | `5432:5432` |
| Volumen | `pgdata` montado en `/var/lib/postgresql` |
| Comprobación de salud | `pg_isready` cada 3 s, hasta 10 intentos |

> A partir de Postgres 18, la imagen oficial guarda los datos en `/var/lib/postgresql/18/data`. Por eso el volumen se monta en `/var/lib/postgresql` y no en `/var/lib/postgresql/data`, como en versiones anteriores.

`npm run db:up` ejecuta `docker compose up -d --wait`, que devuelve el control cuando la base ya acepta conexiones.

### 4. Instalación paso a paso

```bash
npm ci                   # dependencias exactas del package-lock.json
cp .env.example .env     # y ajusta PSEUDONYM_SALT
npm run setup            # levanta Postgres, aplica las migraciones y carga las cuentas demo
npm run typecheck        # tsc sin errores
npm test                 # 54 pruebas
npm run demo             # 7 escenarios de punta a punta por MCP
```

`npm run setup` equivale a `db:up` + `db:migrate` + `db:seed`. La carga de cuentas demo es idempotente: se puede repetir sin duplicar datos.

### 5. Modo sin Docker

Con `DATABASE_URL=pglite://memory`, el servidor usa Postgres embebido (PGlite):

- aplica las migraciones y carga las cuentas demo en cada arranque;
- no necesita `npm run setup`;
- los datos se pierden al cerrar el proceso.

Es el modo que usan las pruebas y sirve para evaluar la solución sin instalar nada más.

### 6. Migraciones

| Archivo | Contenido |
| --- | --- |
| `drizzle/0000_naive_wong.sql` | Esquema completo: tipos enumerados, tablas, claves foráneas e índices |
| `drizzle/0001_append_only_audit.sql` | Migración personalizada: la función `forbid_audit_mutation()` y los triggers que impiden `UPDATE` y `DELETE` en `ticket_events`, `account_actions` y `diagnostic_runs` |

- Se aplican con `npm run db:migrate`, que usa `drizzle.config.ts` y la `DATABASE_URL` de `.env`.
- Para cambiar el esquema:
  1. se edita el archivo `*.schema.ts` del módulo;
  2. se genera la migración con `npm run db:generate`;
  3. se aplica con `npm run db:migrate`.
- Las migraciones personalizadas se crean con `npx drizzle-kit generate --custom --name=<nombre>`. Drizzle no las regenera a partir de los esquemas: si se borra la carpeta `drizzle/` hay que volver a crearlas.

### 7. Registro en VS Code

1. Abre la carpeta del proyecto en VS Code.
2. `.vscode/mcp.json` registra el servidor `helpdesk`: transporte stdio, comando `node --import tsx ${workspaceFolder}/src/main.ts` y variables desde `${workspaceFolder}/.env`. Abre el archivo y pulsa **Start**.
3. Comprueba en el panel de salida del servidor el mensaje `servidor MCP listo`.
4. En el chat de Copilot deben aparecer los agentes `triage`, `diagnostics` y `escalation`, y los prompts al escribir `/`.
5. Si las skills no se cargan, habilítalas en la configuración de Copilot (el soporte de Agent Skills puede requerir activarse según la versión de VS Code).

### 8. Parámetros del diagnóstico

**`targets.json`** (`.github/skills/diagnostico-conectividad/scripts/`):

| Clave | Valor | Descripción |
| --- | --- | --- |
| `latencyThresholdMs` | `800` | A partir de esta latencia, un servicio se considera lento |
| `checkTimeoutMs` | `3000` | Tiempo límite de cada comprobación. El script se corta a los 4 × este valor |
| `vpn` | DNS `localhost`, TCP `127.0.0.1:10443`, HTTP `/health` | Comprobaciones de la conexión remota |
| `services` | DNS `localhost`, HTTP `/health`, `/sso/health`, `/erp/health` | Comprobaciones de los servicios internos |

**Códigos de salida del script:**

| Código | Significado | Tratamiento en el servidor |
| :-: | --- | --- |
| 0 | Sin problemas | Resultado válido |
| 1 | Problemas detectados | Resultado válido |
| 2 | Error de uso o de configuración | Fallo del recurso: se reintenta una vez |
| 3 | Tiempo límite interno | Fallo del recurso: se reintenta una vez |

**Servicios simulados** (`npm run mock:services`):

| Variable | Ejemplo | Efecto |
| --- | --- | --- |
| `MOCK_FAIL` | `sso` | El servicio indicado responde 503 |
| `MOCK_SLOW` | `erp` | El servicio indicado tarda 1,5 s en responder |
| `MOCK_NO_GATEWAY` | `1` | No se abre el puerto del gateway VPN |

Admiten varios servicios separados por comas (`MOCK_FAIL=sso,erp`).

### 9. Lista de verificación

- [ ] `npm run typecheck` termina sin errores.
- [ ] `npm test` muestra 54 pruebas superadas.
- [ ] `npm run demo` recorre los 7 escenarios y termina con la bitácora del caso 1.
- [ ] En VS Code, el servidor `helpdesk` aparece en ejecución y expone 14 herramientas.
- [ ] `/nuevo-ticket` crea un ticket y ofrece el botón de traspaso que corresponde al enrutamiento.

### 10. Vuelta atrás

```bash
npm run db:down              # detiene la base y conserva los datos
docker compose down -v       # detiene la base y borra el volumen (se pierden los datos)
```

Para volver a una versión anterior del código basta con restaurar el repositorio: esta es la primera versión y no hay migraciones previas.

### 11. Recomendaciones para producción

- Usa una `PSEUDONYM_SALT` propia, larga y guardada en un gestor de secretos, no en el repositorio.
- Cambia el usuario y la clave de Postgres, y no publiques el puerto 5432 fuera de la red interna.
- Conecta la aplicación con un usuario de base de datos sin permisos para borrar ni modificar triggers.
- Sustituye el directorio y los servicios simulados por conectores reales (por ejemplo, Entra ID o ServiceNow) detrás de los mismos puertos (`UserAccountRepository`, `DiagnosticRunner`).
- Reemplaza la redacción por patrones con un servicio especializado, como Microsoft Presidio, detrás de `SensitiveDataPort`.

---

<p align="center">
  <strong>Adrián Suárez</strong><br/>
  Desarrollador full stack · Líder técnico · Arquitecto de software<br/>
  <a href="mailto:adriansuarezucv@gmail.com">adriansuarezucv@gmail.com</a> · <a href="https://github.com/adrian-suarez">github.com/adrian-suarez</a>
</p>
