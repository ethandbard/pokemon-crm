/**
 * One-time seed: pulls the National Pokédex from PokeAPI into the `pokemon`
 * table.
 *
 *   npm run seed
 *
 * Safe to re-run — rows are upserted on primary key, so notes and activity
 * (which reference pokemon.id) survive a re-seed untouched.
 *
 * Tunable via .env: SEED_LIMIT (how far up the dex to go) and SEED_CONCURRENCY.
 */
import { sql } from 'drizzle-orm';
import { db, pool } from '../db/client.js';
import { pokemon, type NewPokemon } from '../db/schema.js';
import { env } from '../env.js';
import { generationForDexNumber } from '../constants.js';

const POKEAPI = 'https://pokeapi.co/api/v2';

interface NamedRef {
  name: string;
  url: string;
}

interface PokemonResponse {
  id: number;
  name: string;
  height: number;
  weight: number;
  base_experience: number | null;
  types: { slot: number; type: NamedRef }[];
  stats: { base_stat: number; stat: NamedRef }[];
  abilities: { ability: NamedRef; is_hidden: boolean }[];
  sprites: {
    front_default: string | null;
    other?: {
      'official-artwork'?: { front_default: string | null };
    };
  };
}

interface SpeciesResponse {
  capture_rate: number | null;
  is_legendary: boolean;
  is_mythical: boolean;
  color: NamedRef | null;
}

async function fetchJson<T>(url: string, attempt = 1): Promise<T> {
  const maxAttempts = 4;
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } catch (err) {
    if (attempt >= maxAttempts) throw new Error(`GET ${url} failed after ${maxAttempts} attempts: ${String(err)}`);
    // Exponential backoff — PokeAPI rate-limits bursts.
    await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** (attempt - 1)));
    return fetchJson<T>(url, attempt + 1);
  }
}

/** `ho-oh` → `Ho Oh`, `porygon-z` → `Porygon Z`, `mr-mime` → `Mr Mime`. */
function titleCase(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(' ');
}

function statValue(stats: PokemonResponse['stats'], name: string): number {
  return stats.find((s) => s.stat.name === name)?.base_stat ?? 0;
}

async function buildRow(dex: number): Promise<NewPokemon | null> {
  const [detail, species] = await Promise.all([
    fetchJson<PokemonResponse>(`${POKEAPI}/pokemon/${dex}`),
    fetchJson<SpeciesResponse>(`${POKEAPI}/pokemon-species/${dex}`).catch(() => null),
  ]);

  const sortedTypes = [...detail.types].sort((a, b) => a.slot - b.slot);
  const type1 = sortedTypes[0]?.type.name;
  if (!type1) {
    console.warn(`[seed] #${dex} ${detail.name} has no primary type — skipping`);
    return null;
  }

  const hp = statValue(detail.stats, 'hp');
  const attack = statValue(detail.stats, 'attack');
  const defense = statValue(detail.stats, 'defense');
  const specialAttack = statValue(detail.stats, 'special-attack');
  const specialDefense = statValue(detail.stats, 'special-defense');
  const speed = statValue(detail.stats, 'speed');

  return {
    id: detail.id,
    name: detail.name,
    displayName: titleCase(detail.name),
    generation: generationForDexNumber(detail.id),
    type1,
    type2: sortedTypes[1]?.type.name ?? null,
    hp,
    attack,
    defense,
    specialAttack,
    specialDefense,
    speed,
    baseStatTotal: hp + attack + defense + specialAttack + specialDefense + speed,
    height: detail.height,
    weight: detail.weight,
    baseExperience: detail.base_experience,
    captureRate: species?.capture_rate ?? null,
    abilities: detail.abilities.map((a) => a.ability.name),
    color: species?.color?.name ?? null,
    isLegendary: species?.is_legendary ?? false,
    isMythical: species?.is_mythical ?? false,
    spriteUrl: detail.sprites.front_default,
    artworkUrl: detail.sprites.other?.['official-artwork']?.front_default ?? detail.sprites.front_default,
    updatedAt: new Date(),
  };
}

/** Runs `worker` over `items` with at most `limit` in flight at once. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runner() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}

async function main() {
  const dexNumbers = Array.from({ length: env.seedLimit }, (_, i) => i + 1);
  console.log(`[seed] fetching #1–#${env.seedLimit} from PokeAPI (concurrency ${env.seedConcurrency})…`);

  let completed = 0;
  const failures: number[] = [];

  const rows = await mapWithConcurrency(dexNumbers, env.seedConcurrency, async (dex) => {
    try {
      const row = await buildRow(dex);
      completed += 1;
      if (completed % 100 === 0) console.log(`[seed]   …${completed}/${dexNumbers.length}`);
      return row;
    } catch (err) {
      failures.push(dex);
      console.warn(`[seed] #${dex} failed: ${String(err)}`);
      return null;
    }
  });

  const valid = rows.filter((row): row is NewPokemon => row !== null);
  console.log(`[seed] fetched ${valid.length} Pokémon; writing to Postgres…`);

  // Chunked so a single INSERT never exceeds Postgres' 65535 bind-parameter cap.
  const CHUNK = 200;
  for (let i = 0; i < valid.length; i += CHUNK) {
    const chunk = valid.slice(i, i + CHUNK);
    await db
      .insert(pokemon)
      .values(chunk)
      .onConflictDoUpdate({
        target: pokemon.id,
        set: {
          name: sql`excluded.name`,
          displayName: sql`excluded.display_name`,
          generation: sql`excluded.generation`,
          type1: sql`excluded.type1`,
          type2: sql`excluded.type2`,
          hp: sql`excluded.hp`,
          attack: sql`excluded.attack`,
          defense: sql`excluded.defense`,
          specialAttack: sql`excluded.special_attack`,
          specialDefense: sql`excluded.special_defense`,
          speed: sql`excluded.speed`,
          baseStatTotal: sql`excluded.base_stat_total`,
          height: sql`excluded.height`,
          weight: sql`excluded.weight`,
          baseExperience: sql`excluded.base_experience`,
          captureRate: sql`excluded.capture_rate`,
          abilities: sql`excluded.abilities`,
          color: sql`excluded.color`,
          isLegendary: sql`excluded.is_legendary`,
          isMythical: sql`excluded.is_mythical`,
          spriteUrl: sql`excluded.sprite_url`,
          artworkUrl: sql`excluded.artwork_url`,
          updatedAt: sql`now()`,
        },
      });
  }

  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(pokemon);

  console.log(`[seed] done — ${count} rows in pokemon.`);
  if (failures.length) {
    console.warn(`[seed] ${failures.length} dex numbers failed and were skipped: ${failures.join(', ')}`);
    console.warn('[seed] re-run the seed to retry them.');
  }
}

main()
  .catch((err) => {
    console.error('[seed] failed', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
