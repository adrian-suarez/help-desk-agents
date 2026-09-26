import { loadEnv } from '../src/shared/infrastructure/config/env';
import { createDatabase } from '../src/shared/infrastructure/db/database';
import { seedAll } from '../src/shared/infrastructure/db/seed';
import { RegexSensitiveDataAdapter } from '../src/shared/infrastructure/security/regex-sensitive-data.adapter';

const env = loadEnv();
const database = await createDatabase(env.DATABASE_URL);
const result = await seedAll(database.db, new RegexSensitiveDataAdapter(env.PSEUDONYM_SALT));
console.log(`Seed aplicado: ${result.users} cuentas nuevas (demo: jperez, acastro, mgarcia, lrodriguez).`);
await database.close();
