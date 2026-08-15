import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * Advising-style status flags. `reviewed` doubles as "last reviewed": the
 * unique index below means re-reviewing updates the existing row's timestamp
 * rather than piling up duplicates.
 */
/**
 * One way to reach a species from its predecessor, straight from PokeAPI's
 * `evolution_details`. Every field is optional because a single trigger uses
 * only a handful of them — `level-up` reads `minLevel`, `use-item` reads
 * `item`, `trade` reads `tradeSpecies`, and so on.
 *
 * Stored as jsonb rather than columns because the shape is genuinely sparse
 * and variable, and because an edge can have MORE THAN ONE of these (Sylveon
 * has two routes). The flattened, human-readable version of the first entry
 * lives in `pokemon.evolution_condition`, which is what the UI reads.
 */
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
  /** 1 = attack > defense, 0 = equal, -1 = attack < defense (Tyrogue). */
  relativePhysicalStats?: number;
  needsOverworldRain?: boolean;
  turnUpsideDown?: boolean;
}

/** `{ kanto: 25, "original-johto": 22 }` — regional dex numbers, by pokédex slug. */
export type RegionalDexNumbers = Record<string, number>;

export const activityKind = pgEnum('activity_kind', [
  'caught',
  'favorite',
  'wishlist',
  'flagged',
  'reviewed',
]);

/**
 * How a move deals damage. Closed since generation 4 — PokeAPI has shipped
 * exactly these three for every move, which is why this is an enum where
 * `pokemon_moves.learn_method` (open-ended, and still growing) is plain text.
 */
export const moveDamageClass = pgEnum('move_damage_class', ['physical', 'special', 'status']);

/**
 * Core reference table. Populated once by `npm run seed` from PokeAPI; the app
 * itself never writes here. `id` is the National Pokédex number, which PokeAPI
 * already guarantees is stable and unique.
 */
