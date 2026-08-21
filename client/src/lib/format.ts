import type { ActivityKind, RosterStatus } from './types';

/**
 * Conventional Pokémon type colors. These are used for *badges only* — they're
 * a domain convention players recognise, and 18 categories is far past what any
 * validated categorical palette can separate. Charts use the series tokens in
 * index.css instead.
 */
export const TYPE_COLORS: Record<string, string> = {
  normal: '#9099a1',
  fire: '#ff9d55',
  water: '#4d90d5',
  electric: '#f4d23c',
  grass: '#63bc5a',
  ice: '#73cec0',
  fighting: '#ce4069',
  poison: '#ab6ac8',
  ground: '#d97845',
  flying: '#8fa8dd',
  psychic: '#fa7179',
  bug: '#90c12c',
  rock: '#c7b78b',
  ghost: '#5269ad',
  dragon: '#0b6dc3',
  dark: '#5a5465',
  steel: '#5a8ea1',
  fairy: '#ec8fe6',
};

export function typeColor(type: string): string {
  return TYPE_COLORS[type] ?? '#898781';
}

/** The 18 canonical types, for form selects that can't wait on a fetch. */
export const POKEMON_TYPE_NAMES = Object.keys(TYPE_COLORS);

/**
 * A type-effectiveness multiplier as players write it. The API sends
 * hundredths (see `TypeMatchup`), so 200 reads as "2×" and 50 as "½×".
 */
export function effectivenessLabel(multiplier: number): string {
  switch (multiplier) {
    case 0:
      return 'No effect';
    case 25:
      return '¼×';
    case 50:
      return '½×';
    case 200:
      return '2×';
    case 400:
      return '4×';
    default:
      return `${multiplier / 100}×`;
  }
}

export const STAT_LABELS = {
  hp: 'HP',
  attack: 'Attack',
  defense: 'Defense',
  specialAttack: 'Sp. Atk',
  specialDefense: 'Sp. Def',
  speed: 'Speed',
} as const;

/**
 * PokeAPI's stat slugs, as `natures.increased_stat` holds them, mapped to the
 * camelCase keys the `pokemon` columns use on the client.
 *
 * Two vocabularies for the same six stats: `special-attack` in nature rows,
 * `specialAttack` in a Pokémon record. Nothing else bridges them.
 *
 * **`hp` is absent on purpose** — no nature affects HP, so a nature row can
 * never name it.
 */
export const NATURE_STAT_KEYS = {
  attack: 'attack',
  defense: 'defense',
  'special-attack': 'specialAttack',
  'special-defense': 'specialDefense',
  speed: 'speed',
} as const satisfies Record<string, keyof typeof STAT_LABELS>;

export type NatureStatSlug = keyof typeof NATURE_STAT_KEYS;

/** The multiplier a nature applies, as a percentage step. Fixed by the games. */
export const NATURE_STEP = 0.1;

/** A nature's stat slug as its display label — `special-attack` → `Sp. Atk`. */
export function natureStatLabel(slug: string | null): string {
  if (!slug) return '—';
  const key = NATURE_STAT_KEYS[slug as NatureStatSlug];
  return key ? STAT_LABELS[key] : slug;
}

/**
 * A nature's effect as a short label — `+Atk / −SpA`, or `neutral`.
 *
 * Used wherever a nature appears as **text**, which is everywhere except the one
 * per-member panel allowed to show adjusted numbers. See CLAUDE.md § Natures for
 * the boundary; the short answer is that a nature-adjusted figure may only be
 * shown for a single named roster member, never inside an aggregate.
 */
export function natureEffectLabel(
  increasedStat: string | null,
  decreasedStat: string | null,
): string {
  // The five neutral natures raise and lower the same stat, so PokeAPI reports
  // both as null. They are a real choice, not missing data — say so rather than
  // rendering an em dash that reads as "not set".
  if (!increasedStat || !decreasedStat) return 'neutral';

  const up = STAT_LABELS[NATURE_STAT_KEYS[increasedStat as NatureStatSlug]] ?? increasedStat;
  const down = STAT_LABELS[NATURE_STAT_KEYS[decreasedStat as NatureStatSlug]] ?? decreasedStat;
  return `+${up} / −${down}`;
}

/**
 * A base stat with this nature's ±10% applied, floored.
 *
 * ⚠️ **This is an adjusted BASE stat, not an in-game battle stat.** The real
 * value also depends on IVs, EVs and level, none of which this app records.
 * Every call site must label it as such — see CLAUDE.md § Natures.
 *
 * Returns the value unchanged for a neutral nature or an unrecognised stat, so a
 * missing `natures` row degrades to "no adjustment" rather than to a wrong one.
 */
