import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, it } from 'node:test';
import type { McpServer } from '@modelcontextprotocol/server';
import { HANDOFF_GRAPH } from '../../src/modules/tickets/domain/policies/handoff.policy';
import { registerTicketTools } from '../../src/modules/tickets/presentation/ticket.tools';
import { registerUserTools } from '../../src/modules/users/presentation/user.tools';
import { registerDiagnosticTools } from '../../src/modules/diagnostics/presentation/diagnostic.tools';
import { registerAuditTools } from '../../src/modules/audit/presentation/audit.tools';

/**
 * La configuración de VS Code (.github) y el servidor MCP deben coincidir.
 * Si alguien renombra una herramienta o cambia el grafo de handoffs, esta prueba lo detecta.
 */
const GH = '.github';

function serverToolNames(): Set<string> {
  const names = new Set<string>();
  const fake = { registerTool: (name: string) => names.add(name) } as unknown as McpServer;
  const any = {} as never;
  registerTicketTools(fake, any);
  registerUserTools(fake, any);
  registerDiagnosticTools(fake, any);
  registerAuditTools(fake, any);
  return names;
}

function frontmatter(file: string): string {
  const match = /^---\n([\s\S]*?)\n---/.exec(readFileSync(file, 'utf8'));
  assert.ok(match, `${file} no tiene frontmatter`);
  return match[1]!;
}

const field = (fm: string, key: string) => new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(fm)?.[1]?.trim();
const toolsOf = (fm: string): string[] => JSON.parse((field(fm, 'tools') ?? '[]').replaceAll("'", '"'));
const files = (dir: string, suffix: string) => readdirSync(join(GH, dir)).filter((f) => f.endsWith(suffix)).map((f) => join(GH, dir, f));

describe('Configuración .github coherente con el servidor', () => {
  const tools = serverToolNames();
  const agents = files('agents', '.agent.md');
  const agentNames = agents.map((f) => field(frontmatter(f), 'name'));

  it('los agentes existen y coinciden con los del dominio', () => {
    assert.deepEqual([...agentNames].sort(), Object.keys(HANDOFF_GRAPH).sort());
  });

  it('agentes y prompts solo citan herramientas que existen en el servidor', () => {
    for (const file of [...agents, ...files('prompts', '.prompt.md')]) {
      const fm = frontmatter(file);
      for (const t of toolsOf(fm)) {
        assert.match(t, /^helpdesk\//, `${file}: ${t} debe ser del servidor helpdesk`);
        assert.ok(tools.has(t.replace('helpdesk/', '')), `${file}: la herramienta ${t} no existe`);
      }
      const body = readFileSync(file, 'utf8');
      for (const [, t] of body.matchAll(/#tool:helpdesk\/(\w+)/g)) assert.ok(tools.has(t!), `${file}: #tool:${t} no existe`);
    }
  });

  it('los handoffs de cada agente son exactamente los del grafo del dominio', () => {
    for (const file of agents) {
      const fm = frontmatter(file);
      const name = field(fm, 'name') as keyof typeof HANDOFF_GRAPH;
      const targets = [...fm.matchAll(/^\s+agent:\s*(\w+)/gm)].map((m) => m[1]);
      assert.deepEqual(targets.sort(), [...HANDOFF_GRAPH[name]].sort(), `${file}: handoffs distintos al grafo`);
    }
  });

  it('cada agente tiene solo las herramientas de escritura que le corresponden', () => {
    const toolsBy: Record<string, string[]> = Object.fromEntries(agents.map((f) => [field(frontmatter(f), "name"), toolsOf(frontmatter(f))]));
    assert.ok(!toolsBy.triage!.some((t) => /users_|diagnostics_|escalate|resolve/.test(t)), 'triage no diagnostica ni resuelve');
    assert.ok(!toolsBy.escalation!.some((t) => /handoff|remediate|resolve|create/.test(t)), 'escalation es terminal');
    assert.ok(!toolsBy.diagnostics!.includes('helpdesk/tickets_escalate'), 'diagnostics delega; no escala');
  });

  it('las skills cumplen el estándar: nombre = carpeta, descripción ≤ 1024 y recursos existentes', () => {
    for (const dir of readdirSync(join(GH, 'skills'))) {
      const file = join(GH, 'skills', dir, 'SKILL.md');
      const fm = frontmatter(file);
      assert.equal(field(fm, 'name'), dir);
      assert.match(dir, /^[a-z0-9-]{1,64}$/);
      assert.ok((field(fm, 'description') ?? '').length <= 1024);
      for (const [, link] of readFileSync(file, 'utf8').matchAll(/\]\((\.\/[^)]+)\)/g)) {
        assert.ok(existsSync(join(GH, 'skills', dir, link!)), `${file}: el recurso ${link} no existe`);
      }
    }
  });

  it('las instrucciones del ciclo de vida se aplican a todo el workspace', () => {
    const fm = frontmatter(join(GH, 'instructions', 'ticket-lifecycle.instructions.md'));
    assert.equal(field(fm, 'applyTo'), '"**"');
    assert.ok(basename(join(GH, 'copilot-instructions.md')));
  });
});