export const pokemon = pgTable(
  'pokemon',
  {
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
    displayName: text('display_name').notNull(),
    generation: integer('generation').notNull(),

    // Types are split into two columns rather than an array so that filtering
    // and the dashboard's type breakdown stay plain indexable SQL.
    type1: text('type1').notNull(),
    type2: text('type2'),

    hp: integer('hp').notNull(),
    attack: integer('attack').notNull(),
    defense: integer('defense').notNull(),
    specialAttack: integer('special_attack').notNull(),
    specialDefense: integer('special_defense').notNull(),
    speed: integer('speed').notNull(),
    /** Denormalised sum of the six base stats — sorted on constantly. */
    baseStatTotal: integer('base_stat_total').notNull(),

    /*
     * Effort-value yield: what defeating this species trains in the victor.
     * Six columns mirroring the six base stats above, for the same reason —
     * they get filtered and averaged, so plain integer columns beat an array.
     * Almost always 0–3 and mostly zero; `evYieldTotal` is the denormalised sum
     * so "what does this train" is one indexed comparison.
     */
    evHp: integer('ev_hp').notNull().default(0),
    evAttack: integer('ev_attack').notNull().default(0),
    evDefense: integer('ev_defense').notNull().default(0),
    evSpecialAttack: integer('ev_special_attack').notNull().default(0),
    evSpecialDefense: integer('ev_special_defense').notNull().default(0),
    evSpeed: integer('ev_speed').notNull().default(0),
    evYieldTotal: integer('ev_yield_total').notNull().default(0),

    /** Decimetres, as PokeAPI reports it. */
    height: integer('height').notNull(),
    /** Hectograms, as PokeAPI reports it. */
    weight: integer('weight').notNull(),
    baseExperience: integer('base_experience'),
    captureRate: integer('capture_rate'),

    /**
     * Ordinary abilities in slot order. The hidden ability is deliberately NOT
     * in here — it isn't selectable the way these are, so folding it in would
     * make "this species' abilities" mean two different things. Splitting it
     * out keeps both plain, indexable SQL, the same reasoning as `type1`/`type2`.
     */
    abilities: text('abilities').array().notNull().default([]),
    /** The Hidden Ability, if the species has one. At most one exists. */
    hiddenAbility: text('hidden_ability'),
    /** Item names this species can be found holding in the wild. */
    heldItems: text('held_items').array().notNull().default([]),
    color: text('color'),

    /*
     * Descriptive text — the Pokédex-facing copy, which is the only prose the
     * dataset carries. `flavorText` is normalised (PokeAPI embeds hard line
     * breaks and form feeds), and `flavorTextVersion` records which game's entry
     * won, since the API returns one per version and they differ.
     */
    genus: text('genus'),
    flavorText: text('flavor_text'),
    flavorTextVersion: text('flavor_text_version'),

    /*
     * Species/breeding dimensions. Cheap categorical slices the dashboard can
     * group by, and the closest thing the dataset has to demographic fields.
     */
    eggGroups: text('egg_groups').array().notNull().default([]),
    habitat: text('habitat'),
    shape: text('shape'),
    isBaby: boolean('is_baby').notNull().default(false),
    /** Eighths female: 0 = always male, 8 = always female, **-1 = genderless**. */
    genderRate: integer('gender_rate'),
    baseHappiness: integer('base_happiness'),
    /** Egg cycles to hatch. Higher means rarer/stronger, roughly. */
    hatchCounter: integer('hatch_counter'),

    /**
     * Alternate forms (Mega, Gigantamax, regional) as PokeAPI variety slugs.
     * Names only: importing the forms themselves means fetching each one, and
     * their dex ids land in the 10000s, which is a separate piece of work.
     */
    varieties: text('varieties').array().notNull().default([]),
    /**
     * Regional Pokédex numbers keyed by pokédex slug. This is what gives
     * `trainers.region` something to actually join against.
     */
    regionalDexNumbers: jsonb('regional_dex_numbers').$type<RegionalDexNumbers>(),
    /**
     * PokeAPI growth rate name (`medium-slow`, `fast`, …). Joins to
     * `growth_rates` for the real EXP curve, which is what makes "behind pace"
     * a curve comparison rather than a guess.
     */
    growthRate: text('growth_rate'),
    isLegendary: boolean('is_legendary').notNull().default(false),
    isMythical: boolean('is_mythical').notNull().default(false),

    spriteUrl: text('sprite_url'),
    artworkUrl: text('artwork_url'),
    /** Shiny counterparts of the two above, for the Profile's shiny toggle. */
    shinySpriteUrl: text('shiny_sprite_url'),
    shinyArtworkUrl: text('shiny_artwork_url'),
    /** Pokémon HOME render — cleaner and consistent across the whole dex. */
    homeArtworkUrl: text('home_artwork_url'),
    /** mp3 of the species' cry. One `<audio>` element on the profile. */
    cryUrl: text('cry_url'),

    /*
     * Evolution chain — the "degree progress" model. A chain is a programme of
     * study: `evolutionStage` is how far along this species sits (1-indexed),
     * `chainLength` is how many stages the programme has, and
     * `evolutionMinLevel` is the level requirement to reach THIS stage from its
     * predecessor. `evolvesFromId` walks backwards; find the next stage by
     * querying for rows whose `evolvesFromId` is this row's id.
     */
    evolutionChainId: integer('evolution_chain_id'),
    evolvesFromId: integer('evolves_from_id'),
    evolutionStage: integer('evolution_stage').notNull().default(1),
    chainLength: integer('chain_length').notNull().default(1),
    /** Null when the trigger isn't level-based (stone, trade, friendship…). */
    evolutionMinLevel: integer('evolution_min_level'),
    evolutionTrigger: text('evolution_trigger'),
    /**
     * The requirement as a sentence — "Level 16", "Use a Thunder Stone",
     * "High friendship, at night", "Trade holding a Metal Coat".
     *
     * `evolutionMinLevel` is null for roughly a third of the dex, so on its own
     * the evolution model can't say what those species actually need. This
     * column is the flattened, displayable answer; `evolutionRequirements`
     * below keeps the structured source it was derived from.
     */
    evolutionCondition: text('evolution_condition'),
    /** Every route into this species, unflattened. See EvolutionRequirement. */
    evolutionRequirements: jsonb('evolution_requirements').$type<EvolutionRequirement[]>(),
    isFullyEvolved: boolean('is_fully_evolved').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('pokemon_name_idx').on(table.name),
    index('pokemon_type1_idx').on(table.type1),
    index('pokemon_generation_idx').on(table.generation),
    index('pokemon_base_stat_total_idx').on(table.baseStatTotal),
    index('pokemon_evolution_chain_idx').on(table.evolutionChainId),
    index('pokemon_evolves_from_idx').on(table.evolvesFromId),
    // The new categorical dimensions are filtered on from Lookup and grouped
    // by on the Dashboard, same as type1/generation above.
    index('pokemon_habitat_idx').on(table.habitat),
    index('pokemon_shape_idx').on(table.shape),
    index('pokemon_growth_rate_idx').on(table.growthRate),
  ],
);

