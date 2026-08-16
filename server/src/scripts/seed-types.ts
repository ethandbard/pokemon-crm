/**
 * Imports the type effectiveness matrix from PokéAPI.
 *
 *   npm run seed:types
 *
 * 18 requests flat — the cheapest unlock in the dataset, and independent of
 * SEED_LIMIT and of the moves import. `seed` calls this as one of its passes;
 * the standalone script exists so the matrix can be refreshed without re-running
 * a ~2,600-request dex import.
 *
 * Safe to re-run: rows are upserted on (attacking, defending).
 */
import { sql } from 'drizzle-orm';
import { db, pool } from '../db/client.js';
import { typeDamage, type NewTypeDamage } from '../db/schema.js';
import { env } from '../env.js';
import { POKEMON_TYPES } from '../constants.js';
import { POKEAPI, fetchJson, mapWithConcurrency, type NamedRef } from './pokeapi.js';

/**
 * `/type/{name}` — the effectiveness matrix, one type at a time.
 *
 * `damage_relations` is written from the perspective of THIS type: the
 * `..._to` lists are what it does on offence, the `..._from` lists are what it
 * suffers on defence. Only exceptions appear; neutral is implied by absence.
 */
interface TypeResponse {
  id: number;
  name: string;
  damage_relations: {
    double_damage_to: NamedRef[];
    half_damage_to: NamedRef[];
    no_damage_to: NamedRef[];
    double_damage_from: NamedRef[];
    half_damage_from: NamedRef[];
    no_damage_from: NamedRef[];
  };
}

/**
 * The 18 × 18 effectiveness matrix — the cheapest unlock in the dataset and the
 * one the roster coverage report is built on.
 *
 * Only the **offensive** lists are read (`..._to`). Each relation is reported
 * twice by PokeAPI, once from each side — Water's `double_damage_to` contains
 * Fire, and Fire's `double_damage_from` contains Water. Applying both sides
 * would mean writing every cell twice and having no answer if the two ever
 * disagreed, so one direction is picked and the other ignored.
 *
 * **All 18 must succeed or nothing is written.** A missing attacker leaves its
 * whole row at the 100 default, which reads as "hits everything neutrally" —
 * a plausible-looking matrix that is quietly wrong. Failing loudly and keeping
 * the previous contents is the better half of that trade.
 */
export async function seedTypeChart(): Promise<void> {
  const known = new Set<string>(POKEMON_TYPES);

  // Every pair starts neutral; the relations below carve out the exceptions.
  const grid = new Map<string, number>();
  const key = (attacking: string, defending: string) => `${attacking}>${defending}`;
  for (const attacking of POKEMON_TYPES) {
    for (const defending of POKEMON_TYPES) grid.set(key(attacking, defending), 100);
  }

  console.log(`[seed] fetching ${POKEMON_TYPES.length} type damage relations…`);

  const failed: string[] = [];
  await mapWithConcurrency([...POKEMON_TYPES], env.seedConcurrency, async (name) => {
    try {
      const type = await fetchJson<TypeResponse>(`${POKEAPI}/type/${name}`);
      const relations = type.damage_relations;

      const apply = (refs: NamedRef[], multiplier: number) => {
        for (const ref of refs) {
          // `shadow`, `unknown` and `stellar` come back in these lists but are
          // not types any species in `pokemon` carries.
          if (known.has(ref.name)) grid.set(key(name, ref.name), multiplier);
        }
      };

      apply(relations.double_damage_to, 200);
      apply(relations.half_damage_to, 50);
      apply(relations.no_damage_to, 0);
    } catch (err) {
      console.warn(`[seed] type ${name} failed: ${String(err)}`);
      failed.push(name);
    }
    return null;
  });

  if (failed.length > 0) {
    console.warn(
      `[seed] type chart NOT written — ${failed.length} of ${POKEMON_TYPES.length} types failed ` +
        `(${failed.join(', ')}). A partial matrix reads as neutral, so the existing one is kept. ` +
        `Re-run to retry.`,
    );
    return;
  }

  const rows: NewTypeDamage[] = [];
  for (const [pair, multiplier] of grid) {
    const [attackingType, defendingType] = pair.split('>') as [string, string];
    rows.push({ attackingType, defendingType, multiplier });
  }

  const chunk = 200;
  for (let i = 0; i < rows.length; i += chunk) {
    await db
      .insert(typeDamage)
      .values(rows.slice(i, i + chunk))
      .onConflictDoUpdate({
        target: [typeDamage.attackingType, typeDamage.defendingType],
        set: { multiplier: sql`excluded.multiplier` },
      });
  }

  console.log(`[seed] wrote ${rows.length} type damage pairs.`);
}

/** Only runs the pool teardown when invoked directly, not as a pass of `seed`. */
const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('seed-types.ts');

if (invokedDirectly) {
  seedTypeChart()
    .catch((err) => {
      console.error('[seed:types] failed', err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
