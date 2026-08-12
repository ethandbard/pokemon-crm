/**
 * Seeds trainers and their rosters.
 *
 *   npm run seed:trainers
 *
 * Requires `npm run seed` to have run first — rosters reference pokemon rows by
 * National Dex number, and any entry whose Pokémon is missing is skipped with a
 * warning rather than failing the whole run.
 *
 * Safe to re-run: trainers upsert on name and roster entries upsert on
 * (trainer, pokemon), so nicknames and levels get refreshed without
 * duplicating anyone.
 */
import { eq, sql } from 'drizzle-orm';
import { db, pool } from '../db/client.js';
import { pokemon, roster, trainers, type RosterStatus } from '../db/schema.js';

interface RosterSpec {
  /** National Dex number. */
  dex: number;
  nickname?: string;
  level: number;
  status: RosterStatus;
}

interface TrainerSpec {
  name: string;
  region: string;
  specialty: string;
  email: string;
  bio: string;
  roster: RosterSpec[];
}

const TRAINERS: TrainerSpec[] = [
  {
    name: 'Ash Ketchum',
    region: 'Kanto',
    specialty: 'electric',
    email: 'ash@pokemon-crm.local',
    bio: 'Generalist with a deep bench. Rotates heavily between regions.',
    roster: [
      { dex: 25, nickname: 'Sparky', level: 58, status: 'starter' },
      { dex: 6, level: 52, status: 'active' },
      { dex: 7, level: 44, status: 'active' },
      { dex: 12, level: 39, status: 'reserve' },
      { dex: 95, level: 41, status: 'reserve' },
      { dex: 143, nickname: 'Naptime', level: 47, status: 'retired' },
    ],
  },
  {
    name: 'Misty Waterflower',
    region: 'Kanto',
    specialty: 'water',
    email: 'misty@pokemon-crm.local',
    bio: 'Cerulean Gym leader. Water specialist building toward a balanced core.',
    roster: [
      { dex: 121, nickname: 'Stargazer', level: 55, status: 'starter' },
      { dex: 54, level: 40, status: 'active' },
      { dex: 118, level: 33, status: 'active' },
      { dex: 116, level: 29, status: 'reserve' },
      { dex: 130, nickname: 'Tempest', level: 61, status: 'active' },
    ],
  },
  {
    name: 'Brock Harrison',
    region: 'Kanto',
    specialty: 'rock',
    email: 'brock@pokemon-crm.local',
    bio: 'Pewter Gym leader turned breeder. Defensive cores and long-term care.',
    roster: [
      { dex: 95, nickname: 'Bedrock', level: 50, status: 'starter' },
      { dex: 74, level: 36, status: 'active' },
      { dex: 111, level: 38, status: 'active' },
      { dex: 185, level: 42, status: 'reserve' },
    ],
  },
  {
    name: 'Gary Oak',
    region: 'Kanto',
    specialty: 'normal',
    email: 'gary@pokemon-crm.local',
    bio: 'Researcher-in-training. Roster skews toward high base stat totals.',
    roster: [
      { dex: 9, nickname: 'Torrent', level: 60, status: 'starter' },
      { dex: 18, level: 48, status: 'active' },
      { dex: 51, level: 45, status: 'active' },
      { dex: 65, level: 53, status: 'active' },
      { dex: 130, level: 55, status: 'reserve' },
      { dex: 112, level: 49, status: 'reserve' },
    ],
  },
  {
    name: 'Sabrina Natsume',
    region: 'Kanto',
    specialty: 'psychic',
    email: 'sabrina@pokemon-crm.local',
    bio: 'Saffron Gym leader. Narrow, highly specialised psychic roster.',
    roster: [
      { dex: 65, nickname: 'Thoughtform', level: 62, status: 'starter' },
      { dex: 122, level: 44, status: 'active' },
      { dex: 97, level: 46, status: 'active' },
      { dex: 202, level: 40, status: 'reserve' },
    ],
  },
  {
    name: 'Cynthia Shirona',
    region: 'Sinnoh',
    specialty: 'dragon',
    email: 'cynthia@pokemon-crm.local',
    bio: 'Champion. The benchmark roster — highest average base stat total.',
    roster: [
      { dex: 445, nickname: 'Apex', level: 70, status: 'starter' },
      { dex: 442, level: 64, status: 'active' },
      { dex: 423, level: 63, status: 'active' },
      { dex: 350, level: 65, status: 'active' },
      { dex: 468, level: 66, status: 'active' },
      { dex: 407, level: 62, status: 'reserve' },
    ],
  },
  {
    name: 'Erika Green',
    region: 'Kanto',
    specialty: 'grass',
    email: 'erika@pokemon-crm.local',
    bio: 'Celadon Gym leader. Grass-type roster with a status-heavy playstyle.',
    roster: [
      { dex: 45, nickname: 'Bloom', level: 47, status: 'starter' },
      { dex: 3, level: 43, status: 'active' },
      { dex: 114, level: 35, status: 'active' },
      { dex: 71, level: 38, status: 'reserve' },
    ],
  },
  {
    name: 'Lance Wataru',
    region: 'Johto',
    specialty: 'dragon',
    email: 'lance@pokemon-crm.local',
    bio: 'Elite Four. Small roster, extremely high average level.',
    roster: [
      { dex: 149, nickname: 'Skyfall', level: 72, status: 'starter' },
      { dex: 148, level: 58, status: 'active' },
      { dex: 130, level: 66, status: 'active' },
      { dex: 6, level: 60, status: 'reserve' },
    ],
  },
];