/**
 * The people who write notes and set status flags — the directory behind the
 * "acting as" switcher. Not authentication: there is no password or session,
 * the client simply names which user it is acting as.
 *
 * **`users.email` is the value that lands in `notes.owner` / `activity.owner`,
 * and there is deliberately no foreign key.** Owner columns predate this table
 * and may hold a string with no matching row (an older seed, a direct API call,
 * a deleted user); joins to this table must be left joins that fall back to the
 * raw owner string. Changing a user's email therefore re-attributes nothing —
 * rename via `name`, which is display-only.
 */
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    /** Stable identity. Written into `owner`; treat as immutable once used. */
    email: text('email').notNull(),
    name: text('name').notNull(),
    /** Free text — "Professor", "Gym Leader". Display only, never branched on. */
    role: text('role'),
    /**
     * Two initials for the switcher's avatar. Derived from `name` at creation
     * rather than at render so a user can override it.
     */
    initials: text('initials'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('users_email_idx').on(table.email)],
);

/**
 * Free-text notes attached to a Pokémon. `owner` holds the acting user's email
 * — see `users` above for why that is a plain string and not a foreign key.
 * Writes with no acting user fall back to DEFAULT_OWNER (see constants.ts).
 */
export const notes = pgTable(
  'notes',
  {
    id: serial('id').primaryKey(),
    pokemonId: integer('pokemon_id')
      .notNull()
      .references(() => pokemon.id, { onDelete: 'cascade' }),
    owner: text('owner').notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('notes_pokemon_id_idx').on(table.pokemonId),
    index('notes_owner_idx').on(table.owner),
    index('notes_created_at_idx').on(table.createdAt),
  ],
);

/**
 * Status tags. One row per (pokemon, owner, kind); the API toggles rows on and
 * off rather than storing a boolean per flag, so adding a new kind is a
 * migration on the enum and nothing else.
 */
export const activity = pgTable(
  'activity',
  {
    id: serial('id').primaryKey(),
    pokemonId: integer('pokemon_id')
      .notNull()
      .references(() => pokemon.id, { onDelete: 'cascade' }),
    owner: text('owner').notNull(),
    kind: activityKind('kind').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('activity_pokemon_owner_kind_idx').on(table.pokemonId, table.owner, table.kind),
    index('activity_kind_idx').on(table.kind),
  ],
);

/**
 * Reference data for moves, from PokeAPI's `/move/{name}`. Written only by the
 * seed, exactly like `pokemon`, and keyed by PokeAPI's own move id so the join
 * table survives a re-seed.
 *
 * The curriculum analogy: a move is a **course**. `pokemon_moves` below is the
 * enrolment record — which species can take it, how it's earned, and (for
 * level-up moves) the level that gates it.
 */
