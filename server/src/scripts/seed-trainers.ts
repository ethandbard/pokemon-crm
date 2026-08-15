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
import { activity, pokemon, roster, trainers, type RosterStatus } from '../db/schema.js';
import { SEED_USERS } from '../constants.js';
import { seedUsers } from './seed-users.js';

/**
 * Review history is spread across the seeded users rather than all filed under
 * one, so the per-user filters and the "acting as" switcher have something to
 * distinguish on a fresh database. Deterministic, like the rest of this script.
 */
const SEED_OWNERS = SEED_USERS.map((user) => user.email);

interface RosterSpec {
  /** National Dex number. */
  dex: number;
  nickname?: string;
  level: number;
  status: RosterStatus;
  /**
   * How long this Pokémon has been on the roster, backdated from today.
   *
   * Without this every entry would be acquired at seed time, giving zero days
   * on roster — which would make the needs-attention "behind pace" signal
   * structurally unable to fire. The spread is deliberate: a few long-tenured
   * members sit below the pace their growth curve implies, so the early-alert
   * queue has something real to surface.
   */
  acquiredDaysAgo: number;
}

interface TrainerSpec {
  name: string;
  region: string;
  specialty: string;
  email: string;
  bio: string;
  roster: RosterSpec[];
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

const TRAINERS: TrainerSpec[] = [
  {
    name: 'Ash Ketchum',
    region: 'Kanto',
    specialty: 'electric',
    email: 'ash@pokemon-crm.local',
    bio: 'Generalist with a deep bench. Rotates heavily between regions.',
    roster: [
      { dex: 25, nickname: 'Sparky', level: 58, status: 'starter', acquiredDaysAgo: 420 },
      { dex: 6, level: 52, status: 'active', acquiredDaysAgo: 300 },
      // Long tenure, modest level — deliberately behind pace.
      { dex: 7, level: 44, status: 'active', acquiredDaysAgo: 380 },
      { dex: 12, level: 39, status: 'reserve', acquiredDaysAgo: 90 },
      { dex: 95, level: 41, status: 'reserve', acquiredDaysAgo: 120 },
      { dex: 143, nickname: 'Naptime', level: 47, status: 'retired', acquiredDaysAgo: 500 },
    ],
  },
  {
    name: 'Misty Waterflower',
    region: 'Kanto',
    specialty: 'water',
    email: 'misty@pokemon-crm.local',
    bio: 'Cerulean Gym leader. Water specialist building toward a balanced core.',
    roster: [
      { dex: 121, nickname: 'Stargazer', level: 55, status: 'starter', acquiredDaysAgo: 330 },
      { dex: 54, level: 40, status: 'active', acquiredDaysAgo: 400 },
      { dex: 118, level: 33, status: 'active', acquiredDaysAgo: 70 },
      { dex: 116, level: 29, status: 'reserve', acquiredDaysAgo: 45 },
      { dex: 130, nickname: 'Tempest', level: 61, status: 'active', acquiredDaysAgo: 260 },
    ],
  },
  {
    name: 'Brock Harrison',
    region: 'Kanto',
    specialty: 'rock',
    email: 'brock@pokemon-crm.local',
    bio: 'Pewter Gym leader turned breeder. Defensive cores and long-term care.',
    roster: [
      { dex: 95, nickname: 'Bedrock', level: 50, status: 'starter', acquiredDaysAgo: 290 },
      { dex: 74, level: 36, status: 'active', acquiredDaysAgo: 350 },
      { dex: 111, level: 38, status: 'active', acquiredDaysAgo: 110 },
      { dex: 185, level: 42, status: 'reserve', acquiredDaysAgo: 150 },
    ],
  },
  {
    name: 'Gary Oak',
    region: 'Kanto',
    specialty: 'normal',
    email: 'gary@pokemon-crm.local',
    bio: 'Researcher-in-training. Roster skews toward high base stat totals.',
    roster: [
      { dex: 9, nickname: 'Torrent', level: 60, status: 'starter', acquiredDaysAgo: 400 },
      { dex: 18, level: 48, status: 'active', acquiredDaysAgo: 200 },
      { dex: 51, level: 45, status: 'active', acquiredDaysAgo: 160 },
      { dex: 65, level: 53, status: 'active', acquiredDaysAgo: 220 },
      { dex: 130, level: 55, status: 'reserve', acquiredDaysAgo: 180 },
      { dex: 112, level: 49, status: 'reserve', acquiredDaysAgo: 240 },
    ],
  },
  {
    name: 'Sabrina Natsume',
    region: 'Kanto',
    specialty: 'psychic',
    email: 'sabrina@pokemon-crm.local',
    bio: 'Saffron Gym leader. Narrow, highly specialised psychic roster.',
    roster: [
      { dex: 65, nickname: 'Thoughtform', level: 62, status: 'starter', acquiredDaysAgo: 310 },
      { dex: 122, level: 44, status: 'active', acquiredDaysAgo: 360 },
      { dex: 97, level: 46, status: 'active', acquiredDaysAgo: 130 },
      { dex: 202, level: 40, status: 'reserve', acquiredDaysAgo: 95 },
    ],
  },
  {
    name: 'Cynthia Shirona',
    region: 'Sinnoh',
    specialty: 'dragon',
    email: 'cynthia@pokemon-crm.local',
    bio: 'Champion. The benchmark roster — highest average base stat total.',
    roster: [
      { dex: 445, nickname: 'Apex', level: 70, status: 'starter', acquiredDaysAgo: 380 },
      { dex: 442, level: 64, status: 'active', acquiredDaysAgo: 300 },
      { dex: 423, level: 63, status: 'active', acquiredDaysAgo: 280 },
      { dex: 350, level: 65, status: 'active', acquiredDaysAgo: 290 },
      { dex: 468, level: 66, status: 'active', acquiredDaysAgo: 270 },
      { dex: 407, level: 62, status: 'reserve', acquiredDaysAgo: 210 },
    ],
  },
  {
    name: 'Erika Green',
    region: 'Kanto',
    specialty: 'grass',
    email: 'erika@pokemon-crm.local',
    bio: 'Celadon Gym leader. Grass-type roster with a status-heavy playstyle.',
    roster: [
      { dex: 45, nickname: 'Bloom', level: 47, status: 'starter', acquiredDaysAgo: 340 },
      { dex: 3, level: 43, status: 'active', acquiredDaysAgo: 370 },
      { dex: 114, level: 35, status: 'active', acquiredDaysAgo: 85 },
      { dex: 71, level: 38, status: 'reserve', acquiredDaysAgo: 140 },
    ],
  },
  {
    name: 'Lance Wataru',
    region: 'Johto',
    specialty: 'dragon',
    email: 'lance@pokemon-crm.local',
    bio: 'Elite Four. Small roster, extremely high average level.',
    roster: [
      { dex: 149, nickname: 'Skyfall', level: 72, status: 'starter', acquiredDaysAgo: 410 },
      { dex: 148, level: 58, status: 'active', acquiredDaysAgo: 250 },
      { dex: 130, level: 66, status: 'active', acquiredDaysAgo: 320 },
      { dex: 6, level: 60, status: 'reserve', acquiredDaysAgo: 230 },
    ],
  },
];

/**
 * Gives roster Pokémon a plausible review history.
 *
 * Without this, "never reviewed" fires for essentially every roster member and
 * the needs-attention queue flags ~everything, which makes it useless as a
 * triage list. Reviewing two thirds — at a spread of dates, some deliberately
 * stale — lets all five signals show up and lets the ranking mean something.
 *
 * **Only touches Pokémon with no activity rows at all**, so anything you have
 * caught, flagged, or reviewed by hand is left exactly as it is.
 */
async function seedReviewHistory() {
  const candidates = await db.execute<{ pokemon_id: number; idx: number }>(sql`
    select distinct r.pokemon_id, row_number() over (order by r.pokemon_id) as idx
    from ${roster} r
    where not exists (select 1 from ${activity} a where a.pokemon_id = r.pokemon_id)
  `);

  if (candidates.rows.length === 0) {
    console.log('[seed:trainers] every roster Pokémon already has activity — review history left alone.');
    return;
  }

  let reviewed = 0;
  let flagged = 0;

  for (const row of candidates.rows) {
    // Deterministic spread so re-runs and fresh databases agree.
    const bucket = Number(row.idx) % 3;
    if (bucket === 0) continue; // A third stay unreviewed — the strongest signal.

    // bucket 1 ? recent (well inside the stale window), bucket 2 ? stale.
    const days = bucket === 1 ? 5 + (Number(row.idx) % 20) : 45 + (Number(row.idx) % 60);
    const when = daysAgo(days);
    const owner = SEED_OWNERS[Number(row.idx) % SEED_OWNERS.length]!;

    await db
      .insert(activity)
      .values({
        pokemonId: row.pokemon_id,
        owner,
        kind: 'reviewed',
        createdAt: when,
        updatedAt: when,
      })
      .onConflictDoNothing();
    reviewed += 1;

    // A couple of explicit concerns so the `flagged` signal is represented.
    if (Number(row.idx) % 11 === 0) {
      await db
        .insert(activity)
        .values({ pokemonId: row.pokemon_id, owner, kind: 'flagged', createdAt: when, updatedAt: when })
        .onConflictDoNothing();
      flagged += 1;
    }
  }

  console.log(
    `[seed:trainers] review history: ${reviewed} reviewed, ${flagged} flagged, ${candidates.rows.length - reviewed} left unreviewed.`,
  );
}

async function main() {
  const [{ count = 0 } = {}] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pokemon);

