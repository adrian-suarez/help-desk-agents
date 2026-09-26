import type { Diagnosis, DiagnosticTarget, RunStatus } from './diagnostic.policy';

/** Resultado de UNA ejecución del recurso auxiliar. */
export type RunnerOutcome =
  | { ok: true; status: 'ok' | 'issues'; diagnosis: Diagnosis; checks: unknown[] }
  | { ok: false; error: string; exitCode: number | null };

/** Puerto hacia el script de la skill. La implementación decide cómo ejecutarlo (proceso hijo, HTTP…). */
export interface DiagnosticRunner {
  run(target: DiagnosticTarget): Promise<RunnerOutcome>;
}

export interface DiagnosticRun {
  ticketCode: string;
  target: DiagnosticTarget;
  status: RunStatus;
  diagnosis: Diagnosis;
  attempts: number;
  report: Record<string, unknown>;
}

export interface DiagnosticRunRepository {
  save(run: DiagnosticRun): Promise<number>;
  countByTicket(ticketCode: string): Promise<number>;
}
