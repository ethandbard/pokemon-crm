import {
  boolean,
  index,
  integer,
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
export const activityKind = pgEnum('activity_kind', [
  'caught',
  'favorite',
  'wishlist',
  'flagged',
  'reviewed',
]);

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

    /** Decimetres, as PokeAPI reports it. */
    height: integer('height').notNull(),
    /** Hectograms, as PokeAPI reports it. */
    weight: integer('weight').notNull(),
    baseExperience: integer('base_experience'),
    captureRate: integer('capture_rate'),

    abilities: text('abilities').array().notNull().default([]),
    color: text('color'),
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
  ],
);

/**
 * Free-text notes attached to a Pokémon. `owner` exists ahead of auth so that
 * rows written today are still meaningful once real users are introduced —
 * until then everything is written under DEFAULT_OWNER (see constants.ts).
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

export const pokemonRelations = relations(pokemon, ({ many }) => ({
  notes: many(notes),
  activity: many(activity),
  roster: many(roster),
}));

export const trainersRelations = relations(trainers, ({ many }) => ({
  roster: many(roster),
}));

export const rosterRelations = relations(roster, ({ one }) => ({
  trainer: one(trainers, { fields: [roster.trainerId], references: [trainers.id] }),
  pokemon: one(pokemon, { fields: [roster.pokemonId], references: [pokemon.id] }),
}));

export const notesRelations = relations(notes, ({ one }) => ({
  pokemon: one(pokemon, { fields: [notes.pokemonId], references: [pokemon.id] }),
}));

export const activityRelations = relations(activity, ({ one }) => ({
  pokemon: one(pokemon, { fields: [activity.pokemonId], references: [pokemon.id] }),
}));

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
