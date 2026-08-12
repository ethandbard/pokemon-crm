/**
 * Shapes returned by the Express API. These are hand-written rather than shared
 * from the server package so the client stays decoupled from Drizzle's types —
 * if you change a route's response, update the matching interface here.
 */

export type ActivityKind = 'caught' | 'favorite' | 'wishlist' | 'flagged' | 'reviewed';

export type RosterStatus = 'starter' | 'active' | 'reserve' | 'retired';

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
  /** Names of every trainer carrying this Pokémon on their roster. */
  trainerNames: string[];
}

export interface PokemonListResponse {
  data: PokemonListItem[];
  pagination: Pagination;
}

export interface FilterOptions {
  types: string[];
  generations: number[];
  activityKinds: ActivityKind[];
  trainers: { id: number; name: string }[];
}

export interface Trainer {
  id: number;
  name: string;
  region: string | null;
  specialty: string | null;
  email: string | null;
  bio: string | null;
}

/** Trainer list row — carries the headline roster figures for the selector. */
export interface TrainerListItem extends Trainer {
  rosterSize: number;
  activeCount: number;
  avgBaseStatTotal: number;
}

export interface RosterMember {
  id: number;
  pokemonId: number;
  nickname: string | null;
  level: number | null;
  status: RosterStatus;
  acquiredAt: string;
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
  isLegendary: boolean;
  spriteUrl: string | null;
  noteCount: number;
  activityKinds: ActivityKind[];

  // Evolution progress — the "degree progress" model.
  evolutionStage: number;
  chainLength: number;
  isFullyEvolved: boolean;
  /** snake_case: this comes straight from a jsonb subquery, not the query builder. */
  nextEvolution: {
    id: number;
    display_name: string;
    evolution_min_level: number | null;
    evolution_trigger: string | null;
    sprite_url: string | null;
  } | null;
  /** Level requirement for the next stage is met but it hasn't evolved yet. */
  milestoneEligible: boolean;
}

export interface EvolutionLink {
  id: number;
  displayName: string;
  spriteUrl: string | null;
  evolutionStage: number;
  evolvesFromId: number | null;
  evolutionMinLevel: number | null;
  evolutionTrigger: string | null;
  isFullyEvolved: boolean;
}

export interface TrainerDashboardResponse {
  trainer: Trainer & { createdAt: string; updatedAt: string };
  roster: RosterMember[];
  summary: {
    roster_size: number;
    active_count: number;
    avg_base_stat_total: number;
    max_base_stat_total: number;
    avg_level: number;
    legendary_count: number;
    distinct_types: number;
    milestone_eligible: number;
  } | null;
  typeBreakdown: { type: string; count: number }[];
  statAverages: { stat: string; avg: number }[];
  /** Notes on any Pokémon in this trainer's roster. */
  notes: (NoteWithPokemon & { nickname: string | null })[];
  /** Status flags on any Pokémon in this trainer's roster. */
  activity: (ActivityRecord & {
    pokemonName: string;
    pokemonSpriteUrl: string | null;
    nickname: string | null;
  })[];
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

/** Row shape returned by `GET /api/activity` — joined to its Pokémon. */
export interface ActivityWithPokemon extends ActivityRecord {
  pokemonName: string;
  pokemonSpriteUrl: string | null;
  pokemonType1: string;
  pokemonType2: string | null;
}

export interface ActivityListResponse {
  data: ActivityWithPokemon[];
  owners: string[];
  trainers: { id: number; name: string }[];
  /** Unfiltered totals per kind, so summary tiles don't move when filtering. */
  kindCounts: Partial<Record<ActivityKind, number>>;
  kinds: ActivityKind[];
  pagination: Pagination;
}

export interface PokemonProfileResponse {
  pokemon: PokemonDetail;
  notes: Note[];
  activity: ActivityRecord[];
  /** Trainers carrying this Pokémon — the roster relation, seen from the Pokémon side. */
  trainers: {
    rosterId: number;
    trainerId: number;
    trainerName: string;
    region: string | null;
    nickname: string | null;
    level: number | null;
    status: RosterStatus;
  }[];
  neighbours: {
    previous: { id: number; displayName: string; spriteUrl: string | null } | null;
    next: { id: number; displayName: string; spriteUrl: string | null } | null;
  };
  ranking: { baseStatTotalPercentile: number | null; total: number };
  evolution: {
    chain: EvolutionLink[];
    stage: number;
    chainLength: number;
    isFullyEvolved: boolean;
    nextStages: EvolutionLink[];
  };
}

export interface NotesResponse {
  data: NoteWithPokemon[];
  owners: string[];
  trainers: { id: number; name: string }[];
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
