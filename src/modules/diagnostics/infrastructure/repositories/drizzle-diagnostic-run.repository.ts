import { count, eq } from 'drizzle-orm';
import type { Database } from '../../../../shared/infrastructure/db/database';
import type { DiagnosticRun, DiagnosticRunRepository } from '../../domain/diagnostic.ports';
import { diagnosticRuns } from '../diagnostic.schema';

export class DrizzleDiagnosticRunRepository implements DiagnosticRunRepository {
  constructor(private readonly db: Database) {}

  async save(run: DiagnosticRun): Promise<number> {
    const [row] = await this.db.insert(diagnosticRuns).values(run).returning({ id: diagnosticRuns.id });
    return row!.id;
  }

  async countByTicket(ticketCode: string): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(diagnosticRuns).where(eq(diagnosticRuns.ticketCode, ticketCode));
    return Number(row?.n ?? 0);
  }
}
