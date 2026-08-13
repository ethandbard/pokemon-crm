import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client.js';
import { moves, pokemon, pokemonMoves, roster, trainers } from '../db/schema.js';
import { asyncHandler, badRequest, notFound, paginationFor } from '../http.js';
import { POKEMON_TYPES } from '../constants.js';

export const movesRouter = Router();

/** Columns the moves table is allowed to sort by, mapped to real columns. */
const SORTABLE = {
  id: moves.id,
  name: moves.displayName,
  type: moves.type,
  damageClass: moves.damageClass,
  power: moves.power,
  accuracy: moves.accuracy,
  pp: moves.pp,
  priority: moves.priority,
  generation: moves.generation,
  learnedBy: moves.learnedByCount,
} as const;

const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  type: z.enum(POKEMON_TYPES).optional(),
  damageClass: z.enum(['physical', 'special', 'status']).optional(),
  generation: z.coerce.number().int().min(1).max(9).optional(),
  /** Only moves learnable by this species. */
  pokemonId: z.coerce.number().int().min(1).optional(),
  /** Only moves someone on this trainer's roster can learn. */
  trainerId: z.coerce.number().int().min(1).optional(),
  /** Only moves reachable by this method — `level-up`, `machine`, `egg`, … */
  learnMethod: z.string().trim().max(40).optional(),
  minPower: z.coerce.number().int().min(0).max(400).optional(),
  maxPower: z.coerce.number().int().min(0).max(400).optional(),
  sort: z.enum(Object.keys(SORTABLE) as [keyof typeof SORTABLE]).default('learnedBy'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

/**
 * GET /api/moves — searchable, filterable, sortable, paginated list.
 *
 * The curriculum analogy: this is the course catalogue. `learnedByCount` is
 * denormalised onto the row (see schema.ts), so the default "most widely
 * learned first" ordering is an index scan rather than a group-by over the
 * ~110k row join table.
 */
movesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.parse(req.query);

    const filters: SQL[] = [];

    if (query.search) {
      const pattern = `%${query.search}%`;
      const clause = or(ilike(moves.displayName, pattern), ilike(moves.name, pattern));
      if (clause) filters.push(clause);
    }
    if (query.type) filters.push(eq(moves.type, query.type));
    if (query.damageClass) filters.push(eq(moves.damageClass, query.damageClass));
    if (query.generation !== undefined) filters.push(eq(moves.generation, query.generation));
    if (query.minPower !== undefined) filters.push(sql`${moves.power} >= ${query.minPower}`);
    if (query.maxPower !== undefined) filters.push(sql`${moves.power} <= ${query.maxPower}`);

    /*
     * Every clause below is an `exists` against the join table. Inner tables
     * are aliased and the outer reference is qualified as `${moves}.id` —
     * `pokemon_moves` has its own `id`, so the bare form would compare the
     * subquery to itself. See CLAUDE.md § correlated subqueries.
     */
    if (query.pokemonId !== undefined) {
      filters.push(
        sql`exists (select 1 from ${pokemonMoves} pm where pm.move_id = ${moves}.id and pm.pokemon_id = ${query.pokemonId})`,
      );
    }
    if (query.learnMethod) {
      filters.push(
        sql`exists (select 1 from ${pokemonMoves} pm where pm.move_id = ${moves}.id and pm.learn_method = ${query.learnMethod})`,
      );
    }
    if (query.trainerId !== undefined) {
      filters.push(sql`exists (
        select 1 from ${pokemonMoves} pm
        join ${roster} r on r.pokemon_id = pm.pokemon_id
        where pm.move_id = ${moves}.id and r.trainer_id = ${query.trainerId}
      )`);
    }

    const where = filters.length ? and(...filters) : undefined;
    const orderColumn = SORTABLE[query.sort];
    /*
     * `power` and `accuracy` are null for status moves, and Postgres sorts
     * nulls first descending. "Strongest moves" opening with a page of nulls
     * reads as broken data, so nulls always sort last in either direction.
     */
    const orderBy =
      query.direction === 'desc' ? sql`${orderColumn} desc nulls last` : sql`${orderColumn} asc nulls last`;

    const [rows, [totals]] = await Promise.all([
      db
        .select({
          id: moves.id,
          name: moves.name,
          displayName: moves.displayName,
          type: moves.type,
          damageClass: moves.damageClass,
          generation: moves.generation,
          power: moves.power,
          accuracy: moves.accuracy,
          pp: moves.pp,
          priority: moves.priority,
          effect: moves.effect,
          ailment: moves.ailment,
          target: moves.target,
          learnedByCount: moves.learnedByCount,
        })
        .from(moves)
        .where(where)
        // Tiebreaker on id keeps pagination stable — see CLAUDE.md § conventions.
        .orderBy(orderBy, asc(moves.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      db.select({ count: sql<number>`count(*)::int` }).from(moves).where(where),
    ]);

    res.json({
      data: rows,
      pagination: paginationFor(query.page, query.pageSize, totals?.count ?? 0),
    });
  }),
);

