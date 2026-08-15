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
  /** 1-indexed row numbers of this page — "showing 26–50 of 312". 0 when empty. */
  from: number;
  to: number;
}

export type MoveDamageClass = 'physical' | 'special' | 'status';

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
  /** Distinct moves learnable — one move reachable two ways counts once. */
  moveCount: number;
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
  /** Only generations 1–3 have a habitat in PokeAPI, so this filter is partial. */
  habitats: string[];
  shapes: string[];
  eggGroups: string[];
  growthRates: string[];
  /** Learn methods with how many join rows use each — commonest first. */
  learnMethods: { value: string; count: number }[];
  regions: string[];
}

/** Row shape used by the Moves table. */
export interface MoveListItem {
  id: number;
  name: string;
  displayName: string;
  type: string;
  damageClass: MoveDamageClass;
  generation: number | null;
  /** Null for status moves — render "—", never 0. */
  power: number | null;
  /** Null means the move cannot miss. */
  accuracy: number | null;
  pp: number | null;
  priority: number;
  effect: string | null;
  ailment: string | null;
  target: string | null;
  /** Species that learn it, dex-wide. */
  learnedByCount: number;
}

export interface MovesResponse {
  data: MoveListItem[];
  pagination: Pagination;
}

export interface MoveFilterOptions {
  types: string[];
  generations: number[];
  damageClasses: MoveDamageClass[];
  learnMethods: { value: string; count: number }[];
  ailments: string[];
  powerRange: { min: number | null; max: number | null };
}

/** Full record from the `moves` table. */
export interface MoveDetail extends MoveListItem {
  effectChance: number | null;
  flavorText: string | null;
  ailmentChance: number | null;
  critRate: number | null;
  /** Percent of damage recovered (positive) or taken as recoil (negative). */
  drain: number | null;
  healing: number | null;
  createdAt: string;
  updatedAt: string;
}

/** One species that learns a move, from `GET /api/moves/:id`. */
export interface MoveLearner {
  pokemonId: number;
  displayName: string;
  spriteUrl: string | null;
  type1: string;
  type2: string | null;
  generation: number;
  baseStatTotal: number;
  learnMethod: string;
  /** 0 for every method except `level-up`. */
  levelLearnedAt: number;
  versionGroup: string | null;
  /** The move's type matches one of theirs. */
  isStab: boolean;
}

export interface MoveDetailResponse {
  move: MoveDetail;
  learners: MoveLearner[];
  methodBreakdown: { learn_method: string; count: number; avg_level: number | null }[];
  typeBreakdown: { type: string; count: number }[];
  /** Trainers with at least one active-roster member that learns it. */
  trainers: { trainer_id: number; trainer_name: string; learners: number; active_roster: number }[];
  pagination: Pagination;
}

/** One row of a Pokémon's movepool, from `GET /api/pokemon/:id`. */
export interface MovepoolEntry {
  moveId: number;
  name: string;
  displayName: string;
  type: string;
  damageClass: MoveDamageClass;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  priority: number;
  effect: string | null;
  generation: number | null;
  learnedByCount: number;
  learnMethod: string;
  levelLearnedAt: number;
  versionGroup: string | null;
}

export interface MoveSummary {
  total: number;
  damaging: number;
  status: number;
  /** Types it can attack with — status moves excluded. */
  coverage_types: string[];
  /** Coverage types that match its own typing (same-type attack bonus). */
  stab_types: string[];
  max_power: number | null;
  avg_power: number | null;
  level_up_count: number;
  machine_count: number;
  egg_count: number;
  tutor_count: number;
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
  /** Distinct moves learnable — the ceiling, not what it carries. */
  moveCount: number;
  /** Distinct types it *could* attack with — status moves excluded. */
  coverageCount: number;
  /** Slots filled of four. This is the equipped moveset, keyed per roster entry. */
  movesetSize: number;
  /** Distinct types the equipped moves reach — status moves excluded. */
  movesetCoverage: number;
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
    evolution_condition: string | null;
    sprite_url: string | null;
  } | null;
  /** Level requirement for the next stage is met but it hasn't evolved yet. */
  milestoneEligible: boolean;
}

export type AttentionReasonCode =
  | 'never_reviewed'
  | 'stale_review'
  | 'flagged'
  | 'milestone_overdue'
  | 'behind_pace';

