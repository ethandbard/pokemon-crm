/**
 * One-time seed: pulls the National Pokédex from PokéAPI into the `pokemon`
 * table.
 *
 *   npm run seed
 *
 * Safe to re-run — rows are upserted on primary key, so notes and activity
 * (which reference pokemon.id) survive a re-seed untouched.
 *
 * Tunable via .env: SEED_LIMIT (how far up the dex to go) and SEED_CONCURRENCY.
 *
 * ---------------------------------------------------------------------------
 * Data source: PokéAPI (https://pokeapi.co), used under their fair use policy.
 *
 * PokéAPI is free and community-run, and asks that clients cache locally rather
 * than call it repeatedly. This script is the only thing in the app that talks
 * to them: it runs once, writes to Postgres, and the app reads from Postgres
 * thereafter. Three things keep it polite, and none should be removed casually:
 *
 *   - concurrency is capped (SEED_CONCURRENCY, default 8)
 *   - failures retry with exponential backoff rather than hammering
 *   - evolution chains and growth curves are de-duplicated, so each is fetched
 *     once rather than once per Pokémon that shares it
 * ---------------------------------------------------------------------------
 */
import { inArray, sql } from 'drizzle-orm';
import { db, pool } from '../db/client.js';
import {
  growthRates,
  moves,
  pokemon,
  pokemonMoves,
  type EvolutionRequirement,
  type MoveDamageClass,
  type NewMove,
  type NewPokemon,
  type NewPokemonMove,
  type RegionalDexNumbers,
} from '../db/schema.js';
import { env } from '../env.js';
import { generationForDexNumber, generationForSlug, titleCase } from '../constants.js';
import { ENGLISH, POKEAPI, fetchJson, mapWithConcurrency, type NamedRef } from './pokeapi.js';
import { seedTypeChart } from './seed-types.js';
import { seedAbilities } from './seed-abilities.js';
import { seedNatures } from './seed-natures.js';
import { seedMachines } from './seed-machines.js';

interface PokemonResponse {
  id: number;
  name: string;
  height: number;
  weight: number;
  base_experience: number | null;
  types: { slot: number; type: NamedRef }[];
  /** `effort` is the EV yield — how much beating this species trains. */
  stats: { base_stat: number; effort: number; stat: NamedRef }[];
  abilities: { ability: NamedRef; is_hidden: boolean; slot: number }[];
  /**
   * Every move the species can learn, with one `version_group_details` entry
   * per game it appears in. That inner array is why the join table is deduped
   * down to one row per learn method — see `pickMoveEntries`.
   */
  moves?: {
    move: NamedRef;
    version_group_details: {
      level_learned_at: number;
      move_learn_method: NamedRef;
      version_group: NamedRef;
    }[];
  }[];
  held_items?: { item: NamedRef }[];
  cries?: { latest: string | null; legacy: string | null } | null;
  sprites: {
    front_default: string | null;
    front_shiny: string | null;
    other?: {
      'official-artwork'?: { front_default: string | null; front_shiny: string | null };
      home?: { front_default: string | null; front_shiny: string | null };
    };
  };
}

interface SpeciesResponse {
  capture_rate: number | null;
  is_legendary: boolean;
  is_mythical: boolean;
  is_baby: boolean;
  gender_rate: number | null;
  base_happiness: number | null;
  hatch_counter: number | null;
  color: NamedRef | null;
  habitat: NamedRef | null;
  shape: NamedRef | null;
  generation: NamedRef | null;
  egg_groups?: NamedRef[];
  evolution_chain: { url: string } | null;
  growth_rate: NamedRef | null;
  genera?: { genus: string; language: NamedRef }[];
  flavor_text_entries?: { flavor_text: string; language: NamedRef; version: NamedRef | null }[];
  varieties?: { is_default: boolean; pokemon: NamedRef }[];
  pokedex_numbers?: { entry_number: number; pokedex: NamedRef }[];
}

interface GrowthRateResponse {
  name: string;
  levels: { level: number; experience: number }[];
}

