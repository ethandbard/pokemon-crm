/**
 * Type effectiveness, computed from the `type_damage` matrix.
 *
 * Same split as `attention.ts`: SQL fetches the 324-row chart, TypeScript does
 * the arithmetic. The matrix is small and never changes between seeds, so it is
 * loaded once and cached for the life of the process.
 *
 * **The chart stays on the server.** Callers get the conclusions — what a
 * species is weak to, what a roster can and cannot answer — not the matrix
 * itself. Shipping 324 rows to the client so it can recompute what a join
 * already knows is the thing this module exists to avoid.
 *
 * Multipliers are hundredths throughout, matching the column: 25, 50, 100, 200,
 * 400. See `db/schema.ts` § typeDamage for why they are integers.
 */
import { db } from './db/client.js';
import { typeDamage } from './db/schema.js';
import { POKEMON_TYPES } from './constants.js';

/** `attacking > defending` → multiplier in hundredths. */
type TypeChart = Map<string, number>;

let cached: Promise<TypeChart> | null = null;

/**
 * The matrix, loaded once.
 *
 * A rejection is not cached, so a failed first call (the seed hasn't run yet,
 * the DB blipped) can be retried rather than poisoning the process — the same
 * rule the Tableau embed's script loader follows.
 */
export function loadTypeChart(): Promise<TypeChart> {
  if (!cached) {
    cached = db
      .select({
        attackingType: typeDamage.attackingType,
        defendingType: typeDamage.defendingType,
        multiplier: typeDamage.multiplier,
      })
      .from(typeDamage)
      .then((rows) => {
        const chart: TypeChart = new Map();
        for (const row of rows) {
          chart.set(`${row.attackingType}>${row.defendingType}`, row.multiplier);
        }
        return chart;
      })
      .catch((err) => {
        cached = null;
        throw err;
      });
  }
  return cached;
}

/** Drops the cache. The seed rewrites the matrix; a long-lived process shouldn't hold a stale copy. */
export function resetTypeChart(): void {
  cached = null;
}

/**
 * How hard `attacking` hits a defender of these types, in hundredths.
 *
 * Dual types multiply, which is where the four-times weaknesses and the
 * quarter-damage resistances come from. An unknown type (a matrix that hasn't
 * been seeded, a form carrying something exotic) contributes a neutral 100
 * rather than a 0 — an absent row must not read as an immunity.
 */
export function multiplierAgainst(
  chart: TypeChart,
  attacking: string,
  type1: string,
  type2: string | null,
): number {
  const first = chart.get(`${attacking}>${type1}`) ?? 100;
  const second = type2 ? (chart.get(`${attacking}>${type2}`) ?? 100) : 100;
  return (first * second) / 100;
}

export interface Matchup {
  type: string;
  /** Hundredths: 0, 25, 50, 100, 200, 400. */
  multiplier: number;
}

export interface DefensiveProfile {
  /** Everything that hits for more than neutral, hardest first. */
  weaknesses: Matchup[];
  /** Everything that hits for less than neutral but still lands, most resisted first. */
  resistances: Matchup[];
  /** Multiplier 0 — the free switch-ins. */
  immunities: Matchup[];
}

/**
 * What a species takes from each of the 18 attacking types.
 *
 * Neutral matchups are deliberately **not** returned: they are the majority of
 * the 18 and carry no advising signal. The three lists together are what the
 * Profile renders.
 */
export function defensiveProfile(
  chart: TypeChart,
  type1: string,
  type2: string | null,
): DefensiveProfile {
  const profile: DefensiveProfile = { weaknesses: [], resistances: [], immunities: [] };

  for (const type of POKEMON_TYPES) {
    const multiplier = multiplierAgainst(chart, type, type1, type2);
    const entry: Matchup = { type, multiplier };

    if (multiplier === 0) profile.immunities.push(entry);
    else if (multiplier > 100) profile.weaknesses.push(entry);
    else if (multiplier < 100) profile.resistances.push(entry);
  }

  // Worst first for weaknesses, best first for resistances — each list leads
  // with the matchup that matters most.
  profile.weaknesses.sort((a, b) => b.multiplier - a.multiplier || a.type.localeCompare(b.type));
  profile.resistances.sort((a, b) => a.multiplier - b.multiplier || a.type.localeCompare(b.type));

  return profile;
}