export interface AttentionReason {
  code: AttentionReasonCode;
  /** Weighted contribution to the score, so the UI can show what dominates. */
  points: number;
  label: string;
}

export interface AttentionItem {
  rosterId: number;
  trainerId: number;
  trainerName: string;
  pokemonId: number;
  displayName: string;
  nickname: string | null;
  spriteUrl: string | null;
  type1: string;
  type2: string | null;
  level: number | null;
  status: RosterStatus;
  daysOnRoster: number;
  daysSinceReview: number | null;
  isFlagged: boolean;
  milestoneOverdue: boolean;
  nextEvolutionName: string | null;
  nextEvolutionLevel: number | null;
  expectedLevel: number | null;
  score: number;
  reasons: AttentionReason[];
}

export interface AttentionResponse {
  data: AttentionItem[];
  /** Roster members considered (excludes retired). */
  scanned: number;
  /** How many had at least one firing signal. */
  flagged: number;
  model: { staleAfterDays: number; behindPaceTolerance: number; expPerDay: number };
}

export interface EvolutionLink {
  id: number;
  displayName: string;
  spriteUrl: string | null;
  evolutionStage: number;
  evolvesFromId: number | null;
  evolutionMinLevel: number | null;
  evolutionTrigger: string | null;
  /** Human-readable requirement — what the UI shows. */
  evolutionCondition: string | null;
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
  /**
   * All 18 types, active roster only — types at zero are the gap report and
   * are returned deliberately.
   */
  moveCoverage: { type: string; members: number; moves: number }[];
  movepool: {
    distinct_moves: number;
    avg_movepool: number;
    types_covered: number;
    thinnest_movepool: number | null;
  } | null;
  /** Notes on any Pokémon in this trainer's roster — one page of them. */
  notes: (NoteWithPokemon & { nickname: string | null })[];
  /** Status flags on any Pokémon in this trainer's roster — one page of them. */
  activity: (ActivityRecord & {
    pokemonName: string;
    pokemonSpriteUrl: string | null;
    nickname: string | null;
  })[];
  /** The two histories page independently of each other. */
  notesPagination: Pagination;
  activityPagination: Pagination;
}

/** One route into a species, from PokeAPI's `evolution_details`. */
export interface EvolutionRequirement {
  trigger: string | null;
  minLevel?: number;
  minHappiness?: number;
  minBeauty?: number;
  minAffection?: number;
  item?: string;
  heldItem?: string;
  knownMove?: string;
  knownMoveType?: string;
  timeOfDay?: string;
  location?: string;
  gender?: 'female' | 'male';
  tradeSpecies?: string;
  partySpecies?: string;
  partyType?: string;
  relativePhysicalStats?: number;
  needsOverworldRain?: boolean;
  turnUpsideDown?: boolean;
}

/** One equipped move on a roster entry. Slot is 1–4, mirroring the games. */
export interface MovesetSlot {
  slot: number;
  moveId: number;
  name: string;
  displayName: string;
  type: string;
  damageClass: MoveDamageClass;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
}

/**
 * Team analysis for one trainer's **active** roster, from
 * `GET /api/trainers/:id/analysis`.
 *
 * Everything here is computed from *equipped* moves (`roster_moves`), not the
 * learnable movepool — that distinction is the whole point of the feature.
 */
export interface TrainerAnalysis {
  trainer: { id: number; name: string };
  /** All 18 types, with the best multiplier the team's moves achieve. */
  offense: { type: string; bestMultiplier: number; members: string[] }[];
  /** All 18 types, with how many members each one hits hard. */
  defense: { type: string; weakCount: number; resistCount: number; weakMembers: string[] }[];
  /** Types nothing on the team hits for extra damage. */
  gaps: string[];
  /** Types that hit 2+ members hard AND have no super-effective answer. */
  threats: { type: string; weakCount: number; resistCount: number; weakMembers: string[] }[];
  readiness: {
    activeMembers: number;
    withFullMoveset: number;
    withPartialMoveset: number;
    withoutMoveset: number;
    members: { rosterId: number; displayName: string; nickname: string | null; movesetSize: number }[];
  };
}

/** One attacking type and what it does to a defender, in hundredths. */
export interface TypeMatchup {
  type: string;
  /** 0, 25, 50, 200 or 400. Neutral (100) matchups are never returned. */
  multiplier: number;
}

