import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { db, pool } from './client.js';

const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log('[migrate] applying migrations…');
  await migrate(db, { migrationsFolder: resolve(here, '../../drizzle') });
  console.log('[migrate] done');
}

main()
  .catch((err) => {
    console.error('[migrate] failed', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
