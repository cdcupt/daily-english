import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../env.js';
import * as schema from './schema.js';

/**
 * Lazy Postgres connection so the API can boot (e.g. /health) without a DB,
 * and so tooling that doesn't need the DB doesn't open a pool. Reuses the
 * shared BWH Postgres via DATABASE_URL (this app's own database + role).
 */
let _sql: ReturnType<typeof postgres> | undefined;
let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getSql() {
  if (!_sql) {
    if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    _sql = postgres(env.DATABASE_URL, { max: 10 });
  }
  return _sql;
}

export function getDb() {
  if (!_db) _db = drizzle(getSql(), { schema });
  return _db;
}

export async function closeDb() {
  if (_sql) await _sql.end({ timeout: 5 });
  _sql = undefined;
  _db = undefined;
}

export { schema };