export const moves = pgTable(
  'moves',
  {
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
    displayName: text('display_name').notNull(),
    /** Move type — joins conceptually to `pokemon.type1`/`type2`. */
    type: text('type').notNull(),
    damageClass: moveDamageClass('damage_class').notNull(),
    generation: integer('generation'),

    /**
     * Null is meaningful on all three: a status move has no `power`, a move
     * that never misses has no `accuracy` (Swift, Aerial Ace), and PokeAPI
     * reports `pp` as null for a handful of Shadow moves. Rendering a null as
     * 0 would say "always misses" / "no PP", so display sites show "—".
     */
    power: integer('power'),
    accuracy: integer('accuracy'),
    pp: integer('pp'),
    /** Turn order modifier: +1 Quick Attack, -6 Trick Room. 0 for most moves. */
    priority: integer('priority').notNull().default(0),

    /**
     * The one-line effect, with PokeAPI's `$effect_chance` placeholder already
     * substituted — the raw string reads "has a $effect_chance% chance", which
     * is not something to ship to a page.
     */
    effect: text('effect'),
    effectChance: integer('effect_chance'),
    /** Flavour text from the most recent English entry, same rule as `pokemon`. */
    flavorText: text('flavor_text'),

    /** Meta fields from `/move/{name}`.meta — the secondary effects. */
    ailment: text('ailment'),
    ailmentChance: integer('ailment_chance'),
    critRate: integer('crit_rate'),
    /** Percent of damage dealt recovered (positive) or taken as recoil (negative). */
    drain: integer('drain'),
    healing: integer('healing'),
    /** What the move hits — `selected-pokemon`, `all-opponents`, `user`, … */
    target: text('target'),

    /**
     * Denormalised count of species that learn this move by any method. It is
     * sorted and filtered on constantly ("what does everything learn?"), and
     * the alternative is a group-by over ~90k join rows on every list request.
     * The seed recomputes it; nothing else writes it.
     */
    learnedByCount: integer('learned_by_count').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('moves_name_idx').on(table.name),
    index('moves_type_idx').on(table.type),
    index('moves_damage_class_idx').on(table.damageClass),
    index('moves_power_idx').on(table.power),
    index('moves_learned_by_count_idx').on(table.learnedByCount),
  ],
);

/**
 * Which species learn which move, and how — the join table the whole moves
 * feature exists for.
 *
 * **One row per (pokemon, move, learn method), not per version group.** PokeAPI
 * reports a `version_group_details` entry per game a move appears in, which
 * would multiply this table by ~20 for no analytical gain. The seed keeps the
 * most recent version group for each method and records which one won in
 * `version_group`, so a level is always attributable to a specific game rather
 * than being an average of thirty of them.
 *
 * `level_learned_at` is 0 for every method except `level-up` — that's PokeAPI's
 * own encoding for "not gated by level", kept rather than nulled so ordering a
 * movepool by level needs no coalesce.
 */
export const pokemonMoves = pgTable(
  'pokemon_moves',
  {
    id: serial('id').primaryKey(),
    pokemonId: integer('pokemon_id')
      .notNull()
      .references(() => pokemon.id, { onDelete: 'cascade' }),
    moveId: integer('move_id')
      .notNull()
      .references(() => moves.id, { onDelete: 'cascade' }),
    /**
     * `level-up`, `machine`, `egg`, `tutor`, plus a long tail of one-game
     * oddities (`light-ball-egg`, `xd-shadow`, `form-change`). Text rather than
     * an enum because PokeAPI keeps adding to it and none of them justify a
     * migration.
     */
    learnMethod: text('learn_method').notNull(),
    levelLearnedAt: integer('level_learned_at').notNull().default(0),
    /** Which game's data this row reflects — see the note above. */
    versionGroup: text('version_group'),
  },
  (table) => [
    uniqueIndex('pokemon_moves_unique_idx').on(table.pokemonId, table.moveId, table.learnMethod),
    index('pokemon_moves_pokemon_idx').on(table.pokemonId),
    index('pokemon_moves_move_idx').on(table.moveId),
    index('pokemon_moves_method_idx').on(table.learnMethod),
    // "What does this Pokémon learn, in level order" is the movepool query.
    index('pokemon_moves_pokemon_level_idx').on(table.pokemonId, table.levelLearnedAt),
  ],
);

