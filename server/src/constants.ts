/**
 * Every write is attributed to this owner until real auth exists. The `owner`
 * columns are already in place, so swapping this for a session user is a
 * change to the route handlers only — no migration.
 */
export const DEFAULT_OWNER = 'demo@pokemon-crm.local';

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

/** Highest National Dex number per generation, used to bucket seeded rows. */
export const GENERATION_MAX_DEX = [151, 251, 386, 493, 649, 721, 809, 905, 1025] as const;

export function generationForDexNumber(dex: number): number {
  const index = GENERATION_MAX_DEX.findIndex((max) => dex <= max);
  return index === -1 ? GENERATION_MAX_DEX.length : index + 1;
}
