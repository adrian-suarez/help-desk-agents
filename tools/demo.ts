/**
 * Demo de punta a punta: actúa como harían los agentes, llamando al servidor MCP por stdio.
 * Usa la base configurada en .env (Postgres o pglite://memory) y levanta los servicios simulados.
 *   npm run demo
 */
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

type Body = Record<string, any>;
const client = new Client({ name: 'demo', version: '1.0.0-RC1' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: ['--import', 'tsx', 'src/main.ts'], env: process.env as Record<string, string>, stderr: 'ignore' }));

const call = async (name: string, args: Body): Promise<Body> => {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as { text: string }[])[0]!.text;
  try { return JSON.parse(text); } catch { return { ok: false, code: 'VALIDATION', message: text }; }
};
const title = (s: string) => console.log(`\n\x1b[1m━━ ${s}\x1b[0m`);
const line = (k: string, v: string) => console.log(`  ${k.padEnd(13)} ${v}`);

async function mocks(env: Record<string, string> = {}) {
  const child = spawn(process.execPath, ['tools/mock-services.mjs'], { env: { ...process.env, ...env }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 500));
  return child;
}

/** Triage: crear → clasificar → handoff según el servidor. */
async function triage(text: string, reporter: string, c: Body) {
  const t = await call('tickets_create', { description: text, reporter });
  line('ticket', `${t.code}  redactado: ${t.redactionFindings.join(', ') || 'nada'}${t.warning ? '  ⚠ credencial eliminada' : ''}`);
  const k = await call('tickets_classify', { code: t.code, agent: 'triage', confidence: 0.9, rationale: 'Clasificación del agente', ...c });
  line('clasificación', `${c.subtype} · ${k.priority}${k.priorityRaisedByRules ? ' (subida por reglas)' : ''} → ${k.routing.rule} → ${k.routing.to}`);
  const h = await call('tickets_handoff', k.next.args);
  line('handoff', `${h.owner} / ${h.state}`);
  return { code: t.code as string, routing: k.routing as Body };
}

async function escalate(code: string, queue: string, reason: string) {
  const e = await call('tickets_escalate', { code, agent: 'escalation', queue, reason, userMessage: 'Un especialista ya tomó tu caso y te contactará dentro del plazo acordado.' });
  line('escalado', `${e.state} → ${e.escalation.queue}`);
}

title('1) Cuenta bloqueada; el usuario comparte su contraseña');
let t = await triage('Hola, mi usuario jperez quedó bloqueado por intentos fallidos. Mi contraseña es Verano2026!', 'jperez', { category: 'ACCESS_IDENTITY', subtype: 'ACCOUNT_LOCKED', priority: 'P3', service: 'Inicio de sesión' });
let r = await call('users_remediate', { code: t.code, agent: 'diagnostics', action: 'unlock_account' });
line('remediación', `${r.reference} ${r.outcome}`);
const res = await call('tickets_resolve', { code: t.code, agent: 'diagnostics', summary: 'Cuenta desbloqueada', userMessage: 'Tu cuenta ya está habilitada. Te recomendamos cambiar tu contraseña desde el portal de autoservicio.' });
line('resultado', `${res.state} con evidencia ${res.evidence}`);

title('2) VPN no conecta; la infraestructura está sana');
let svc = await mocks();
t = await triage('La VPN no me conecta desde casa, FortiClient se queda cargando', 'lrodriguez', { category: 'INFRA_SOFTWARE', subtype: 'VPN_CONNECTIVITY', priority: 'P3', service: 'VPN' });
let d = await call('diagnostics_run', { code: t.code, agent: 'diagnostics' });
line('diagnóstico', `${d.reference} ${d.diagnosis} (${d.attempts} intento/s)`);
const p = await call(d.next.tool, d.next.args);
line('resultado', `${p.state}: "${p.userMessage.slice(0, 60)}…"`);
svc.kill();

title('3) VPN caída para el usuario: gateway sin respuesta');
svc = await mocks({ MOCK_NO_GATEWAY: '1' });
t = await triage('No tengo VPN, anyconnect dice que no encuentra el servidor', 'mgarcia', { category: 'INFRA_SOFTWARE', subtype: 'VPN_CONNECTIVITY', priority: 'P3', service: 'VPN' });
d = await call('diagnostics_run', { code: t.code, agent: 'diagnostics' });
line('diagnóstico', `${d.reference} ${d.diagnosis}`);
await call(d.next.tool, d.next.args);
await escalate(t.code, d.recommendedNextStep.queue, d.diagnosis);
svc.kill();

title('4) Bloqueo por seguridad: la remediación se niega');
t = await triage('Mi usuario acastro está bloqueado y no puedo entrar', 'acastro', { category: 'ACCESS_IDENTITY', subtype: 'ACCOUNT_LOCKED', priority: 'P3', service: 'Inicio de sesión' });
r = await call('users_remediate', { code: t.code, agent: 'diagnostics', action: 'unlock_account' });
line('remediación', `${r.outcome}: ${r.detail}`);
await call(r.next.tool, r.next.args);
await escalate(t.code, 'N1-Humano', `${r.outcome}: bloqueo de seguridad`);

title('5) Acceso a repositorio: requiere aprobación');
t = await triage('Necesito acceso al repositorio del proyecto Atlas en GitLab', 'lrodriguez', { category: 'PROVISIONING', subtype: 'FOLDER_REPO_ACCESS', priority: 'P4', service: 'GitLab' });
await escalate(t.code, t.routing.queue, 'R4_APPROVAL_REQUIRED');

title('6) Incidente masivo: el LLM dice P3 y las reglas lo suben');
t = await triage('Todo el equipo de finanzas no puede entrar a SAP, es urgente por el cierre contable', 'mgarcia', { category: 'INFRA_SOFTWARE', subtype: 'APP_INCIDENT', priority: 'P3', service: 'SAP' });
await escalate(t.code, t.routing.queue, 'R1_CRITICAL: SAP caído para un área completa');

title('7) Controles: lo que el servidor rechaza');
const cycle = await call('tickets_handoff', { code: t.code, agent: 'escalation', to: 'triage', reason: 'devolver' });
line('ciclo', `${cycle.code}: ${cycle.message}`);
const fake = await call('tickets_classify', { code: t.code, agent: 'triage', category: 'HARDWARE', subtype: 'PRINTER', priority: 'P9', confidence: 2, service: 'x', rationale: 'inventado' });
line('valor inventado', `${fake.code}: ${String(fake.message).split('\n')[0]!.slice(0, 80)}…`);
const pii = await call('tickets_create', { description: 'Mi correo es ana.perez@acme.com y mi cédula 1234567890', reporter: 'x' });
line('datos personales', `guardado como: "${pii.description}"`);

title('Bitácora del caso 1');
const audit = await call('audit_timeline', { code: 'T-0001' });
for (const e of audit.timeline ?? []) line(e.source, `${e.type} · ${e.actor} · ${e.summary}`);

await client.close();