async function main() {
  const [{ count = 0 } = {}] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pokemon);

  if (count === 0) {
    throw new Error('The pokemon table is empty — run `npm run seed` before seeding trainers.');
  }

  console.log(`[seed:trainers] seeding ${TRAINERS.length} trainers…`);

  let rosterRows = 0;
  const skipped: string[] = [];

  for (const spec of TRAINERS) {
    const [trainer] = await db
      .insert(trainers)
      .values({
        name: spec.name,
        region: spec.region,
        specialty: spec.specialty,
        email: spec.email,
        bio: spec.bio,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: trainers.name,
        set: {
          region: sql`excluded.region`,
          specialty: sql`excluded.specialty`,
          email: sql`excluded.email`,
          bio: sql`excluded.bio`,
          updatedAt: sql`now()`,
        },
      })
      .returning();

    if (!trainer) continue;

    for (const entry of spec.roster) {
      // Skip rather than fail: a partial `npm run seed` (SEED_LIMIT=151) will
      // legitimately not have Cynthia's Sinnoh roster.
      const [target] = await db
        .select({ id: pokemon.id })
        .from(pokemon)
        .where(eq(pokemon.id, entry.dex))
        .limit(1);

      if (!target) {
        skipped.push(`${spec.name} → #${entry.dex}`);
        continue;
      }

      await db
        .insert(roster)
        .values({
          trainerId: trainer.id,
          pokemonId: entry.dex,
          nickname: entry.nickname ?? null,
          level: entry.level,
          status: entry.status,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [roster.trainerId, roster.pokemonId],
          set: {
            nickname: sql`excluded.nickname`,
            level: sql`excluded.level`,
            status: sql`excluded.status`,
            updatedAt: sql`now()`,
          },
        });

      rosterRows += 1;
    }
  }

  const [totals] = await db
    .select({
      trainers: sql<number>`(select count(*)::int from ${trainers})`,
      entries: sql<number>`(select count(*)::int from ${roster})`,
    })
    .from(trainers)
    .limit(1);

  console.log(
    `[seed:trainers] done — ${totals?.trainers ?? 0} trainers, ${totals?.entries ?? 0} roster entries (${rosterRows} written this run).`,
  );

  if (skipped.length) {
    console.warn(
      `[seed:trainers] ${skipped.length} roster entries skipped — those Pokémon are not seeded: ${skipped.join(', ')}`,
    );
    console.warn('[seed:trainers] raise SEED_LIMIT, re-run `npm run seed`, then re-run this script.');
  }
}

main()
  .catch((err) => {
    console.error('[seed:trainers] failed', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
