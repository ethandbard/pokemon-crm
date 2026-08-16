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
 * `thick-fat` → `Thick Fat`. PokeAPI names everything in slugs, so both the seed
 * scripts and the routes that quote a slug back to the user need this. The
 * client has its own copy as `slugLabel` in `lib/format.ts`.
 */
export function titleCase(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(' ');
}

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
  /**
   * A member carrying no moves at all. The heaviest signal here: it cannot
   * attack, and it contributes nothing to the team's coverage, so every
   * analysis figure understates the roster until it is fixed.
   */
  movesetMissing: 50,
  /** Per empty slot, for a member with 1–3 of its 4 moves set. */
  movesetIncompletePerSlot: 8,
  /** No `reviewed` flag has ever been set for this roster member. */
  neverReviewed: 40,
  /** Days past `staleAfterDays` are worth this much each, capped. */
  stalePerDay: 1.5,
  staleAfterDays: 30,
  staleCap: 45,

  /* ---- Trainer-level alerts (getRosterAlerts), not member scores ---- */

  /** A full party is six; below that the roster has holes to fill. */
  fullRosterSize: 6,
  /**
   * Members a type must hit for 2× before an unanswered weakness is an alert.
   * One exposed member is a matchup; several with no reply is a structural
   * problem — the same threshold the team analysis uses for `threats`.
   */
  sharedWeaknessMembers: 2,

  /** Retired roster members are history, not workload — never surfaced. */
  excludeStatuses: ['retired'] as const,
} as const;

/**
 * Why a roster member is in the queue.
 *
 * `behind_pace` was removed with the model that produced it: it rested on
 * `expPerDay`, an invented EXP-per-day constant PokeAPI has no equivalent for,
 * so it reported a simulation as a finding. `flagged` and `milestone_overdue`
 * went with it to keep the queue about roster readiness rather than a mix of
 * readiness, hand-raised concerns, and level bookkeeping.
 */
export type AttentionReasonCode =
  | 'never_reviewed'
  | 'stale_review'
  | 'moveset_missing'
  | 'moveset_incomplete';

/** Why a whole roster is flagged, independent of any one member. */
export type RosterAlertCode = 'roster_incomplete' | 'unanswered_weakness';

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
