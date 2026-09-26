import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DIAGNOSES, type Diagnosis, type DiagnosticTarget } from '../domain/diagnostic.policy';
import type { DiagnosticRunner, RunnerOutcome } from '../domain/diagnostic.ports';

const execFileAsync = promisify(execFile);

/**
 * Ejecuta el script de la skill (.github/skills/diagnostico-conectividad/scripts/diagnose.mjs)
 * como proceso hijo, con timeout duro.
 *  - exit 0 (ok) o 1 (problemas detectados) con JSON válido → resultado válido
 *  - exit 2 (configuración), 3 (timeout interno), proceso colgado o JSON inválido → fallo del recurso
 */
export class ScriptDiagnosticRunner implements DiagnosticRunner {
  constructor(private readonly scriptPath: string, private readonly timeoutMs: number) {}

  async run(target: DiagnosticTarget): Promise<RunnerOutcome> {
    let stdout: string;
    let exitCode = 0;
    try {
      ({ stdout } = await execFileAsync(process.execPath, [this.scriptPath, '--target', target], { timeout: this.timeoutMs }));
    } catch (error) {
      const e = error as { code?: number | string; stdout?: string; killed?: boolean; message: string };
      if (e.killed) return { ok: false, error: `Timeout de ${this.timeoutMs} ms`, exitCode: null };
      if (typeof e.code !== 'number') return { ok: false, error: `No se pudo ejecutar el script: ${e.code ?? e.message}`, exitCode: null };
      exitCode = e.code;
      stdout = e.stdout ?? '';
    }
    return this.parse(stdout, exitCode);
  }

  private parse(stdout: string, exitCode: number): RunnerOutcome {
    let body: { status?: string; diagnosis?: string; checks?: unknown[]; error?: string };
    try {
      body = JSON.parse(stdout);
    } catch {
      return { ok: false, error: 'La salida del script no es JSON válido', exitCode };
    }
    const validExit = exitCode === 0 || exitCode === 1;
    const validDiagnosis = DIAGNOSES.includes(body.diagnosis as Diagnosis) && body.diagnosis !== 'DIAGNOSTIC_TOOL_UNAVAILABLE';
    if (!validExit || !validDiagnosis || (body.status !== 'ok' && body.status !== 'issues')) {
      return { ok: false, error: body.error ?? `Respuesta inválida (exit ${exitCode})`, exitCode };
    }
    return { ok: true, status: body.status, diagnosis: body.diagnosis as Diagnosis, checks: body.checks ?? [] };
  }
}
