import { fileURLToPath } from 'node:url';
import * as z from 'zod/v4';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  PSEUDONYM_SALT: z.string().min(16, 'PSEUDONYM_SALT debe tener al menos 16 caracteres'),
  DIAGNOSTIC_SCRIPT: z.string().default(`${ROOT}.github/skills/diagnostico-conectividad/scripts/diagnose.mjs`),
  DIAGNOSTIC_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(20_000),
});

export type Env = z.infer<typeof EnvSchema>;

/** Falla al arrancar (fail fast) si la configuración es inválida. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuración inválida: ${issues}`);
  }
  return parsed.data;
}
