/**
 * Every write is attributed to this owner until real auth exists. The `owner`
 * columns are already in place, so swapping this for a session user is a
 * change to the route handlers only — no migration.
 */
export const DEFAULT_OWNER = 'demo@pokemon-crm.local';

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
