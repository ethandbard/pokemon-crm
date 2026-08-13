import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// The single .env lives at the repo root, one level above `server/`.
const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../../.env') });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) throw new Error(`Environment variable ${name} must be an integer.`);
  return parsed;
}

/**
 * Builds a libpq connection string from the discrete PG* variables. Used only
 * when DATABASE_URL is absent, so either style of configuration works.
 */
function connectionStringFromParts(): string {
  const host = required('PGHOST', 'localhost');
  const port = int('PGPORT', 5432);
  const database = required('PGDATABASE', 'pokemon_crm');
  const user = required('PGUSER', 'postgres');
  const password = process.env.PGPASSWORD ?? '';
  const auth = password ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}` : encodeURIComponent(user);
  return `postgres://${auth}@${host}:${port}/${database}`;
}

export const env = {
  databaseUrl: process.env.DATABASE_URL || connectionStringFromParts(),
  /** Azure Postgres requires TLS; local dev servers usually do not. */
  dbSsl: (process.env.PGSSL ?? 'false').toLowerCase() === 'true',
  port: int('PORT', 4000),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  seedLimit: int('SEED_LIMIT', 1025),
  seedConcurrency: int('SEED_CONCURRENCY', 8),
  /**
   * Whether the seed imports moves. The species→move join rows are free (they
   * come with the `/pokemon` response), but the move details are one request
   * per distinct move — ~900 for the full dex. Set SEED_MOVES=false for a
   * faster run; the moves pages then render their empty states.
   */
  seedMoves: (process.env.SEED_MOVES ?? 'true').toLowerCase() !== 'false',
} as const;
