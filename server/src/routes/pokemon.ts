import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client.js';
import { activity, notes, pokemon, roster, trainers } from '../db/schema.js';
import { asyncHandler, badRequest, notFound } from '../http.js';
import { POKEMON_TYPES } from '../constants.js';

export const pokemonRouter = Router();

/** Columns the lookup table is allowed to sort by, mapped to real columns. */
const SORTABLE = {
  id: pokemon.id,
  name: pokemon.displayName,
  generation: pokemon.generation,
  type1: pokemon.type1,
  hp: pokemon.hp,
  attack: pokemon.attack,
  defense: pokemon.defense,
  specialAttack: pokemon.specialAttack,
  specialDefense: pokemon.specialDefense,
  speed: pokemon.speed,
  baseStatTotal: pokemon.baseStatTotal,
  height: pokemon.height,
  weight: pokemon.weight,
} as const;

const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  type: z.enum(POKEMON_TYPES).optional(),
  generation: z.coerce.number().int().min(1).max(9).optional(),
  legendary: z.enum(['true', 'false']).optional(),
  /** Filter to Pokémon carrying a given status flag. */
  activity: z.enum(activity.kind.enumValues).optional(),
  /** Filter to Pokémon on a given trainer's roster. */
  trainerId: z.coerce.number().int().min(1).optional(),
  minBaseStatTotal: z.coerce.number().int().min(0).max(1200).optional(),
  maxBaseStatTotal: z.coerce.number().int().min(0).max(1200).optional(),
  sort: z.enum(Object.keys(SORTABLE) as [keyof typeof SORTABLE]).default('id'),
  direction: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

/**
 * GET /api/pokemon — searchable, filterable, sortable, paginated list.
 *
 * Every value below is bound as a parameter by Drizzle; the only interpolated
 * things are column references chosen from the SORTABLE allow-list.
 */
pokemonRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.parse(req.query);

    const filters: SQL[] = [];

    if (query.search) {
      const pattern = `%${query.search}%`;
      const searchClause = or(ilike(pokemon.displayName, pattern), ilike(pokemon.name, pattern));
      if (searchClause) filters.push(searchClause);
    }

    if (query.type) {
      const typeClause = or(eq(pokemon.type1, query.type), eq(pokemon.type2, query.type));
      if (typeClause) filters.push(typeClause);
    }

    if (query.generation !== undefined) filters.push(eq(pokemon.generation, query.generation));
    if (query.legendary) filters.push(eq(pokemon.isLegendary, query.legendary === 'true'));
    if (query.minBaseStatTotal !== undefined) {
      filters.push(sql`${pokemon.baseStatTotal} >= ${query.minBaseStatTotal}`);
    }
    if (query.maxBaseStatTotal !== undefined) {
      filters.push(sql`${pokemon.baseStatTotal} <= ${query.maxBaseStatTotal}`);
    }
    if (query.activity) {
      filters.push(
        sql`exists (select 1 from ${activity} a where a.pokemon_id = ${pokemon}.id and a.kind = ${query.activity})`,
      );
    }
    if (query.trainerId !== undefined) {
      filters.push(
        sql`exists (select 1 from ${roster} r where r.pokemon_id = ${pokemon}.id and r.trainer_id = ${query.trainerId})`,
      );
    }

    const where = filters.length ? and(...filters) : undefined;
    const orderColumn = SORTABLE[query.sort];
    const orderBy = query.direction === 'desc' ? desc(orderColumn) : asc(orderColumn);

    const offset = (query.page - 1) * query.pageSize;

    const [rows, [totals]] = await Promise.all([
      db
        .select({
          id: pokemon.id,
          name: pokemon.name,
          displayName: pokemon.displayName,
          generation: pokemon.generation,
          type1: pokemon.type1,
          type2: pokemon.type2,
          hp: pokemon.hp,
          attack: pokemon.attack,
          defense: pokemon.defense,
          specialAttack: pokemon.specialAttack,
          specialDefense: pokemon.specialDefense,
          speed: pokemon.speed,
          baseStatTotal: pokemon.baseStatTotal,
          height: pokemon.height,
          weight: pokemon.weight,
          isLegendary: pokemon.isLegendary,
          isMythical: pokemon.isMythical,
          spriteUrl: pokemon.spriteUrl,
          /*
           * Correlated subqueries must alias their own tables and qualify the
           * OUTER reference as `${pokemon}.id`. Drizzle renders `${pokemon.id}`
           * as a bare `"id"`, which Postgres resolves against the innermost
           * scope — so an unqualified form silently compares the subquery's own
           * id column instead of the outer row's.
           */
          noteCount: sql<number>`(select count(*)::int from ${notes} n where n.pokemon_id = ${pokemon}.id)`,
          activityKinds: sql<
            string[]
          >`coalesce((select array_agg(a.kind::text order by a.kind::text) from ${activity} a where a.pokemon_id = ${pokemon}.id), '{}')`,
          trainerNames: sql<
            string[]
          >`coalesce((select array_agg(t.name order by t.name) from ${roster} r join ${trainers} t on t.id = r.trainer_id where r.pokemon_id = ${pokemon}.id), '{}')`,
        })
        .from(pokemon)
        .where(where)
        // Secondary sort on id keeps pagination stable when the primary key ties.
        .orderBy(orderBy, asc(pokemon.id))
        .limit(query.pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(pokemon).where(where),
    ]);

    res.json({
      data: rows,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: totals?.count ?? 0,
        totalPages: Math.max(1, Math.ceil((totals?.count ?? 0) / query.pageSize)),
      },
    });
  }),
);

