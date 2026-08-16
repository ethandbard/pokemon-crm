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
  /**
   * `API_PORT` wins over `PORT` so the API keeps its own port when something
   * else in the environment already owns `PORT`. Dev harnesses that assign the
   * web server a free port export `PORT` to do it, and because dotenv never
   * overrides a variable that is already set, the API would inherit the web
   * port, bind there, and leave nothing on :4000 for the Vite proxy to reach.
   * Production platforms that hand the process a `PORT` still work: leave
   * API_PORT unset there.
   */
  port: int('API_PORT', int('PORT', 4000)),
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
  /**
   * Whether the seed imports ability effect text — one request per distinct
   * ability the seeded dex references, ~370 for the full dex. With it off,
   * abilities render as slugs, which is what they did before the table existed.
   */
  seedAbilities: (process.env.SEED_ABILITIES ?? 'true').toLowerCase() !== 'false',
  /**
   * Whether the seed resolves TM numbers. One request per (move, version group)
   * — ~2,400 for the full dex, the single most expensive pass after the dex
   * itself. Requires SEED_MOVES. With it off, movepool rows still say a move is
   * machine-taught, just not which machine.
   */
  seedMachines: (process.env.SEED_MACHINES ?? 'true').toLowerCase() !== 'false',
} as const;
