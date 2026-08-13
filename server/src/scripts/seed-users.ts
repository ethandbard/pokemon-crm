/**
 * Seeds the user directory behind the "acting as" switcher.
 *
 *   npm run seed:users
 *
 * Depends on nothing else, and `seed:trainers` calls it first so the review
 * history it writes can be spread across real users. Safe to re-run: upserts on
 * email, which is the identity that lands in every `owner` column.
 */
import { db, pool } from '../db/client.js';
import { users } from '../db/schema.js';
import { SEED_USERS } from '../constants.js';

export async function seedUsers(): Promise<void> {
  for (const user of SEED_USERS) {
    await db
      .insert(users)
      .values({ ...user, role: user.role, initials: user.initials })
      .onConflictDoUpdate({
        target: users.email,
        // Display fields refresh; `email` is the key and never changes, so a
        // re-run can't re-attribute anyone's existing notes or flags.
        set: { name: user.name, role: user.role, initials: user.initials, updatedAt: new Date() },
      });
  }

  console.log(`[seed:users] ${SEED_USERS.length} users ready.`);
}

/** Only runs the pool teardown when invoked directly, not via seed:trainers. */
const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('seed-users.ts');

if (invokedDirectly) {
  seedUsers()
    .catch((error) => {
      console.error('[seed:users] failed:', error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