/**
 * Cumulative EXP required to reach each level, per growth rate. Six curves ×
 * 100 levels, straight from PokeAPI's `/growth-rate/{name}` — the real tables,
 * not a fitted formula.
 *
 * Used to answer "what level should this Pokémon be by now?" without inventing
 * a curve. See ATTENTION_WEIGHTS in constants.ts for the pace assumption.
 */
export const growthRates = pgTable(
  'growth_rates',
  {
    name: text('name').notNull(),
    level: integer('level').notNull(),
    experience: integer('experience').notNull(),
  },
  (table) => [uniqueIndex('growth_rates_name_level_idx').on(table.name, table.level)],
);

/**
 * The type effectiveness matrix, from PokeAPI's `/type/{name}.damage_relations`
 * — 18 requests, written only by the seed.
 *
 * **The full 18 × 18 grid is stored, not just the non-neutral pairs.** PokeAPI
 * reports only the exceptions (what a type is strong or weak against), leaving
 * neutral implied by absence. Storing it that way makes every consumer coalesce
 * a missing row to 1×, and a join that quietly drops a pair reads as an immunity
 * rather than as a bug. 324 rows is nothing; the completeness is worth more.
 *
 * `multiplier` is **hundredths**: 0, 50, 100, 200. Integers because the values
 * are exact and get multiplied together for dual types (a 4× weakness is
 * 200 × 200 / 100), and floating-point 0.5s accumulating into a 0.24999 that
 * fails an `= 25` check is a pointless risk for a fixed four-value scale.
 */
export const typeDamage = pgTable(
  'type_damage',
  {
    /** The type of the incoming move. */
    attackingType: text('attacking_type').notNull(),
    /** One of the defender's types — combine the rows for a dual type. */
    defendingType: text('defending_type').notNull(),
    /** Hundredths: 0 (immune), 50 (resists), 100 (neutral), 200 (weak). */
    multiplier: integer('multiplier').notNull().default(100),
  },
  (table) => [
    uniqueIndex('type_damage_pair_idx').on(table.attackingType, table.defendingType),
    index('type_damage_defending_idx').on(table.defendingType),
  ],
);

/**
 * Where a roster member sits in the trainer's line-up. The advising analogue of
 * an active/inactive caseload: `retired` keeps the history without counting
 * toward the working roster.
 */
export const rosterStatus = pgEnum('roster_status', ['starter', 'active', 'reserve', 'retired']);

/**
 * A trainer — the advisor in the advising analogy. Trainers own rosters of
 * Pokémon the way an advisor owns a caseload of students.
 */
export const trainers = pgTable(
  'trainers',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    region: text('region'),
    /** Type the trainer is known for — the rough equivalent of a department. */
    specialty: text('specialty'),
    email: text('email'),
    bio: text('bio'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('trainers_name_idx').on(table.name),
    index('trainers_region_idx').on(table.region),
  ],
);

/**
 * Join table between trainers and Pokémon — the roster itself.
 *
 * One row per (trainer, Pokémon): a roster tracks *which* species a trainer
 * carries, so the same Pokémon can't appear twice on one roster (though it can
 * appear on many different trainers' rosters).
 */
export const roster = pgTable(
  'roster',
  {
    id: serial('id').primaryKey(),
    trainerId: integer('trainer_id')
      .notNull()
      .references(() => trainers.id, { onDelete: 'cascade' }),
    pokemonId: integer('pokemon_id')
      .notNull()
      .references(() => pokemon.id, { onDelete: 'cascade' }),
    nickname: text('nickname'),
    level: integer('level'),
    status: rosterStatus('status').notNull().default('active'),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('roster_trainer_pokemon_idx').on(table.trainerId, table.pokemonId),
    index('roster_trainer_idx').on(table.trainerId),
    index('roster_pokemon_idx').on(table.pokemonId),
    index('roster_status_idx').on(table.status),
  ],
);

