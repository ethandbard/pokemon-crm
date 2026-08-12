/**
 * Creates the application database if it doesn't already exist.
 *
 *   npm run db:create
 *
 * `db:migrate` connects straight to the app database, so it fails on a fresh
 * machine with `database "pokemon_crm" does not exist`. This runs first: it
 * connects to the `postgres` maintenance database on the same server and issues
 * a CREATE DATABASE.
 *
 * Safe to re-run — it checks first and says so if the database is already there.
 */
import pg from 'pg';
import { env } from '../env.js';

/**
 * Postgres does not allow a bind parameter in CREATE DATABASE, so the name has
 * to be interpolated. It comes from the operator's own .env rather than from a
 * request, but validate it anyway and quote it as an identifier — a database
 * name is exactly the kind of thing that later gets wired to something else.
 */
function assertSafeIdentifier(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(name)) {
    throw new Error(
      `Refusing to create a database named ${JSON.stringify(name)} — use letters, digits and underscores only.`,
    );
  }
  return `"${name}"`;
}

async function main() {
  const url = new URL(env.databaseUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) throw new Error('No database name found in DATABASE_URL.');

  // Same server and credentials, but the always-present maintenance database.
  const adminUrl = new URL(url.toString());
  adminUrl.pathname = '/postgres';

  const client = new pg.Client({
    connectionString: adminUrl.toString(),
    ssl: env.dbSsl ? { rejectUnauthorized: false } : false,
  });

  await client.connect();
  try {
    const existing = await client.query('select 1 from pg_database where datname = $1', [database]);
    if (existing.rowCount && existing.rowCount > 0) {
      console.log(`[db:create] database "${database}" already exists — nothing to do.`);
      return;
    }

    await client.query(`create database ${assertSafeIdentifier(database)}`);
    console.log(`[db:create] created database "${database}".`);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error('[db:create] failed:', err instanceof Error ? err.message : err);
  console.error(
    '[db:create] check that PostgreSQL is running and that the credentials in .env can connect.',
  );
  process.exitCode = 1;
});