/** `/move/{name}` — one course in the curriculum analogy. */
interface MoveResponse {
  id: number;
  name: string;
  type: NamedRef | null;
  damage_class: NamedRef | null;
  generation: NamedRef | null;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  priority: number | null;
  effect_chance: number | null;
  effect_entries?: { effect: string; short_effect: string; language: NamedRef }[];
  flavor_text_entries?: { flavor_text: string; language: NamedRef }[];
  meta?: {
    ailment: NamedRef | null;
    ailment_chance: number | null;
    crit_rate: number | null;
    drain: number | null;
    healing: number | null;
  } | null;
  target: NamedRef | null;
  /**
   * Which machine teaches this move, per game. Comes free with this response —
   * only resolving each `machine.url` costs a request.
   *
   * **Not in chronological order**: Facade lists Let's Go, then Sword/Shield,
   * then Ruby/Sapphire. Recency comes from the version group's `order`.
   */
  machines?: { machine: { url: string }; version_group: NamedRef }[];
}

/** One (species, move, method) enrolment, before move ids are resolved. */
interface LearnedMove {
  moveName: string;
  learnMethod: string;
  levelLearnedAt: number;
  versionGroup: string | null;
}

interface VersionGroupResponse {
  id: number;
  name: string;
  /** Chronological position. NOT the id — see `fetchVersionGroupOrder`. */
  order: number | null;
}

/**
 * One `evolution_details` entry. Everything is nullable — a given trigger uses
 * only a few of these fields, and PokeAPI sends the rest as null rather than
 * omitting them.
 */
interface EvolutionDetail {
  trigger: NamedRef | null;
  min_level: number | null;
  min_happiness: number | null;
  min_beauty: number | null;
  min_affection: number | null;
  item: NamedRef | null;
  held_item: NamedRef | null;
  known_move: NamedRef | null;
  known_move_type: NamedRef | null;
  time_of_day: string | null;
  location: NamedRef | null;
  gender: number | null;
  trade_species: NamedRef | null;
  party_species: NamedRef | null;
  party_type: NamedRef | null;
  relative_physical_stats: number | null;
  needs_overworld_rain: boolean | null;
  turn_upside_down: boolean | null;
}

interface ChainLink {
  species: NamedRef;
  evolves_to: ChainLink[];
  evolution_details: EvolutionDetail[];
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
  evolutionCondition: string | null;
  evolutionRequirements: EvolutionRequirement[] | null;
  isFullyEvolved: boolean;
}

/** `https://pokeapi.co/api/v2/pokemon-species/25/` → 25 */
function idFromUrl(url: string): number | null {
  const match = /\/(\d+)\/?$/.exec(url);
  return match?.[1] ? Number.parseInt(match[1], 10) : null;
}

/**
 * PokeAPI's `evolution_details` sends every field, nulling the ones that don't
 * apply — so a level-up entry carries eighteen keys of which one matters. This
 * drops the nulls, keeping the stored jsonb to just the conditions that are
 * actually part of the requirement.
 */
function toRequirement(detail: EvolutionDetail): EvolutionRequirement {
  const req: EvolutionRequirement = { trigger: detail.trigger?.name ?? null };

  if (detail.min_level !== null) req.minLevel = detail.min_level;
  if (detail.min_happiness !== null) req.minHappiness = detail.min_happiness;
  if (detail.min_beauty !== null) req.minBeauty = detail.min_beauty;
  if (detail.min_affection !== null) req.minAffection = detail.min_affection;
  if (detail.item) req.item = detail.item.name;
  if (detail.held_item) req.heldItem = detail.held_item.name;
  if (detail.known_move) req.knownMove = detail.known_move.name;
  if (detail.known_move_type) req.knownMoveType = detail.known_move_type.name;
  // Empty string is PokeAPI's "no restriction" for time_of_day, not a value.
  if (detail.time_of_day) req.timeOfDay = detail.time_of_day;
  if (detail.location) req.location = detail.location.name;
  // Gender ids: 1 = female, 2 = male. 3 (genderless) never gates an evolution.
  if (detail.gender === 1) req.gender = 'female';
  if (detail.gender === 2) req.gender = 'male';
  if (detail.trade_species) req.tradeSpecies = detail.trade_species.name;
  if (detail.party_species) req.partySpecies = detail.party_species.name;
  if (detail.party_type) req.partyType = detail.party_type.name;
  if (detail.relative_physical_stats !== null) {
    req.relativePhysicalStats = detail.relative_physical_stats;
  }
  if (detail.needs_overworld_rain) req.needsOverworldRain = true;
  if (detail.turn_upside_down) req.turnUpsideDown = true;

  return req;
}