/** Full record from the `pokemon` table. */
export interface PokemonDetail extends PokemonListItem {
  baseExperience: number | null;
  captureRate: number | null;
  /** Ordinary abilities only — the hidden one is `hiddenAbility`. */
  abilities: string[];
  hiddenAbility: string | null;
  heldItems: string[];
  color: string | null;
  artworkUrl: string | null;

  // Descriptive text — the only prose in the dataset.
  genus: string | null;
  flavorText: string | null;
  /** Which game's Pokédex entry `flavorText` came from. */
  flavorTextVersion: string | null;

  // EV yield: what defeating this species trains.
  evHp: number;
  evAttack: number;
  evDefense: number;
  evSpecialAttack: number;
  evSpecialDefense: number;
  evSpeed: number;
  evYieldTotal: number;

  // Species / breeding dimensions.
  eggGroups: string[];
  habitat: string | null;
  shape: string | null;
  isBaby: boolean;
  /** Eighths female: 0 = always male, 8 = always female, -1 = genderless. */
  genderRate: number | null;
  baseHappiness: number | null;
  hatchCounter: number | null;
  growthRate: string | null;

  varieties: string[];
  /** Regional dex numbers keyed by pokédex slug, e.g. `{ kanto: 25 }`. */
  regionalDexNumbers: Record<string, number> | null;

  shinySpriteUrl: string | null;
  shinyArtworkUrl: string | null;
  homeArtworkUrl: string | null;
  cryUrl: string | null;

  evolutionMinLevel: number | null;
  evolutionTrigger: string | null;
  /** The requirement as a sentence — "Use a Thunder Stone", "Level 16". */
  evolutionCondition: string | null;
  evolutionRequirements: EvolutionRequirement[] | null;
  evolutionStage: number;
  chainLength: number;
  isFullyEvolved: boolean;

  createdAt: string;
  updatedAt: string;
}

/**
 * Someone who can be acted as. `email` is the value written into every `owner`
 * column, which is what makes it the identity rather than `id`.
 */
export interface User {
  id: number;
  email: string;
  name: string;
  role: string | null;
  initials: string | null;
  createdAt: string;
  noteCount: number;
  activityCount: number;
}

export interface UsersResponse {
  data: User[];
  /** Where writes with no acting user land — see the server's DEFAULT_OWNER. */
  defaultOwner: string;
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
  /** The full movepool, level-up moves first in level order. */
  moves: MovepoolEntry[];
  moveSummary: MoveSummary | null;
  /**
   * Defensive matchups, computed server-side from the type chart. Neutral
   * types are omitted from all three lists — they are most of the 18 and say
   * nothing. `multiplier` is hundredths: 25, 50, 200, 400.
   */
  matchups: {
    weaknesses: TypeMatchup[];
    resistances: TypeMatchup[];
    immunities: TypeMatchup[];
  };
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
  /** Generations 1–3 only — PokeAPI assigns no habitat beyond those. */
  habitatBreakdown: { habitat: string; count: number; avg_base_stat_total: number }[];
  eggGroupBreakdown: { egg_group: string; count: number; avg_base_stat_total: number }[];
  evYieldBreakdown: { stat: string; count: number; avg_yield: number }[];
  /** All 18 types; the zeroes are the finding, so they're kept. */
  moveCoverage: { type: string; species: number; moves: number }[];
  moveClassBreakdown: { damage_class: MoveDamageClass; moves: number; avg_power: number | null }[];
  movepool: {
    distinct_moves: number;
    avg_movepool: number;
    median_movepool: number;
    max_movepool: number;
    min_movepool: number;
    level_up_rows: number;
    machine_rows: number;
    egg_rows: number;
    tutor_rows: number;
  } | null;
  /** `learners` is counted within the current filter scope, not dex-wide. */
  topMoves: {
    id: number;
    display_name: string;
    type: string;
    damage_class: MoveDamageClass;
    power: number | null;
    learners: number;
  }[];
  /** What the filter bar is currently scoping every figure above to. */
  scope: {
    filtered: number;
    total: number;
    isFiltered: boolean;
    filters: {
      type: string | null;
      generation: number | null;
      legendary: string | null;
      mythical: string | null;
      region: string | null;
      habitat: string | null;
      eggGroup: string | null;
      growthRate: string | null;
      minBaseStatTotal: number | null;
      maxBaseStatTotal: number | null;
    };
  };
}