/**
 * The moves a roster member actually has equipped — its moveset.
 *
 * This is the table that makes coverage analysis mean anything. `pokemon_moves`
 * is what a species *can learn* (Charizard: 131 moves), which is why coverage
 * computed from it reports almost every roster as covering almost every type.
 * A battling Pokémon carries **four** moves, and those four are what determine
 * whether a team can actually answer a threat.
 *
 * `slot` is 1–4, mirroring the games. Slots rather than an unordered set give
 * stable display order and make "replace the move in slot 2" a natural edit.
 *
 * **Legality is enforced in the route, not here.** The rule is that `move_id`
 * must appear in `pokemon_moves` for this entry's species — a constraint against
 * a join, which a foreign key cannot express. `PUT /api/roster/:id/moves`
 * validates it; nothing else may write this table.
 */
export const rosterMoves = pgTable(
  'roster_moves',
  {
    id: serial('id').primaryKey(),
    rosterId: integer('roster_id')
      .notNull()
      .references(() => roster.id, { onDelete: 'cascade' }),
    moveId: integer('move_id')
      .notNull()
      .references(() => moves.id, { onDelete: 'cascade' }),
    /** 1–4. Range is enforced by the route's Zod schema. */
    slot: integer('slot').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('roster_moves_slot_idx').on(table.rosterId, table.slot),
    // The same move twice is not a moveset, it is a mistake.
    uniqueIndex('roster_moves_unique_idx').on(table.rosterId, table.moveId),
    index('roster_moves_roster_idx').on(table.rosterId),
    index('roster_moves_move_idx').on(table.moveId),
  ],
);

export const pokemonRelations = relations(pokemon, ({ many }) => ({
  notes: many(notes),
  activity: many(activity),
  roster: many(roster),
  moves: many(pokemonMoves),
}));

export const movesRelations = relations(moves, ({ many }) => ({
  learners: many(pokemonMoves),
}));

export const pokemonMovesRelations = relations(pokemonMoves, ({ one }) => ({
  pokemon: one(pokemon, { fields: [pokemonMoves.pokemonId], references: [pokemon.id] }),
  move: one(moves, { fields: [pokemonMoves.moveId], references: [moves.id] }),
}));

export const trainersRelations = relations(trainers, ({ many }) => ({
  roster: many(roster),
}));

export const rosterRelations = relations(roster, ({ one, many }) => ({
  trainer: one(trainers, { fields: [roster.trainerId], references: [trainers.id] }),
  pokemon: one(pokemon, { fields: [roster.pokemonId], references: [pokemon.id] }),
  moveset: many(rosterMoves),
}));

export const rosterMovesRelations = relations(rosterMoves, ({ one }) => ({
  entry: one(roster, { fields: [rosterMoves.rosterId], references: [roster.id] }),
  move: one(moves, { fields: [rosterMoves.moveId], references: [moves.id] }),
}));

export const notesRelations = relations(notes, ({ one }) => ({
  pokemon: one(pokemon, { fields: [notes.pokemonId], references: [pokemon.id] }),
}));

export const activityRelations = relations(activity, ({ one }) => ({
  pokemon: one(pokemon, { fields: [activity.pokemonId], references: [pokemon.id] }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Pokemon = typeof pokemon.$inferSelect;
export type NewPokemon = typeof pokemon.$inferInsert;
export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type Activity = typeof activity.$inferSelect;
export type ActivityKind = (typeof activityKind.enumValues)[number];
export type Trainer = typeof trainers.$inferSelect;
export type NewTrainer = typeof trainers.$inferInsert;
export type RosterEntry = typeof roster.$inferSelect;
export type NewRosterEntry = typeof roster.$inferInsert;
export type RosterStatus = (typeof rosterStatus.enumValues)[number];
export type Move = typeof moves.$inferSelect;
export type NewMove = typeof moves.$inferInsert;
export type MoveDamageClass = (typeof moveDamageClass.enumValues)[number];
export type PokemonMove = typeof pokemonMoves.$inferSelect;
export type NewPokemonMove = typeof pokemonMoves.$inferInsert;
export type TypeDamage = typeof typeDamage.$inferSelect;
export type NewTypeDamage = typeof typeDamage.$inferInsert;
export type RosterMove = typeof rosterMoves.$inferSelect;
export type NewRosterMove = typeof rosterMoves.$inferInsert;