/**
 * `thunder-stone` → `Thunder Stone`.
 *
 * Hand the slug to `titleCase` intact — it splits on the hyphens itself, so
 * replacing them with spaces first leaves only the first word capitalised.
 */
function readable(slug: string): string {
  return titleCase(slug);
}

/**
 * Flattens one requirement into a sentence for display.
 *
 * This exists because `evolution_min_level` is null for roughly a third of the
 * dex — the requirement is a stone, a trade, friendship, a location, or a time
 * of day, and without this the UI could only say "—". The trigger sets the
 * opening clause; everything else is an additional condition on top of it.
 */
function describeRequirement(req: EvolutionRequirement): string {
  const clauses: string[] = [];

  switch (req.trigger) {
    case 'use-item':
      clauses.push(req.item ? `Use a ${readable(req.item)}` : 'Use an item');
      break;
    case 'trade':
      clauses.push(req.tradeSpecies ? `Trade for a ${readable(req.tradeSpecies)}` : 'Trade');
      break;
    case 'shed':
      clauses.push('Level 20 with a free party slot and a spare Poké Ball');
      break;
    case 'three-critical-hits':
      clauses.push('Land three critical hits in one battle');
      break;
    case 'take-damage':
      clauses.push('Take 49 damage, then pass under a specific arch');
      break;
    case 'spin':
      clauses.push('Spin while holding a Sweet');
      break;
    case 'tower-of-darkness':
      clauses.push('Train in the Tower of Darkness');
      break;
    case 'tower-of-waters':
      clauses.push('Train in the Tower of Waters');
      break;
    case 'agile-style-move':
      clauses.push('Use an agile-style move 20 times');
      break;
    case 'strong-style-move':
      clauses.push('Use a strong-style move 20 times');
      break;
    case 'recoil-damage':
      clauses.push('Take 294 recoil damage without fainting');
      break;
    default:
      // level-up, other, and anything PokeAPI adds later.
      if (req.minLevel !== undefined) clauses.push(`Level ${req.minLevel}`);
      else if (req.minHappiness !== undefined) clauses.push('Level up with high friendship');
      else if (req.minAffection !== undefined) clauses.push('Level up with high affection');
      else if (req.minBeauty !== undefined) clauses.push('Level up with high beauty');
      else clauses.push('Level up');
  }

  // Conditions layered on top of the trigger. `minLevel` is only mentioned
  // again when the opening clause wasn't already the level itself.
  if (req.minLevel !== undefined && !clauses[0]!.startsWith('Level ')) {
    clauses.push(`at level ${req.minLevel}`);
  }
  if (req.minHappiness !== undefined && !clauses[0]!.includes('friendship')) {
    clauses.push('with high friendship');
  }
  if (req.heldItem) clauses.push(`holding a ${readable(req.heldItem)}`);
  if (req.knownMove) clauses.push(`knowing ${readable(req.knownMove)}`);
  if (req.knownMoveType) clauses.push(`knowing a ${readable(req.knownMoveType)}-type move`);
  if (req.timeOfDay) clauses.push(`during the ${req.timeOfDay}`);
  if (req.location) clauses.push(`at ${readable(req.location)}`);
  if (req.partySpecies) clauses.push(`with a ${readable(req.partySpecies)} in the party`);
  if (req.partyType) clauses.push(`with a ${readable(req.partyType)}-type in the party`);
  if (req.relativePhysicalStats !== undefined) {
    const comparison =
      req.relativePhysicalStats > 0
        ? 'Attack above Defense'
        : req.relativePhysicalStats < 0
          ? 'Defense above Attack'
          : 'Attack equal to Defense';
    clauses.push(`with ${comparison}`);
  }
  if (req.needsOverworldRain) clauses.push('while it is raining');
  if (req.turnUpsideDown) clauses.push('with the console turned upside down');

  // Gender is a parenthetical rather than another clause, so it reads
  // "Use a Dawn Stone (female only)" and not "…Dawn Stone, (female only)".
  const sentence = clauses.join(', ');
  return req.gender ? `${sentence} (${req.gender} only)` : sentence;
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
    // There can be more than one entry: Sylveon has two routes, and Mantine's
    // is a single entry with several simultaneous conditions. Every route is
    // kept; the first is the one flattened for display.
    const requirements = link.evolution_details.map(toRequirement);
    const primary = requirements[0];

    facts.set(speciesId, {
      evolutionChainId: chain.id,
      evolvesFromId: parentId,
      evolutionStage: stage,
      chainLength,
      // First route that names a level — some species reach the same stage by
      // a level on one route and an item on another.
      evolutionMinLevel: requirements.find((r) => r.minLevel !== undefined)?.minLevel ?? null,
      evolutionTrigger: primary?.trigger ?? null,
      evolutionCondition: primary ? describeRequirement(primary) : null,
      evolutionRequirements: requirements.length > 0 ? requirements : null,
      isFullyEvolved: link.evolves_to.length === 0,
    });

    for (const child of link.evolves_to) visit(child, stage + 1, speciesId);
  }

  visit(chain.chain, 1, null);
  return facts;
}

