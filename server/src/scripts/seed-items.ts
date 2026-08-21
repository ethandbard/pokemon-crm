/**
 * Imports the items a Pokémon can hold.
 *
 *   npm run seed:items
 *
 * ~450 requests, not the ~2,180 a full item import would cost. The scope is two
 * unions:
 *
 *   1. The battle-relevant categories below — 17 index requests that between
 *      them name every item worth equipping.
 *   2. Every slug already sitting in `pokemon.held_items`, so the Profile's
 *      "Held items" row resolves to names even for something outside those
 *      categories.
 *
 * Poké Balls, mail, curry ingredients and TMs are excluded on purpose: they are
 * not things a roster member carries into a fight, and importing them would put
 * 1,700 rows into a picker to make three of them reachable.
 *
 * Safe to re-run: rows are upserted on `slug`.
 */
import { sql } from 'drizzle-orm';
import { db, pool } from '../db/client.js';
import { items, pokemon, type NewItem } from '../db/schema.js';
import { env } from '../env.js';
import { titleCase } from '../constants.js';
import { ENGLISH, POKEAPI, fetchJson, mapWithConcurrency, type NamedRef } from './pokeapi.js';

/**
 * The categories whose items can be held and matter in a battle.
 *
 * Hand-picked rather than derived: PokeAPI has 54 categories and no flag for
 * "holdable", so the alternative is importing everything. Adding one here is
 * one extra index request.
 */
const HELD_CATEGORIES = [
  'held-items',
  'choice',
  'type-enhancement',
  'stat-boosts',
  'bad-held-items',
  'in-a-pinch',
  'picky-healing',
  'type-protection',
  'effort-training',
  'effort-drop',
  'plates',
  'species-specific',
  'mega-stones',
  'z-crystals',
  'memories',
  'jewels',
  'scarves',
] as const;

interface ItemCategoryResponse {
  name: string;
  items: NamedRef[];
}

interface ItemResponse {
  id: number;
  name: string;
  category: NamedRef | null;
  fling_power: number | null;
  names: { name: string; language: NamedRef }[];
  effect_entries: { effect: string; short_effect: string; language: NamedRef }[];
  sprites: { default: string | null } | null;
}

function buildItemRow(item: ItemResponse): NewItem {
  const english = (item.names ?? []).find((entry) => ENGLISH(entry.language));
  const entry = (item.effect_entries ?? []).find((e) => ENGLISH(e.language));

  return {
    slug: item.name,
    displayName: english?.name ?? titleCase(item.name),
    category: item.category?.name ?? null,
    effect: entry?.effect?.replace(/\s+/g, ' ').trim() || null,
    shortEffect: entry?.short_effect?.replace(/\s+/g, ' ').trim() || null,
    spriteUrl: item.sprites?.default ?? null,
    flingPower: item.fling_power,
  };
}

/** Slugs already referenced by the seeded dex, so held-item rows resolve. */
async function heldItemSlugs(): Promise<string[]> {
  const rows = await db.execute(sql`
    select distinct s as slug
    from ${pokemon}, unnest(${pokemon.heldItems}) as s
    where s <> ''
  `);
  return (rows.rows as { slug: string }[]).map((row) => row.slug);
}

/**
 * Best-effort like the abilities import: a missing item renders as its slug,
 * which is what the Profile's held-items row showed before this table existed.
 */
export async function seedItems(): Promise<void> {
  const slugs = new Set<string>();

  console.log(`[seed] listing ${HELD_CATEGORIES.length} item categories…`);
  await mapWithConcurrency([...HELD_CATEGORIES], env.seedConcurrency, async (category) => {
    try {
      const row = await fetchJson<ItemCategoryResponse>(`${POKEAPI}/item-category/${category}`);
      for (const ref of row.items) slugs.add(ref.name);
    } catch (err) {
      console.warn(`[seed] item category ${category} failed: ${String(err)}`);
    }
    return null;
  });

  for (const slug of await heldItemSlugs()) slugs.add(slug);

  const list = [...slugs].sort();
  if (list.length === 0) {
    console.log('[seed] no items to import — skipping.');
    return;
  }

  console.log(`[seed] fetching ${list.length} items…`);

  const rows: NewItem[] = [];
  const failed: string[] = [];
  let done = 0;

  await mapWithConcurrency(list, env.seedConcurrency, async (slug) => {
    try {
      rows.push(buildItemRow(await fetchJson<ItemResponse>(`${POKEAPI}/item/${slug}`)));
    } catch (err) {
      console.warn(`[seed] item ${slug} failed: ${String(err)}`);
      failed.push(slug);
    }
    if (++done % 200 === 0) console.log(`[seed]   …${done}/${list.length} items`);
    return null;
  });

  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db
      .insert(items)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoUpdate({
        target: items.slug,
        set: {
          displayName: sql`excluded.display_name`,
          category: sql`excluded.category`,
          effect: sql`excluded.effect`,
          shortEffect: sql`excluded.short_effect`,
          spriteUrl: sql`excluded.sprite_url`,
          flingPower: sql`excluded.fling_power`,
        },
      });
  }

  console.log(`[seed] wrote ${rows.length} items.`);
  if (failed.length > 0) {
    console.warn(`[seed] ${failed.length} items failed and will render as slugs: ${failed.join(', ')}`);
  }
}

/** Only runs the pool teardown when invoked directly, not as a pass of `seed`. */
const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('seed-items.ts');

if (invokedDirectly) {
  seedItems()
    .catch((err) => {
      console.error('[seed:items] failed', err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
