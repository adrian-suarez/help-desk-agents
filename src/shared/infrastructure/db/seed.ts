import type { SensitiveDataPort } from '../../application/ports/sensitive-data.port';
import { seedUsers } from '../../../modules/users/infrastructure/user.seed';
import type { Database } from './database';

/** Datos iniciales de todos los módulos. Idempotente. */
export async function seedAll(db: Database, sensitive: SensitiveDataPort) {
  return { users: await seedUsers(db, sensitive) };
}
