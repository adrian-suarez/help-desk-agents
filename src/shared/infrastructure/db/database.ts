import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

/** Tipo común para cualquier driver Postgres (postgres-js en producción, PGlite en pruebas). */
export type Database = PgDatabase<PgQueryResultHKT>;

export interface DatabaseHandle {
  db: Database;
  /** 'memory' = PGlite efímero (se siembra al arrancar); 'postgres' = base real. */
  kind: 'postgres' | 'memory';
  close(): Promise<void>;
}

/**
 * Crea la conexión según la URL:
 *  - postgres://...  → Postgres real (docker-compose)
 *  - pglite://memory → Postgres embebido en memoria, con migraciones aplicadas al arrancar (demo/tests sin Docker)
 */
export async function createDatabase(url: string): Promise<DatabaseHandle> {
  if (url.startsWith('pglite://')) {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    const client = new PGlite();
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: new URL('../../../../drizzle', import.meta.url).pathname });
    return { db: db as unknown as Database, kind: 'memory', close: () => client.close() };
  }

  const client = postgres(url, { max: 5, onnotice: () => {} });
  return { db: drizzlePostgres(client) as unknown as Database, kind: 'postgres', close: () => client.end() };
}
