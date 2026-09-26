#!/usr/bin/env node
/**
 * Recurso auxiliar de la skill "diagnostico-conectividad". Solo lectura: DNS, TCP y HTTP GET.
 *
 *   node diagnose.mjs --target vpn|services [--config ruta/targets.json]
 *
 * Salida: SIEMPRE un único JSON en stdout.
 * Códigos: 0 sin problemas · 1 problemas detectados (resultado válido)
 *          2 error de uso/configuración · 3 timeout global
 */
import dns from 'node:dns/promises';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const emit = (body, code) => {
  process.stdout.write(JSON.stringify(body) + '\n');
  process.exit(code);
};
const fail = (error, code) => emit({ status: 'error', diagnosis: 'DIAGNOSTIC_TOOL_UNAVAILABLE', error }, code);

let args;
try {
  ({ values: args } = parseArgs({ options: { target: { type: 'string' }, config: { type: 'string' } } }));
} catch (e) {
  fail(`USO: ${e.message}`, 2);
}

let config;
try {
  config = JSON.parse(readFileSync(args.config ?? new URL('./targets.json', import.meta.url), 'utf8'));
} catch (e) {
  fail(`CONFIG: ${e.message}`, 2);
}
const target = config[args.target];
if (!target) fail(`Objetivo desconocido: ${args.target}`, 2);

const checkTimeout = Number(config.checkTimeoutMs) || 3000;
const watchdog = setTimeout(() => fail('TIMEOUT global', 3), checkTimeout * 4);
const withTimeout = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), checkTimeout))]);

async function checkDns(host) {
  const t0 = Date.now();
  try {
    await withTimeout(dns.lookup(host));
    return { type: 'dns', name: host, ok: true, ms: Date.now() - t0 };
  } catch (e) {
    return { type: 'dns', name: host, ok: false, ms: Date.now() - t0, error: e.code ?? e.message };
  }
}

function checkTcp({ name, host, port }) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok, error) => {
      socket.destroy();
      resolve({ type: 'tcp', name, ok, ms: Date.now() - t0, ...(error && { error }) });
    };
    socket.setTimeout(checkTimeout, () => done(false, 'timeout'));
    socket.once('connect', () => done(true));
    socket.once('error', (e) => done(false, e.code ?? e.message));
  });
}

async function checkHttp({ name, url }) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(checkTimeout) });
    const ms = Date.now() - t0;
    return { type: 'http', name, ok: res.ok, status: res.status, ms, slow: ms > config.latencyThresholdMs };
  } catch (e) {
    return { type: 'http', name, ok: false, ms: Date.now() - t0, error: e.name === 'TimeoutError' ? 'timeout' : (e.cause?.code ?? e.message) };
  }
}

const checks = [
  ...(await Promise.all((target.dns ?? []).map(checkDns))),
  ...(await Promise.all((target.tcp ?? []).map(checkTcp))),
  ...(await Promise.all((target.http ?? []).map(checkHttp))),
];
clearTimeout(watchdog);

const failed = (type) => checks.some((c) => c.type === type && !c.ok);
const diagnosis = failed('dns')
  ? 'DNS_RESOLUTION_FAILED'
  : failed('tcp') || (args.target === 'vpn' && failed('http'))
    ? 'GATEWAY_UNREACHABLE'
    : failed('http') || checks.some((c) => c.slow)
      ? 'SERVICE_DEGRADED'
      : 'INFRA_OK_CLIENT_SIDE';

const status = diagnosis === 'INFRA_OK_CLIENT_SIDE' ? 'ok' : 'issues';
emit({ status, target: args.target, diagnosis, checkedAt: new Date().toISOString(), checks }, status === 'ok' ? 0 : 1);