  if (count === 0) {
    throw new Error('The pokemon table is empty — run `npm run seed` before seeding trainers.');
  }

  // The review history below is attributed to these users, so they must exist.
  await seedUsers();

  console.log(`[seed:trainers] seeding ${TRAINERS.length} trainers…`);

  let rosterRows = 0;
  const skipped: string[] = [];

  for (const [index, spec] of TRAINERS.entries()) {
    /*
     * Spread trainers across the seeded users, same round-robin the review
     * history uses, so the "mine vs all" scoping has something to distinguish
     * on a fresh database. `spec.email` is the trainer's own contact address
     * and is deliberately NOT used here — see schema.ts § trainers.
     */
    const owner = SEED_OWNERS[index % SEED_OWNERS.length]!;

    const [trainer] = await db
      .insert(trainers)
      .values({
        name: spec.name,
        region: spec.region,
        specialty: spec.specialty,
        email: spec.email,
        owner,
        bio: spec.bio,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: trainers.name,
        set: {
          region: sql`excluded.region`,
          specialty: sql`excluded.specialty`,
          email: sql`excluded.email`,
          // Re-running the seed re-attributes the demo trainers, which is what
          // makes a stale local database line up with a fresh one.
          owner: sql`excluded.owner`,
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
          acquiredAt: daysAgo(entry.acquiredDaysAgo),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [roster.trainerId, roster.pokemonId],
          set: {
            nickname: sql`excluded.nickname`,
            level: sql`excluded.level`,
            status: sql`excluded.status`,
            // Must be in the update set too, or a re-run leaves existing rows
            // at their original acquired_at and the backdating never lands.
            acquiredAt: sql`excluded.acquired_at`,
            updatedAt: sql`now()`,
          },
        });

      rosterRows += 1;
    }
  }

  await seedReviewHistory();

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
