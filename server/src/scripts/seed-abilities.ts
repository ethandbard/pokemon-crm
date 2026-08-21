/**
 * Imports ability effect text from PokéAPI.
 *
 *   npm run seed:abilities
 *
 * ~370 requests — one per distinct ability the dex actually references. The
 * slugs come from what the dex pass already collected rather than from the
 * `/ability` index, so a `SEED_LIMIT=151` run fetches only Kanto's abilities
 * instead of all 370.
 *
 * `seed` calls this as a pass; the standalone script exists so effect text can
 * be refreshed without re-running a ~2,600-request dex import. Run standalone it
 * reads the slugs straight out of `pokemon`, which is why it can work at all
 * without the dex pass in memory.
 *
 * Safe to re-run: rows are upserted on `slug`.
 */
import { sql } from 'drizzle-orm';
import { db, pool } from '../db/client.js';
import { abilities, pokemon, type NewAbility } from '../db/schema.js';
import { env } from '../env.js';
import { generationForSlug, titleCase } from '../constants.js';
import { ENGLISH, POKEAPI, fetchJson, mapWithConcurrency, type NamedRef } from './pokeapi.js';

/** `/ability/{name}` — the effect text behind a slug `pokemon.abilities` holds. */
interface AbilityResponse {
  id: number;
  name: string;
  is_main_series: boolean;
  generation: NamedRef | null;
  names: { name: string; language: NamedRef }[];
  effect_entries: { effect: string; short_effect: string; language: NamedRef }[];
}

/**
 * PokeAPI's `name` is a slug; the display name lives in the localised `names`
 * list. Falling back to `titleCase` matters for the few abilities with no
 * English entry — `Soul-Heart` is better than nothing at all.
 */
function displayNameFor(ability: AbilityResponse): string {
  const english = (ability.names ?? []).find((entry) => ENGLISH(entry.language));
  return english?.name ?? titleCase(ability.name);
}

function buildAbilityRow(ability: AbilityResponse): NewAbility {
  const entry = (ability.effect_entries ?? []).find((e) => ENGLISH(e.language));

  return {
    slug: ability.name,
    displayName: displayNameFor(ability),
    effect: entry?.effect?.replace(/\s+/g, ' ').trim() || null,
    shortEffect: entry?.short_effect?.replace(/\s+/g, ' ').trim() || null,
    generation: generationForSlug(ability.generation?.name),
    isMainSeries: ability.is_main_series ?? true,
  };
}

/**
 * Every ability slug the seeded dex references, ordinary and hidden alike.
 *
 * Read from the table rather than taken as an argument so the pass works
 * identically whether it runs inside `seed` (where `pokemon` was just written)
 * or standalone months later.
 */
async function referencedSlugs(): Promise<string[]> {
  const rows = await db.execute(sql`
    select distinct s as slug
    from ${pokemon}, unnest(${pokemon.abilities} || array[coalesce(${pokemon.hiddenAbility}, '')]) as s
    where s <> ''
    order by slug
  `);

  return (rows.rows as { slug: string }[]).map((row) => row.slug);
}

/**
 * **Not all-or-nothing, unlike the type chart.** A missing ability row leaves
 * that ability rendering as its slug — exactly what the app showed before this
 * table existed. A missing type-chart row instead reads as a plausible-looking
 * wrong answer, which is why that seed refuses to write a partial matrix and
 * this one does not.
 */
export async function seedAbilities(): Promise<void> {
  const slugs = await referencedSlugs();
  if (slugs.length === 0) {
    console.log('[seed] no abilities referenced by any seeded Pokémon — skipping.');
    return;
  }

  console.log(`[seed] fetching ${slugs.length} abilities…`);

  const rows: NewAbility[] = [];
  const failed: string[] = [];
  let done = 0;

  await mapWithConcurrency(slugs, env.seedConcurrency, async (slug) => {
    try {
      rows.push(buildAbilityRow(await fetchJson<AbilityResponse>(`${POKEAPI}/ability/${slug}`)));
    } catch (err) {
      console.warn(`[seed] ability ${slug} failed: ${String(err)}`);
      failed.push(slug);
    }
    if (++done % 200 === 0) console.log(`[seed]   …${done}/${slugs.length} abilities`);
    return null;
  });

  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db
      .insert(abilities)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoUpdate({
        target: abilities.slug,
        set: {
          displayName: sql`excluded.display_name`,
          effect: sql`excluded.effect`,
          shortEffect: sql`excluded.short_effect`,
          generation: sql`excluded.generation`,
          isMainSeries: sql`excluded.is_main_series`,
        },
      });
  }

  console.log(`[seed] wrote ${rows.length} abilities.`);
  if (failed.length > 0) {
    console.warn(
      `[seed] ${failed.length} abilities failed and will render as slugs: ${failed.join(', ')}. ` +
        `Re-run to retry them.`,
    );
  }
}

/** Only runs the pool teardown when invoked directly, not as a pass of `seed`. */
const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('seed-abilities.ts');

if (invokedDirectly) {
  seedAbilities()
    .catch((err) => {
      console.error('[seed:abilities] failed', err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