/** GET /api/pokemon/filters — distinct values used to populate filter dropdowns. */
pokemonRouter.get(
  '/filters',
  asyncHandler(async (_req, res) => {
    const [types, generations, trainerOptions] = await Promise.all([
      db.execute<{ type: string }>(
        sql`select distinct t as type
            from ${pokemon}, unnest(array[${pokemon.type1}, ${pokemon.type2}]) as t
            where t is not null
            order by t`,
      ),
      db
        .selectDistinct({ generation: pokemon.generation })
        .from(pokemon)
        .orderBy(asc(pokemon.generation)),
      db
        .select({ id: trainers.id, name: trainers.name })
        .from(trainers)
        .orderBy(asc(trainers.name)),
    ]);

    res.json({
      types: types.rows.map((r) => r.type),
      generations: generations.map((r) => r.generation),
      activityKinds: activity.kind.enumValues,
      trainers: trainerOptions,
    });
  }),
);

const idParamSchema = z.object({ id: z.coerce.number().int().min(1) });

/** GET /api/pokemon/:id — full profile, plus its notes and activity flags. */
pokemonRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);

    const [record] = await db.select().from(pokemon).where(eq(pokemon.id, id)).limit(1);
    if (!record) throw notFound(`No Pokémon with id ${id}`);

    const [noteRows, activityRows, neighbours, trainerRows, chainRows] = await Promise.all([
      db.select().from(notes).where(eq(notes.pokemonId, id)).orderBy(desc(notes.createdAt)),
      db.select().from(activity).where(eq(activity.pokemonId, id)).orderBy(asc(activity.kind)),
      db
        .select({ id: pokemon.id, displayName: pokemon.displayName, spriteUrl: pokemon.spriteUrl })
        .from(pokemon)
        .where(inArray(pokemon.id, [id - 1, id + 1])),
      // Which trainers carry this Pokémon — makes the roster relation
      // navigable from the Pokémon side too.
      db
        .select({
          rosterId: roster.id,
          trainerId: trainers.id,
          trainerName: trainers.name,
          region: trainers.region,
          nickname: roster.nickname,
          level: roster.level,
          status: roster.status,
        })
        .from(roster)
        .innerJoin(trainers, eq(roster.trainerId, trainers.id))
        .where(eq(roster.pokemonId, id))
        .orderBy(asc(trainers.name)),
      // The whole evolution chain this Pokémon belongs to, in stage order —
      // the "programme of study" it sits within.
      record.evolutionChainId === null
        ? Promise.resolve([])
        : db
            .select({
              id: pokemon.id,
              displayName: pokemon.displayName,
              spriteUrl: pokemon.spriteUrl,
              evolutionStage: pokemon.evolutionStage,
              evolvesFromId: pokemon.evolvesFromId,
              evolutionMinLevel: pokemon.evolutionMinLevel,
              evolutionTrigger: pokemon.evolutionTrigger,
              isFullyEvolved: pokemon.isFullyEvolved,
            })
            .from(pokemon)
            .where(eq(pokemon.evolutionChainId, record.evolutionChainId))
            .orderBy(asc(pokemon.evolutionStage), asc(pokemon.id)),
    ]);

    // How this Pokémon's base stat total ranks against the whole dataset.
    const [rank] = await db
      .select({
        betterThan: sql<number>`(select count(*)::int from ${pokemon} p where p.base_stat_total < ${record.baseStatTotal})`,
        total: sql<number>`count(*)::int`,
      })
      .from(pokemon);

    res.json({
      pokemon: record,
      notes: noteRows,
      activity: activityRows,
      trainers: trainerRows,
      evolution: {
        chain: chainRows,
        stage: record.evolutionStage,
        chainLength: record.chainLength,
        isFullyEvolved: record.isFullyEvolved,
        /** Stages reachable directly from here (plural for Eevee-style chains). */
        nextStages: chainRows.filter((link) => link.evolvesFromId === record.id),
      },
      neighbours: {
        previous: neighbours.find((n) => n.id === id - 1) ?? null,
        next: neighbours.find((n) => n.id === id + 1) ?? null,
      },
      ranking: {
        baseStatTotalPercentile:
          rank && rank.total > 0 ? Math.round((rank.betterThan / rank.total) * 100) : null,
        total: rank?.total ?? 0,
      },
    });
  }),
);

/** Guard against a route ordering mistake silently returning the wrong thing. */
pokemonRouter.use((req) => {
  throw badRequest(`Unknown pokemon route: ${req.path}`);
});