/** `ho-oh` → `Ho Oh`, `porygon-z` → `Porygon Z`, `mr-mime` → `Mr Mime`. */
function statValue(stats: PokemonResponse['stats'], name: string): number {
  return stats.find((s) => s.stat.name === name)?.base_stat ?? 0;
}

/** EV yield for one stat — PokeAPI calls it `effort`. */
function effortValue(stats: PokemonResponse['stats'], name: string): number {
  return stats.find((s) => s.stat.name === name)?.effort ?? 0;
}

/**
 * Pokédex flavour text is stored per game, so a species has ~30 entries and
 * they differ. The **last** English one is taken because PokeAPI orders entries
 * by version group, oldest first — so the tail is the most recent game's copy,
 * which uses current names and modern phrasing.
 *
 * The text itself is wrapped for a Game Boy screen: it carries hard newlines,
 * form feeds between pages, and soft hyphens mid-word. Those are stripped so it
 * reflows in a browser.
 */
function pickFlavorText(
  species: SpeciesResponse,
): { text: string; version: string | null } | null {
  const english = (species.flavor_text_entries ?? []).filter((e) => ENGLISH(e.language));
  const entry = english[english.length - 1];
  if (!entry) return null;

  const text = entry.flavor_text
    .replace(/­\s*/g, '') // soft hyphen, plus the line break that followed it
    .replace(/[\n\f\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text ? { text, version: entry.version?.name ?? null } : null;
}

/** `{ kanto: 25 }` — regional dex numbers, keyed by pokédex slug. */
function pickRegionalDexNumbers(species: SpeciesResponse): RegionalDexNumbers | null {
  const entries = species.pokedex_numbers ?? [];
  if (entries.length === 0) return null;

  const numbers: RegionalDexNumbers = {};
  for (const entry of entries) {
    // `national` is already this row's primary key — storing it twice would
    // invite the two copies to disagree.
    if (entry.pokedex.name !== 'national') numbers[entry.pokedex.name] = entry.entry_number;
  }

  return Object.keys(numbers).length > 0 ? numbers : null;
}

/**
 * Chronological rank per version group, keyed by slug.
 *
 * Version group **ids are not chronological** — PokeAPI added the Japanese
 * Gen-1 re-releases late, so `blue-japan` holds id 29 while being one of the
 * oldest games. Their `order` field is the real sequence (`blue-japan` is 2,
 * `scarlet-violet` is 27), and ranking by id instead dates a Gen-1 species'
 * level-up moves to 1996.
 *
 * One list request plus one per group (~33 total), fetched once per seed.
 */
async function fetchVersionGroupOrder(): Promise<Map<string, number>> {
  const list = await fetchJson<{ results: NamedRef[] }>(`${POKEAPI}/version-group?limit=200`);
  const order = new Map<string, number>();

  await mapWithConcurrency(list.results, env.seedConcurrency, async (ref) => {
    try {
      const group = await fetchJson<VersionGroupResponse>(ref.url);
      order.set(group.name, group.order ?? group.id);
    } catch (err) {
      console.warn(`[seed] version group ${ref.name} failed: ${String(err)}`);
    }
    return null;
  });

  return order;
}

/**
 * Flattens `moves[].version_group_details` to one entry per (move, method).
 *
 * PokeAPI reports a species' movepool per game, so one move appears ~20 times,
 * sometimes at different levels. The most recent game wins, ranked by
 * `versionOrder` — see `fetchVersionGroupOrder` for why that isn't the id.
 * Groups missing from the map sort last so a known date always beats an
 * unknown one.
 */
function pickMoveEntries(detail: PokemonResponse, versionOrder: Map<string, number>): LearnedMove[] {
  const best = new Map<string, { entry: LearnedMove; rank: number }>();

  for (const entry of detail.moves ?? []) {
    for (const detail of entry.version_group_details) {
      const method = detail.move_learn_method.name;
      const key = `${entry.move.name}::${method}`;
      const rank = versionOrder.get(detail.version_group.name) ?? -1;
      const existing = best.get(key);
      if (existing && existing.rank >= rank) continue;

      best.set(key, {
        rank,
        entry: {
          moveName: entry.move.name,
          learnMethod: method,
          // 0 for every method except level-up — PokeAPI's own encoding for
          // "not gated by level", kept so ordering needs no coalesce.
          levelLearnedAt: detail.level_learned_at ?? 0,
          versionGroup: detail.version_group.name,
        },
      });
    }
  }

  return [...best.values()].map((v) => v.entry);
}

/** PokeAPI ships `$effect_chance` as a literal placeholder in the effect text. */
function moveEffect(move: MoveResponse): string | null {
  const entry = (move.effect_entries ?? []).find((e) => ENGLISH(e.language));
  const text = entry?.short_effect ?? entry?.effect;
  if (!text) return null;
  return text.replace(/\$effect_chance/g, String(move.effect_chance ?? 0)).trim();
}

/** Same rule as species flavour text: the most recent English entry wins. */
function moveFlavorText(move: MoveResponse): string | null {
  const english = (move.flavor_text_entries ?? []).filter((e) => ENGLISH(e.language));
  const entry = english[english.length - 1];
  if (!entry) return null;
  return entry.flavor_text.replace(/[\n\f\r]+/g, ' ').replace(/\s+/g, ' ').trim() || null;
}

const DAMAGE_CLASSES = new Set<string>(['physical', 'special', 'status']);

function buildMoveRow(move: MoveResponse): NewMove | null {
  const damageClass = move.damage_class?.name;
  // The column is an enum, so an unrecognised class has to be dropped rather
  // than written — PokeAPI has only ever shipped the three, but a new one
  // would otherwise fail the whole chunk insert.
  if (!damageClass || !DAMAGE_CLASSES.has(damageClass)) {
    console.warn(`[seed] move ${move.name} has damage class “${damageClass}” — skipping`);
    return null;
  }
  if (!move.type?.name) {
    console.warn(`[seed] move ${move.name} has no type — skipping`);
    return null;
  }

  return {
    id: move.id,
    name: move.name,
    displayName: titleCase(move.name),
    type: move.type.name,
    damageClass: damageClass as MoveDamageClass,
    generation: generationForSlug(move.generation?.name),
    power: move.power,
    accuracy: move.accuracy,
    pp: move.pp,
    priority: move.priority ?? 0,
    effect: moveEffect(move),
    effectChance: move.effect_chance,
    flavorText: moveFlavorText(move),
    ailment: move.meta?.ailment?.name ?? null,
    ailmentChance: move.meta?.ailment_chance ?? null,
    critRate: move.meta?.crit_rate ?? null,
    drain: move.meta?.drain ?? null,
    healing: move.meta?.healing ?? null,
    target: move.target?.name ?? null,
    updatedAt: new Date(),
  };
}

/** A built row plus the evolution chain it belongs to, resolved in a later pass. */
interface BuiltRow {
  row: NewPokemon;
  chainId: number | null;
  /** Movepool as (move name, method) pairs; ids are resolved once moves land. */
  moves: LearnedMove[];
}

async function buildRow(dex: number, versionOrder: Map<string, number>): Promise<BuiltRow | null> {
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

  const evHp = effortValue(detail.stats, 'hp');
  const evAttack = effortValue(detail.stats, 'attack');
  const evDefense = effortValue(detail.stats, 'defense');
  const evSpecialAttack = effortValue(detail.stats, 'special-attack');
  const evSpecialDefense = effortValue(detail.stats, 'special-defense');
  const evSpeed = effortValue(detail.stats, 'speed');

  // Slot order is the order the games list them in; the hidden ability is
  // pulled out separately because it isn't selectable the way the others are.
  const sortedAbilities = [...detail.abilities].sort((a, b) => a.slot - b.slot);
  const flavor = species ? pickFlavorText(species) : null;

  const row: NewPokemon = {
    id: detail.id,
    name: detail.name,
    displayName: titleCase(detail.name),
    // The species' own generation, falling back to dex-number bucketing only
    // when the species fetch failed. The buckets are wrong for any form whose
    // dex id is in the 10000s, which is why the API value wins.
    generation: generationForSlug(species?.generation?.name) ?? generationForDexNumber(detail.id),
    type1,
    type2: sortedTypes[1]?.type.name ?? null,
    hp,
    attack,
    defense,
    specialAttack,
    specialDefense,
    speed,
    baseStatTotal: hp + attack + defense + specialAttack + specialDefense + speed,
    evHp,
    evAttack,
    evDefense,
    evSpecialAttack,
    evSpecialDefense,
    evSpeed,
    evYieldTotal: evHp + evAttack + evDefense + evSpecialAttack + evSpecialDefense + evSpeed,
    height: detail.height,
    weight: detail.weight,
    baseExperience: detail.base_experience,
    captureRate: species?.capture_rate ?? null,
    abilities: sortedAbilities.filter((a) => !a.is_hidden).map((a) => a.ability.name),
    hiddenAbility: sortedAbilities.find((a) => a.is_hidden)?.ability.name ?? null,
    heldItems: (detail.held_items ?? []).map((h) => h.item.name),
    color: species?.color?.name ?? null,
    genus: species?.genera?.find((g) => ENGLISH(g.language))?.genus ?? null,
    flavorText: flavor?.text ?? null,
    flavorTextVersion: flavor?.version ?? null,
    eggGroups: species?.egg_groups?.map((g) => g.name) ?? [],
    habitat: species?.habitat?.name ?? null,
    shape: species?.shape?.name ?? null,
    isBaby: species?.is_baby ?? false,
    genderRate: species?.gender_rate ?? null,
    baseHappiness: species?.base_happiness ?? null,
    hatchCounter: species?.hatch_counter ?? null,
    // Non-default varieties only — the default one is this row.
    varieties: species?.varieties?.filter((v) => !v.is_default).map((v) => v.pokemon.name) ?? [],
    regionalDexNumbers: species ? pickRegionalDexNumbers(species) : null,
    growthRate: species?.growth_rate?.name ?? null,
    isLegendary: species?.is_legendary ?? false,
    isMythical: species?.is_mythical ?? false,
    spriteUrl: detail.sprites.front_default,
    artworkUrl: detail.sprites.other?.['official-artwork']?.front_default ?? detail.sprites.front_default,
    shinySpriteUrl: detail.sprites.front_shiny,
    shinyArtworkUrl:
      detail.sprites.other?.['official-artwork']?.front_shiny ?? detail.sprites.front_shiny,
    homeArtworkUrl: detail.sprites.other?.home?.front_default ?? null,
    cryUrl: detail.cries?.latest ?? detail.cries?.legacy ?? null,
    updatedAt: new Date(),
  };

  return {
    row,
    chainId: species?.evolution_chain ? idFromUrl(species.evolution_chain.url) : null,
    // Free — the movepool is already in the /pokemon response above. Only the
    // move *details* cost extra requests, and those are fetched once each.
    moves: pickMoveEntries(detail, versionOrder),
  };
}

/**
 * Imports moves and the species→move join table.
 *
 * The movepool itself came free with the `/pokemon` fetches in the first pass;
 * this adds one `/move/{name}` request per **distinct** move (~900 for the full
 * dex, against ~110k join rows), which is the whole extra cost of the feature.
 * Set SEED_MOVES=false to skip it.
 */
async function seedMoves(built: BuiltRow[]) {
  const slugs = [...new Set(built.flatMap((b) => b.moves.map((m) => m.moveName)))];
  if (slugs.length === 0) {
    console.log('[seed] no moves found in the fetched Pokémon — skipping.');
    return;
  }

  console.log(`[seed] fetching ${slugs.length} moves…`);

  const moveRows: NewMove[] = [];
  const moveFailures: string[] = [];
  let done = 0;

  await mapWithConcurrency(slugs, env.seedConcurrency, async (slug) => {
    try {
      const row = buildMoveRow(await fetchJson<MoveResponse>(`${POKEAPI}/move/${slug}`));
      if (row) moveRows.push(row);
    } catch (err) {
      moveFailures.push(slug);
      console.warn(`[seed] move ${slug} failed: ${String(err)}`);
    }
    done += 1;
    if (done % 200 === 0) console.log(`[seed]   …${done}/${slugs.length} moves`);
    return null;
  });

  const CHUNK = 200;
  for (let i = 0; i < moveRows.length; i += CHUNK) {
    await db
      .insert(moves)
      .values(moveRows.slice(i, i + CHUNK))
      .onConflictDoUpdate({
        target: moves.id,
        set: {
          name: sql`excluded.name`,
          displayName: sql`excluded.display_name`,
          type: sql`excluded.type`,
          damageClass: sql`excluded.damage_class`,
          generation: sql`excluded.generation`,
          power: sql`excluded.power`,
          accuracy: sql`excluded.accuracy`,
          pp: sql`excluded.pp`,
          priority: sql`excluded.priority`,
          effect: sql`excluded.effect`,
          effectChance: sql`excluded.effect_chance`,
          flavorText: sql`excluded.flavor_text`,
          ailment: sql`excluded.ailment`,
          ailmentChance: sql`excluded.ailment_chance`,
          critRate: sql`excluded.crit_rate`,
          drain: sql`excluded.drain`,
          healing: sql`excluded.healing`,
          target: sql`excluded.target`,
          updatedAt: sql`now()`,
        },
      });
  }

  // Moves whose fetch failed have no row to reference, so their join rows are
  // dropped rather than breaking the foreign key for everything else.
  const idByName = new Map(moveRows.map((row) => [row.name, row.id]));
  const joinRows: NewPokemonMove[] = [];
  let orphaned = 0;

  for (const entry of built) {
    for (const learned of entry.moves) {
      const moveId = idByName.get(learned.moveName);
      if (moveId === undefined) {
        orphaned += 1;
        continue;
      }
      joinRows.push({
        pokemonId: entry.row.id,
        moveId,
        learnMethod: learned.learnMethod,
        levelLearnedAt: learned.levelLearnedAt,
        versionGroup: learned.versionGroup,
      });
    }
  }

  /*
   * Replace rather than upsert. A move dropped from a species' movepool in a
   * later game has no row in `joinRows` to conflict with, so an upsert would
   * leave the stale one behind forever — and `pokemon_moves` is reference data
   * with nothing user-authored to preserve.
   */
  const pokemonIds = built.map((b) => b.row.id);
  for (let i = 0; i < pokemonIds.length; i += CHUNK) {
    await db.delete(pokemonMoves).where(inArray(pokemonMoves.pokemonId, pokemonIds.slice(i, i + CHUNK)));
  }

  // Five columns per row, so 1,000 rows is 5,000 bind parameters — well inside
  // Postgres' 65,535 cap and an order of magnitude fewer round trips.
  const JOIN_CHUNK = 1000;
  for (let i = 0; i < joinRows.length; i += JOIN_CHUNK) {
    await db.insert(pokemonMoves).values(joinRows.slice(i, i + JOIN_CHUNK)).onConflictDoNothing();
  }

  // `learned_by_count` is denormalised onto `moves` because the moves list
  // sorts and filters by it on every request. Recomputed here rather than
  // maintained incrementally — the seed is the only writer.
  await db.execute(sql`
    update ${moves}
       set learned_by_count = coalesce((
             select count(distinct pm.pokemon_id)::int
               from ${pokemonMoves} pm
              where pm.move_id = ${moves}.id
           ), 0)
  `);

  console.log(
    `[seed] wrote ${moveRows.length} moves and ${joinRows.length} species-move rows` +
      (orphaned ? ` (${orphaned} join rows dropped — their move fetch failed)` : ''),
  );
  if (moveFailures.length) {
    console.warn(`[seed] ${moveFailures.length} moves failed: ${moveFailures.join(', ')}`);
  }

}

async function main() {
  const dexNumbers = Array.from({ length: env.seedLimit }, (_, i) => i + 1);

  // Fetched first: every movepool row is deduped against this ordering.
  const versionOrder = env.seedMoves ? await fetchVersionGroupOrder() : new Map<string, number>();
  if (env.seedMoves) console.log(`[seed] ranked ${versionOrder.size} version groups by release order.`);

  console.log(`[seed] fetching #1–#${env.seedLimit} from PokeAPI (concurrency ${env.seedConcurrency})…`);

  let completed = 0;
  const failures: number[] = [];

  const rows = await mapWithConcurrency(dexNumbers, env.seedConcurrency, async (dex) => {
    try {
      const row = await buildRow(dex, versionOrder);
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

  // Coverage of the species-derived fields. These come from the `/pokemon-species`
  // fetch, which is allowed to fail softly — so a low number here means those
  // requests were failing, not that PokeAPI lacks the data.
  const coverage = (predicate: (row: NewPokemon) => boolean) =>
    `${valid.filter(predicate).length}/${valid.length}`;
  console.log(
    `[seed]   flavour text ${coverage((r) => !!r.flavorText)} · ` +
      `genus ${coverage((r) => !!r.genus)} · ` +
      `habitat ${coverage((r) => !!r.habitat)} · ` +
      `hidden ability ${coverage((r) => !!r.hiddenAbility)} · ` +
      `cry ${coverage((r) => !!r.cryUrl)}`,
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
          evHp: sql`excluded.ev_hp`,
          evAttack: sql`excluded.ev_attack`,
          evDefense: sql`excluded.ev_defense`,
          evSpecialAttack: sql`excluded.ev_special_attack`,
          evSpecialDefense: sql`excluded.ev_special_defense`,
          evSpeed: sql`excluded.ev_speed`,
          evYieldTotal: sql`excluded.ev_yield_total`,
          height: sql`excluded.height`,
          weight: sql`excluded.weight`,
          baseExperience: sql`excluded.base_experience`,
          captureRate: sql`excluded.capture_rate`,
          abilities: sql`excluded.abilities`,
          hiddenAbility: sql`excluded.hidden_ability`,
          heldItems: sql`excluded.held_items`,
          color: sql`excluded.color`,
          genus: sql`excluded.genus`,
          flavorText: sql`excluded.flavor_text`,
          flavorTextVersion: sql`excluded.flavor_text_version`,
          eggGroups: sql`excluded.egg_groups`,
          habitat: sql`excluded.habitat`,
          shape: sql`excluded.shape`,
          isBaby: sql`excluded.is_baby`,
          genderRate: sql`excluded.gender_rate`,
          baseHappiness: sql`excluded.base_happiness`,
          hatchCounter: sql`excluded.hatch_counter`,
          varieties: sql`excluded.varieties`,
          regionalDexNumbers: sql`excluded.regional_dex_numbers`,
          growthRate: sql`excluded.growth_rate`,
          isLegendary: sql`excluded.is_legendary`,
          isMythical: sql`excluded.is_mythical`,
          spriteUrl: sql`excluded.sprite_url`,
          artworkUrl: sql`excluded.artwork_url`,
          shinySpriteUrl: sql`excluded.shiny_sprite_url`,
          shinyArtworkUrl: sql`excluded.shiny_artwork_url`,
          homeArtworkUrl: sql`excluded.home_artwork_url`,
          cryUrl: sql`excluded.cry_url`,
          evolutionChainId: sql`excluded.evolution_chain_id`,
          evolvesFromId: sql`excluded.evolves_from_id`,
          evolutionStage: sql`excluded.evolution_stage`,
          chainLength: sql`excluded.chain_length`,
          evolutionMinLevel: sql`excluded.evolution_min_level`,
          evolutionTrigger: sql`excluded.evolution_trigger`,
          evolutionCondition: sql`excluded.evolution_condition`,
          evolutionRequirements: sql`excluded.evolution_requirements`,
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

  // --- Fourth pass: the type chart -----------------------------------------
  // 18 requests flat, independent of SEED_LIMIT and of the moves import.
  await seedTypeChart();

  // --- Fifth pass: ability effect text -------------------------------------
  // Reads the slugs `pokemon` was just written with, so it scales with
  // SEED_LIMIT rather than fetching all 370 abilities every time.
  if (env.seedAbilities) {
    await seedAbilities();
  } else {
    console.log('[seed] SEED_ABILITIES=false — skipping abilities; they will render as slugs.');
  }

  // --- Sixth pass: natures --------------------------------------------------
  // 26 requests flat and independent of everything else, like the type chart.
  await seedNatures();

  // --- Seventh pass: moves --------------------------------------------------
  // The only pass that costs requests beyond the dex itself, which is why it
  // can be turned off.
  if (env.seedMoves) {
    await seedMoves(built);
    if (env.seedMachines) {
      await seedMachines();
    } else {
      console.log('[seed] SEED_MACHINES=false — skipping TM numbers.');
    }
  } else {
    console.log('[seed] SEED_MOVES=false — skipping moves.');
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
