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
import { growthRates, pokemon, type NewPokemon } from '../db/schema.js';
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
  evolution_chain: { url: string } | null;
  growth_rate: NamedRef | null;
}

interface GrowthRateResponse {
  name: string;
  levels: { level: number; experience: number }[];
}

interface ChainLink {
  species: NamedRef;
  evolves_to: ChainLink[];
  evolution_details: {
    min_level: number | null;
    trigger: NamedRef | null;
    item: NamedRef | null;
    min_happiness: number | null;
  }[];
}

interface EvolutionChainResponse {
  id: number;
  chain: ChainLink;
}

/** Everything the seed derives about one species' place in its chain. */
interface EvolutionFacts {
  evolutionChainId: number;
  evolvesFromId: number | null;
  evolutionStage: number;
  chainLength: number;
  evolutionMinLevel: number | null;
  evolutionTrigger: string | null;
  isFullyEvolved: boolean;
}

/** `https://pokeapi.co/api/v2/pokemon-species/25/` → 25 */
function idFromUrl(url: string): number | null {
  const match = /\/(\d+)\/?$/.exec(url);
  return match?.[1] ? Number.parseInt(match[1], 10) : null;
}

/**
 * Walks an evolution chain into flat per-species facts.
 *
 * `chainLength` is the depth of the deepest branch, so a species in a branching
 * chain (Eevee) reports the programme length it actually sits in. Branches are
 * walked independently, which is why depth is computed first.
 */
function walkChain(chain: EvolutionChainResponse): Map<number, EvolutionFacts> {
  const facts = new Map<number, EvolutionFacts>();

  function depth(link: ChainLink): number {
    if (link.evolves_to.length === 0) return 1;
    return 1 + Math.max(...link.evolves_to.map(depth));
  }

  const chainLength = depth(chain.chain);

  function visit(link: ChainLink, stage: number, parentId: number | null) {
    const speciesId = idFromUrl(link.species.url);
    if (speciesId === null) return;

    // evolution_details describes how this species is reached FROM its parent.
    const detail = link.evolution_details[0];

    facts.set(speciesId, {
      evolutionChainId: chain.id,
      evolvesFromId: parentId,
      evolutionStage: stage,
      chainLength,
      evolutionMinLevel: detail?.min_level ?? null,
      evolutionTrigger: detail?.item?.name ?? detail?.trigger?.name ?? null,
      isFullyEvolved: link.evolves_to.length === 0,
    });

    for (const child of link.evolves_to) visit(child, stage + 1, speciesId);
  }

  visit(chain.chain, 1, null);
  return facts;
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

/** A built row plus the evolution chain it belongs to, resolved in a later pass. */
interface BuiltRow {
  row: NewPokemon;
  chainId: number | null;
}

async function buildRow(dex: number): Promise<BuiltRow | null> {
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

  const row: NewPokemon = {
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
    growthRate: species?.growth_rate?.name ?? null,
    isLegendary: species?.is_legendary ?? false,
    isMythical: species?.is_mythical ?? false,
    spriteUrl: detail.sprites.front_default,
    artworkUrl: detail.sprites.other?.['official-artwork']?.front_default ?? detail.sprites.front_default,
    updatedAt: new Date(),
  };

  return {
    row,
    chainId: species?.evolution_chain ? idFromUrl(species.evolution_chain.url) : null,
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

  const built = rows.filter((row): row is BuiltRow => row !== null);

  // --- Second pass: evolution chains -------------------------------------
  // Many species share a chain (all three Bulbasaur stages point at chain 1),
  // so fetch each chain once rather than once per Pokémon.
  const chainIds = [...new Set(built.map((b) => b.chainId).filter((id): id is number => id !== null))];
  console.log(`[seed] fetching ${chainIds.length} evolution chains…`);

  const evolutionFacts = new Map<number, EvolutionFacts>();
  let chainFailures = 0;

  await mapWithConcurrency(chainIds, env.seedConcurrency, async (chainId) => {
    try {
      const chain = await fetchJson<EvolutionChainResponse>(`${POKEAPI}/evolution-chain/${chainId}`);
      for (const [speciesId, facts] of walkChain(chain)) evolutionFacts.set(speciesId, facts);
    } catch (err) {
      chainFailures += 1;
      console.warn(`[seed] evolution chain ${chainId} failed: ${String(err)}`);
    }
    return null;
  });

  const valid = built.map((b) => {
    const facts = evolutionFacts.get(b.row.id);
    // Species with no chain data (or a failed fetch) stay at the schema
    // defaults: a one-stage chain that is already fully evolved.
    return facts ? { ...b.row, ...facts } : b.row;
  });

  const withEvolution = valid.filter((row) => row.evolutionChainId != null).length;
  console.log(
    `[seed] fetched ${valid.length} Pokémon (${withEvolution} with evolution data); writing to Postgres…`,
  );

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
          growthRate: sql`excluded.growth_rate`,
          isLegendary: sql`excluded.is_legendary`,
          isMythical: sql`excluded.is_mythical`,
          spriteUrl: sql`excluded.sprite_url`,
          artworkUrl: sql`excluded.artwork_url`,
          evolutionChainId: sql`excluded.evolution_chain_id`,
          evolvesFromId: sql`excluded.evolves_from_id`,
          evolutionStage: sql`excluded.evolution_stage`,
          chainLength: sql`excluded.chain_length`,
          evolutionMinLevel: sql`excluded.evolution_min_level`,
          evolutionTrigger: sql`excluded.evolution_trigger`,
          isFullyEvolved: sql`excluded.is_fully_evolved`,
          updatedAt: sql`now()`,
        },
      });
  }

  // --- Third pass: growth-rate EXP curves ---------------------------------
  // Six curves, so this is six requests regardless of SEED_LIMIT. The real
  // tables are stored rather than a fitted formula.
  const curveNames = [...new Set(valid.map((row) => row.growthRate).filter((n): n is string => !!n))];
  console.log(`[seed] fetching ${curveNames.length} growth-rate curves…`);

  const curveRows: { name: string; level: number; experience: number }[] = [];
  for (const name of curveNames) {
    try {
      const curve = await fetchJson<GrowthRateResponse>(`${POKEAPI}/growth-rate/${name}`);
      for (const entry of curve.levels) {
        curveRows.push({ name, level: entry.level, experience: entry.experience });
      }
    } catch (err) {
      console.warn(`[seed] growth rate ${name} failed: ${String(err)}`);
    }
  }

  if (curveRows.length > 0) {
    for (let i = 0; i < curveRows.length; i += CHUNK) {
      await db
        .insert(growthRates)
        .values(curveRows.slice(i, i + CHUNK))
        .onConflictDoUpdate({
          target: [growthRates.name, growthRates.level],
          set: { experience: sql`excluded.experience` },
        });
    }
    console.log(`[seed] wrote ${curveRows.length} growth-rate levels.`);
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
