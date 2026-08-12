import type { ActivityKind } from './types';

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

export const STAT_LABELS = {
  hp: 'HP',
  attack: 'Attack',
  defense: 'Defense',
  specialAttack: 'Sp. Atk',
  specialDefense: 'Sp. Def',
  speed: 'Speed',
} as const;

export const ACTIVITY_META: Record<ActivityKind, { label: string; icon: string; hint: string }> = {
  caught: { label: 'Caught', icon: '●', hint: 'In the collection' },
  favorite: { label: 'Favorite', icon: '★', hint: 'Starred for quick access' },
  wishlist: { label: 'Wishlist', icon: '◆', hint: 'Wanted, not yet caught' },
  flagged: { label: 'Flagged', icon: '▲', hint: 'Needs follow-up' },
  reviewed: { label: 'Reviewed', icon: '✓', hint: 'Timestamp updates each review' },
};

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
