import { defineConfig } from 'drizzle-kit';

try { process.loadEnvFile(); } catch { /* sin .env: se usan las variables del sistema */ }

export default defineConfig({
  dialect: 'postgresql',
  // Cada módulo declara sus tablas en su propia capa de infraestructura.
  schema: './src/modules/*/infrastructure/*.schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});
