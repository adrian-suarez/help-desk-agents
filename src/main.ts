import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { buildApp } from './app';
import { loadEnv } from './shared/infrastructure/config/env';
import { createDatabase } from './shared/infrastructure/db/database';
import { seedAll } from './shared/infrastructure/db/seed';

/**
 * Punto de entrada. IMPORTANTE: el protocolo MCP viaja por stdout;
 * nunca uses console.log. Los logs van a stderr (console.error).
 */
async function main() {
  const env = loadEnv();
  const database = await createDatabase(env.DATABASE_URL);
  const { server, sensitive } = buildApp(database.db, env);

  // En modo memoria la base nace vacía en cada arranque: se siembran las cuentas demo.
  if (database.kind === 'memory') await seedAll(database.db, sensitive);

  await server.connect(new StdioServerTransport());
  console.error(`[helpdesk] servidor MCP listo (stdio, base: ${database.kind})`);

  const shutdown = async () => {
    await server.close();
    await database.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('[helpdesk] no se pudo iniciar:', error);
  process.exit(1);
});
