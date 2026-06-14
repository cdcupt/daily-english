import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getDb, closeDb } from './client.js';

/** Idempotent migration runner (invoked on deploy — TECH §B9). */
async function main() {
  const db = getDb();
  await migrate(db, { migrationsFolder: './drizzle' });
  // eslint-disable-next-line no-console
  console.log('migrations applied');
  await closeDb();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('migration failed', err);
  process.exit(1);
});