export function natureAdjustedStat(
  base: number,
  statKey: keyof typeof STAT_LABELS,
  increasedStat: string | null,
  decreasedStat: string | null,
): number {
  if (increasedStat && NATURE_STAT_KEYS[increasedStat as NatureStatSlug] === statKey) {
    return Math.floor(base * (1 + NATURE_STEP));
  }
  if (decreasedStat && NATURE_STAT_KEYS[decreasedStat as NatureStatSlug] === statKey) {
    return Math.floor(base * (1 - NATURE_STEP));
  }
  return base;
}

export const ACTIVITY_META: Record<ActivityKind, { label: string; icon: string; hint: string }> = {
  caught: { label: 'Caught', icon: '●', hint: 'In the collection' },
  favorite: { label: 'Favorite', icon: '★', hint: 'Starred for quick access' },
  wishlist: { label: 'Wishlist', icon: '◆', hint: 'Wanted, not yet caught' },
  flagged: { label: 'Flagged', icon: '▲', hint: 'Needs follow-up' },
  reviewed: { label: 'Reviewed', icon: '✓', hint: 'Timestamp updates each review' },
};

export const ROSTER_STATUS_META: Record<
  RosterStatus,
  { label: string; hint: string; className: string }
> = {
  starter: {
    label: 'Starter',
    hint: 'Lead Pokémon',
    className: 'border-brand bg-brand/10 text-brand-strong',
  },
  active: {
    label: 'Active',
    hint: 'On the working roster',
    className: 'border-hairline bg-plane text-ink-2',
  },
  reserve: {
    label: 'Reserve',
    hint: 'Available but benched',
    className: 'border-hairline bg-surface text-muted',
  },
  retired: {
    label: 'Retired',
    hint: 'Kept for history only',
    className: 'border-hairline bg-surface text-muted line-through',
  },
};

/**
 * How a move is learned. Labels are the games' own wording — `machine` is a TM,
 * which is what anyone reading the movepool expects to see.
 */
export const LEARN_METHOD_META: Record<string, { label: string; hint: string }> = {
  'level-up': { label: 'Level up', hint: 'Learned at a level, like coursework by term' },
  machine: { label: 'TM / TR', hint: 'Taught from a technical machine' },
  egg: { label: 'Egg', hint: 'Inherited from a parent' },
  tutor: { label: 'Tutor', hint: 'Taught by a move tutor' },
  train: { label: 'Training', hint: 'Learned through training (Legends-style games)' },
};

export function learnMethodLabel(method: string): string {
  return LEARN_METHOD_META[method]?.label ?? slugLabel(method);
}

/** Order the movepool tabs appear in — commonest routes first, rest appended. */
export const LEARN_METHOD_ORDER = ['level-up', 'machine', 'egg', 'tutor', 'train'];

/**
 * Null power/accuracy are meaningful: a status move has no power, and a move
 * that never misses has no accuracy. Rendering either as 0 would say the
 * opposite of what's true.
 */
export function moveStat(value: number | null): string {
  return value === null ? '—' : String(value);
}

/**
 * Power specifically. PokeAPI reports **0** as well as null for "no fixed base
 * power" — status moves and fixed-damage ones like Seismic Toss — and 0 never
 * means "deals zero damage", so both render as "—".
 */
export function movePower(power: number | null): string {
  return power === null || power === 0 ? '—' : String(power);
}

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** PokeAPI reports decimetres. */
export function formatHeight(decimetres: number): string {
  return `${(decimetres / 10).toFixed(1)} m`;
}

/** PokeAPI reports hectograms. */
export function formatWeight(hectograms: number): string {
  return `${(hectograms / 10).toFixed(1)} kg`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function dexNumber(id: number): string {
  return `#${String(id).padStart(4, '0')}`;
}

/**
 * `rough-terrain` → `Rough terrain`. For the PokeAPI slugs now stored on the
 * Pokémon record — habitat, shape, egg groups, growth rate, held items.
 *
 * Note this differs from `titleCase` above, which only touches the first
 * character and leaves the hyphens in place.
 */
export function slugLabel(slug: string): string {
  const spaced = slug.replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * PokeAPI's `gender_rate` is **eighths female**, with -1 meaning genderless —
 * so 1 is 12.5% female, not "1 female". Reading it as a plain number is wrong
 * in both directions, which is why this never renders the raw value.
 */
export function formatGenderRate(rate: number | null): string {
  if (rate === null) return '—';
  if (rate < 0) return 'Genderless';
  if (rate === 0) return 'Always male';
  if (rate === 8) return 'Always female';
  const female = (rate / 8) * 100;
  return `${(100 - female).toFixed(1)}% ♂ / ${female.toFixed(1)}% ♀`;
}
