/**
 * Imports the 25 natures from PokéAPI.
 *
 *   npm run seed:natures
 *
 * 26 requests flat (one index page plus 25), independent of SEED_LIMIT and of
 * every other import — the cheapest unlock in the dataset after the type chart.
 * `seed` calls this as a pass; the standalone script exists so it can be
 * re-imported on its own.
 *
 * Safe to re-run: rows are upserted on `slug`.
 */
import { sql } from 'drizzle-orm';
import { db, pool } from '../db/client.js';
import { natures, type NewNature } from '../db/schema.js';
import { env } from '../env.js';
import { titleCase } from '../constants.js';
import { ENGLISH, POKEAPI, fetchJson, mapWithConcurrency, type NamedRef } from './pokeapi.js';

/** How many natures PokeAPI has shipped since Gen 3, and is not going to change. */
const EXPECTED_NATURES = 25;

interface NatureResponse {
  id: number;
  name: string;
  /** **Null for the five neutral natures.** */
  increased_stat: NamedRef | null;
  /** Null exactly when `increased_stat` is. */
  decreased_stat: NamedRef | null;
  names: { name: string; language: NamedRef }[];
}

interface NatureIndex {
  count: number;
  results: NamedRef[];
}

function buildNatureRow(nature: NatureResponse): NewNature {
  const english = (nature.names ?? []).find((entry) => ENGLISH(entry.language));

  return {
    slug: nature.name,
    displayName: english?.name ?? titleCase(nature.name),
    // Left null rather than coerced to a stat name. A neutral nature genuinely
    // changes nothing, and writing the same stat into both columns would make
    // "+10% Attack / −10% Attack" renderable, which reads as an effect.
    increasedStat: nature.increased_stat?.name ?? null,
    decreasedStat: nature.decreased_stat?.name ?? null,
  };
}

/**
 * **All 25 must succeed or nothing is written**, following the type chart rather
 * than the abilities import.
 *
 * The set is fixed and complete — a partial write means a nature silently
 * missing from a picker whose whole job is to offer all of them, and a member
 * whose stored nature no longer resolves. Unlike ability effect text, there is
 * no useful degraded state to fall back to.
 */
export async function seedNatures(): Promise<void> {
  console.log(`[seed] fetching ${EXPECTED_NATURES} natures…`);

  const index = await fetchJson<NatureIndex>(`${POKEAPI}/nature?limit=100`);

  const rows: NewNature[] = [];
  const failed: string[] = [];

  await mapWithConcurrency(index.results, env.seedConcurrency, async (ref) => {
    try {
      rows.push(buildNatureRow(await fetchJson<NatureResponse>(ref.url)));
    } catch (err) {
      console.warn(`[seed] nature ${ref.name} failed: ${String(err)}`);
      failed.push(ref.name);
    }
    return null;
  });

  if (failed.length > 0 || rows.length !== EXPECTED_NATURES) {
    console.warn(
      `[seed] natures NOT written — got ${rows.length} of ${EXPECTED_NATURES}` +
        (failed.length ? ` (${failed.join(', ')} failed)` : '') +
        `. A partial set hides natures from the picker, so the existing rows are kept. Re-run to retry.`,
    );
    return;
  }

  await db
    .insert(natures)
    .values(rows)
    .onConflictDoUpdate({
      target: natures.slug,
      set: {
        displayName: sql`excluded.display_name`,
        increasedStat: sql`excluded.increased_stat`,
        decreasedStat: sql`excluded.decreased_stat`,
      },
    });

  const neutral = rows.filter((row) => row.increasedStat === null).length;
  console.log(`[seed] wrote ${rows.length} natures (${neutral} neutral).`);
}

/** Only runs the pool teardown when invoked directly, not as a pass of `seed`. */
const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('seed-natures.ts');

if (invokedDirectly) {
  seedNatures()
    .catch((err) => {
      console.error('[seed:natures] failed', err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
