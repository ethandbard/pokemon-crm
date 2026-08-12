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
    isLegendary: boolean('is_legendary').notNull().default(false),
    isMythical: boolean('is_mythical').notNull().default(false),

    spriteUrl: text('sprite_url'),
    artworkUrl: text('artwork_url'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('pokemon_name_idx').on(table.name),
    index('pokemon_type1_idx').on(table.type1),
    index('pokemon_generation_idx').on(table.generation),
    index('pokemon_base_stat_total_idx').on(table.baseStatTotal),
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

export const pokemonRelations = relations(pokemon, ({ many }) => ({
  notes: many(notes),
  activity: many(activity),
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