/** GET /api/moves/filters — distinct values for the moves page dropdowns. */
movesRouter.get(
  '/filters',
  asyncHandler(async (_req, res) => {
    const [types, generations, learnMethods, ailments, powerRange] = await Promise.all([
      db.execute<{ value: string }>(
        sql`select distinct type as value from ${moves} order by 1`,
      ),
      db.execute<{ value: number }>(
        sql`select distinct generation as value from ${moves} where generation is not null order by 1`,
      ),
      // Ordered by how common the method is, so `level-up` / `machine` lead and
      // the one-game oddities (`xd-shadow`, `light-ball-egg`) trail.
      db.execute<{ value: string; count: number }>(
        sql`select learn_method as value, count(*)::int as count
              from ${pokemonMoves}
             group by learn_method
             order by count desc, value asc`,
      ),
      db.execute<{ value: string }>(
        sql`select distinct ailment as value from ${moves} where ailment is not null and ailment <> 'none' order by 1`,
      ),
      db.execute<{ min: number | null; max: number | null }>(
        sql`select min(power)::int as min, max(power)::int as max from ${moves}`,
      ),
    ]);

    res.json({
      types: types.rows.map((r) => r.value),
      generations: generations.rows.map((r) => r.value),
      damageClasses: moves.damageClass.enumValues,
      learnMethods: learnMethods.rows,
      ailments: ailments.rows.map((r) => r.value),
      powerRange: powerRange.rows[0] ?? { min: null, max: null },
    });
  }),
);

const idParamSchema = z.object({ id: z.coerce.number().int().min(1) });

const learnerQuerySchema = z.object({
  learnMethod: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

/**
 * GET /api/moves/:id — the move, who learns it, and how.
 *
 * The learner list is paginated: a move like Protect is learned by ~900
 * species, and shipping all of them was the same silent truncation the trainer
 * history used to do.
 */
movesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const query = learnerQuerySchema.parse(req.query);

    const [move] = await db.select().from(moves).where(eq(moves.id, id)).limit(1);
    if (!move) throw notFound(`No move with id ${id}`);

    const learnerFilters: SQL[] = [eq(pokemonMoves.moveId, id)];
    if (query.learnMethod) learnerFilters.push(eq(pokemonMoves.learnMethod, query.learnMethod));
    const learnerWhere = and(...learnerFilters);

    const [learners, [learnerTotal], methodBreakdown, typeBreakdown, trainerRows] =
      await Promise.all([
        db
          .select({
            pokemonId: pokemon.id,
            displayName: pokemon.displayName,
            spriteUrl: pokemon.spriteUrl,
            type1: pokemon.type1,
            type2: pokemon.type2,
            generation: pokemon.generation,
            baseStatTotal: pokemon.baseStatTotal,
            learnMethod: pokemonMoves.learnMethod,
            levelLearnedAt: pokemonMoves.levelLearnedAt,
            versionGroup: pokemonMoves.versionGroup,
            /**
             * Same-type attack bonus: the move's type matches one of theirs.
             * `is not distinct from` rather than `=` — type2 is null for
             * single-typed species, and `null = 'electric'` is null, which
             * makes the whole OR null instead of false.
             */
            isStab: sql<boolean>`(${pokemon.type1} is not distinct from ${move.type} or ${pokemon.type2} is not distinct from ${move.type})`,
          })
          .from(pokemonMoves)
          .innerJoin(pokemon, eq(pokemonMoves.pokemonId, pokemon.id))
          .where(learnerWhere)
          .orderBy(asc(pokemonMoves.levelLearnedAt), asc(pokemon.id))
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(pokemonMoves)
          .innerJoin(pokemon, eq(pokemonMoves.pokemonId, pokemon.id))
          .where(learnerWhere),

        db.execute<{ learn_method: string; count: number; avg_level: number | null }>(sql`
          select
            pm.learn_method                                                as learn_method,
            count(*)::int                                                  as count,
            round(avg(pm.level_learned_at) filter (where pm.level_learned_at > 0))::int as avg_level
          from ${pokemonMoves} pm
          where pm.move_id = ${id}
          group by pm.learn_method
          order by count desc, learn_method asc
        `),

        // Which types learn this move — a move's reach across the dex.
        db.execute<{ type: string; count: number }>(sql`
          select t as type, count(distinct p.id)::int as count
          from ${pokemonMoves} pm
          join ${pokemon} p on p.id = pm.pokemon_id,
          unnest(array[p.type1, p.type2]) as t
          where pm.move_id = ${id} and t is not null
          group by t
          order by count desc, t asc
        `),

        /*
         * The CRM half: which trainers have someone who can learn this. Counts
         * the ACTIVE roster only, matching every other roster metric — see
         * CLAUDE.md § trainers and roster.
         */
        db.execute<{ trainer_id: number; trainer_name: string; learners: number; active_roster: number }>(sql`
          select
            t.id                                                     as trainer_id,
            t.name                                                   as trainer_name,
            count(*) filter (where exists (
              select 1 from ${pokemonMoves} pm
              where pm.move_id = ${id} and pm.pokemon_id = r.pokemon_id
            ))::int                                                  as learners,
            count(*)::int                                            as active_roster
          from ${roster} r
          join ${trainers} t on t.id = r.trainer_id
          where r.status <> 'retired'
          group by t.id, t.name
          having count(*) filter (where exists (
            select 1 from ${pokemonMoves} pm
            where pm.move_id = ${id} and pm.pokemon_id = r.pokemon_id
          )) > 0
          order by learners desc, t.name asc
        `),
      ]);

    res.json({
      move,
      learners,
      methodBreakdown: methodBreakdown.rows,
      typeBreakdown: typeBreakdown.rows,
      trainers: trainerRows.rows,
      pagination: paginationFor(query.page, query.pageSize, learnerTotal?.count ?? 0),
    });
  }),
);

/** Guard against a route ordering mistake silently returning the wrong thing. */
movesRouter.use((req) => {
  throw badRequest(`Unknown moves route: ${req.path}`);
});
