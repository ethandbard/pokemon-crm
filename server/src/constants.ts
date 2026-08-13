/**
 * Fallback attribution for a write that names no acting user — an API call with
 * no `X-Acting-User` header and no `owner` in the body. The switcher normally
 * supplies one; see `ownerFor` in `owner.ts`.
 *
 * Also the email of the seeded user this row belongs to, so the fallback is a
 * real person in the directory rather than an orphan string.
 */
export const DEFAULT_OWNER = 'demo@pokemon-crm.local';

/**
 * The starting user directory, written by `seed:users`.
 *
 * Demo identities, not accounts: there is no password anywhere in this app.
 * The first entry is DEFAULT_OWNER and must stay in this list, or unattributed
 * writes land under an email with no matching user row.
 */
export const SEED_USERS = [
  { email: DEFAULT_OWNER, name: 'Demo Advisor', role: 'Advisor', initials: 'DA' },
  { email: 'oak@pokemon-crm.local', name: 'Professor Oak', role: 'Professor', initials: 'PO' },
  { email: 'juniper@pokemon-crm.local', name: 'Professor Juniper', role: 'Professor', initials: 'PJ' },
  { email: 'nurse.joy@pokemon-crm.local', name: 'Nurse Joy', role: 'Care', initials: 'NJ' },
] as const;

/**
 * Needs-attention scoring — the early-alert model.
 *
 * Every weight lives here so the model can be tuned in one place, and so the
 * API can return the *reasons* alongside the score. A score with no explanation
 * isn't actionable, so each signal carries the copy used to explain itself.
 *
 * Scores are unbounded sums; only the ranking matters, not the absolute number.
 */
export const ATTENTION = {
  /** No `reviewed` flag has ever been set for this roster member. */
  neverReviewed: 40,
  /** Days past `staleAfterDays` are worth this much each, capped. */
  stalePerDay: 1.5,
  staleAfterDays: 30,
  staleCap: 45,
  /** An explicit `flagged` status — someone already raised a concern. */
  flagged: 35,
  /** Met the level requirement for its next stage but hasn't evolved. */
  milestoneOverdue: 30,
  /** Per level behind the pace its growth curve implies, capped. */
  behindPacePerLevel: 2.5,
  behindPaceCap: 30,
  /** Levels behind before the signal fires at all — absorbs rounding noise. */
  behindPaceTolerance: 3,

  /**
   * Simulation constant: assumed EXP earned per day on a roster.
   *
   * There is no real-world training rate to read from PokeAPI — growth rates
   * give EXP-per-level, not EXP-per-day. This turns "time on roster" into an
   * expected level via the species' real curve. It is an explicit modelling
   * assumption, not a measurement; tune it if rosters read as uniformly
   * behind or uniformly ahead.
   *
   * Calibrated so a year on roster lands around level 65 on the `medium`
   * curve, which puts expected levels in the same band as the seeded ones
   * (29–72). Raising it makes the queue harsher for everyone equally.
   */
  expPerDay: 700,

  /** Retired roster members are history, not workload — never surfaced. */
  excludeStatuses: ['retired'] as const,
} as const;

export type AttentionReasonCode =
  | 'never_reviewed'
  | 'stale_review'
  | 'flagged'
  | 'milestone_overdue'
  | 'behind_pace';

export const POKEMON_TYPES = [
  'normal',
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
] as const;

export type PokemonType = (typeof POKEMON_TYPES)[number];

/**
 * Highest National Dex number per generation.
 *
 * Only a **fallback** now — `generation` comes from the species' own
 * `generation` field during the seed (see `generationForSlug`). This bucketing
 * is correct for dex 1–1025 but wrong for any regional form or variety, whose
 * ids are in the 10000s and would silently bucket as generation 9.
 */
export const GENERATION_MAX_DEX = [151, 251, 386, 493, 649, 721, 809, 905, 1025] as const;

export function generationForDexNumber(dex: number): number {
  const index = GENERATION_MAX_DEX.findIndex((max) => dex <= max);
  return index === -1 ? GENERATION_MAX_DEX.length : index + 1;
}

/**
 * `generation-iv` → 4. PokeAPI names generations with lowercase Roman
 * numerals; this is the authoritative source the dex-number buckets above were
 * only ever approximating.
 */
const GENERATION_SLUGS = [
  'generation-i',
  'generation-ii',
  'generation-iii',
  'generation-iv',
  'generation-v',
  'generation-vi',
  'generation-vii',
  'generation-viii',
  'generation-ix',
] as const;

export function generationForSlug(slug: string | null | undefined): number | null {
  const index = GENERATION_SLUGS.indexOf(slug as (typeof GENERATION_SLUGS)[number]);
  return index === -1 ? null : index + 1;
}

/**
 * Regions, mapped to the PokeAPI pokédex slugs that cover them.
 *
 * `pokemon.regional_dex_numbers` is keyed by pokédex slug, and a region often
 * has several — Kanto appears as both the original dex and the Let's Go one,
 * Kalos is split into three sub-dexes. A species counts as belonging to a
 * region if it appears in **any** of that region's dexes.
 *
 * This is what gives `trainers.region` an actual data relationship: a Kanto
 * trainer's roster can now be checked against the Kanto dex.
 */
export const REGION_POKEDEXES = {
  Kanto: ['kanto', 'letsgo-kanto'],
  Johto: ['original-johto', 'updated-johto'],
  Hoenn: ['hoenn', 'updated-hoenn'],
  Sinnoh: ['original-sinnoh', 'extended-sinnoh'],
  Unova: ['original-unova', 'updated-unova'],
  Kalos: ['kalos-central', 'kalos-coastal', 'kalos-mountain'],
  Alola: ['original-alola', 'updated-alola'],
  Galar: ['galar', 'isle-of-armor', 'crown-tundra'],
  Hisui: ['hisui'],
  Paldea: ['paldea', 'kitakami', 'blueberry'],
} as const;

export const REGIONS = Object.keys(REGION_POKEDEXES) as [Region, ...Region[]];

export type Region = keyof typeof REGION_POKEDEXES;
