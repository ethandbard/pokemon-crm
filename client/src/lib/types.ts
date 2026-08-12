/**
 * Shapes returned by the Express API. These are hand-written rather than shared
 * from the server package so the client stays decoupled from Drizzle's types —
 * if you change a route's response, update the matching interface here.
 */

export type ActivityKind = 'caught' | 'favorite' | 'wishlist' | 'flagged' | 'reviewed';

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Row shape used by the Lookup table. */
export interface PokemonListItem {
  id: number;
  name: string;
  displayName: string;
  generation: number;
  type1: string;
  type2: string | null;
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  baseStatTotal: number;
  height: number;
  weight: number;
  isLegendary: boolean;
  isMythical: boolean;
  spriteUrl: string | null;
  noteCount: number;
  activityKinds: ActivityKind[];
}

export interface PokemonListResponse {
  data: PokemonListItem[];
  pagination: Pagination;
}

export interface FilterOptions {
  types: string[];
  generations: number[];
  activityKinds: ActivityKind[];
}

/** Full record from the `pokemon` table. */
export interface PokemonDetail extends PokemonListItem {
  baseExperience: number | null;
  captureRate: number | null;
  abilities: string[];
  color: string | null;
  artworkUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: number;
  pokemonId: number;
  owner: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface NoteWithPokemon extends Note {
  pokemonName: string;
  pokemonSpriteUrl: string | null;
  pokemonType1: string;
  pokemonType2: string | null;
}

export interface ActivityRecord {
  id: number;
  pokemonId: number;
  owner: string;
  kind: ActivityKind;
  createdAt: string;
  updatedAt: string;
}

export interface PokemonProfileResponse {
  pokemon: PokemonDetail;
  notes: Note[];
  activity: ActivityRecord[];
  neighbours: {
    previous: { id: number; displayName: string; spriteUrl: string | null } | null;
    next: { id: number; displayName: string; spriteUrl: string | null } | null;
  };
  ranking: { baseStatTotalPercentile: number | null; total: number };
}

export interface NotesResponse {
  data: NoteWithPokemon[];
  owners: string[];
  pagination: Pagination;
}

export interface DashboardResponse {
  summary: {
    total: number;
    legendary: number;
    mythical: number;
    avg_base_stat_total: number;
    max_base_stat_total: number;
    min_base_stat_total: number;
    median_base_stat_total: number;
  } | null;
  typeBreakdown: {
    type: string;
    count: number;
    avg_base_stat_total: number;
    avg_attack: number;
    avg_defense: number;
    avg_speed: number;
  }[];
  generationBreakdown: {
    generation: number;
    count: number;
    avg_base_stat_total: number;
    legendary: number;
  }[];
  statDistribution: { bucket_start: number; bucket_end: number; count: number }[];
  statAverages: { stat: string; avg: number; min: number; max: number; median: number; p90: number }[];
  topPokemon: {
    id: number;
    displayName: string;
    type1: string;
    type2: string | null;
    baseStatTotal: number;
    spriteUrl: string | null;
  }[];
  scatter: {
    id: number;
    display_name: string;
    attack: number;
    speed: number;
    type1: string;
    base_stat_total: number;
  }[];
  crm: {
    note_count: number;
    pokemon_with_notes: number;
    activity_counts: Partial<Record<ActivityKind, number>>;
  } | null;
}
