import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '../env.js';
import * as schema from './schema.js';

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  // Azure's managed Postgres terminates TLS with a certificate chain that isn't
  // in Node's default trust store, so verification is relaxed there. Locally
  // SSL is off entirely.
  ssl: env.dbSsl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  console.error('[db] idle client error', err);
});

export const db = drizzle(pool, { schema });

export type Database = typeof db;
