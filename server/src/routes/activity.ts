import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client.js';
import { activity, pokemon } from '../db/schema.js';
import { asyncHandler, badRequest, notFound } from '../http.js';
import { DEFAULT_OWNER } from '../constants.js';

export const activityRouter = Router();

const kindSchema = z.enum(activity.kind.enumValues);

/** Columns the activity table may sort by, mapped to real columns. */
const SORTABLE = {
  updatedAt: activity.updatedAt,
  createdAt: activity.createdAt,
  kind: activity.kind,
  owner: activity.owner,
  pokemon: pokemon.displayName,
  pokemonId: activity.pokemonId,
} as const;

const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  kind: kindSchema.optional(),
  owner: z.string().trim().max(200).optional(),
  pokemonId: z.coerce.number().int().min(1).optional(),
  sort: z.enum(Object.keys(SORTABLE) as [keyof typeof SORTABLE]).default('updatedAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

/**
 * GET /api/activity — status flags across all Pokémon, joined to the Pokémon
 * they belong to. Backs the Activity page's interactive table.
 */
activityRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.parse(req.query);

    const filters: SQL[] = [];
    if (query.search) {
      const pattern = `%${query.search}%`;
      const clause = or(ilike(pokemon.displayName, pattern), ilike(pokemon.name, pattern));
      if (clause) filters.push(clause);
    }
    if (query.kind) filters.push(eq(activity.kind, query.kind));
    if (query.owner) filters.push(eq(activity.owner, query.owner));
    if (query.pokemonId !== undefined) filters.push(eq(activity.pokemonId, query.pokemonId));

    const where = filters.length ? and(...filters) : undefined;
    const orderColumn = SORTABLE[query.sort];
    const orderBy = query.direction === 'desc' ? desc(orderColumn) : asc(orderColumn);

    const [rows, [totals], owners, kindCounts] = await Promise.all([
      db
        .select({
          id: activity.id,
          pokemonId: activity.pokemonId,
          kind: activity.kind,
          owner: activity.owner,
          createdAt: activity.createdAt,
          updatedAt: activity.updatedAt,
          pokemonName: pokemon.displayName,
          pokemonSpriteUrl: pokemon.spriteUrl,
          pokemonType1: pokemon.type1,
          pokemonType2: pokemon.type2,
        })
        .from(activity)
        .innerJoin(pokemon, eq(activity.pokemonId, pokemon.id))
        .where(where)
        .orderBy(orderBy, desc(activity.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(activity)
        .innerJoin(pokemon, eq(activity.pokemonId, pokemon.id))
        .where(where),
      db.selectDistinct({ owner: activity.owner }).from(activity).orderBy(asc(activity.owner)),
      // Unfiltered totals per kind, so the summary tiles don't move when the
      // table is filtered.
      db
        .select({ kind: activity.kind, count: sql<number>`count(*)::int` })
        .from(activity)
        .groupBy(activity.kind),
    ]);

    res.json({
      data: rows,
      owners: owners.map((o) => o.owner),
      kindCounts: Object.fromEntries(kindCounts.map((k) => [k.kind, k.count])),
      kinds: activity.kind.enumValues,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: totals?.count ?? 0,
        totalPages: Math.max(1, Math.ceil((totals?.count ?? 0) / query.pageSize)),
      },
    });
  }),
);

const toggleSchema = z.object({
  pokemonId: z.number().int().min(1),
  kind: kindSchema,
  owner: z.string().trim().min(1).max(200).optional(),
});

/**
 * POST /api/activity/toggle — flips a status flag on or off.
 *
 * `reviewed` is treated as an event rather than a switch: re-posting it bumps
 * the timestamp instead of clearing the flag, which is what makes
 * "last reviewed" meaningful.
 */
activityRouter.post(
  '/toggle',
  asyncHandler(async (req, res) => {
    const input = toggleSchema.parse(req.body);
    const owner = input.owner ?? DEFAULT_OWNER;

    const [target] = await db
      .select({ id: pokemon.id })
      .from(pokemon)
      .where(eq(pokemon.id, input.pokemonId))
      .limit(1);
    if (!target) throw badRequest(`No Pokémon with id ${input.pokemonId}`);

    const match = and(
      eq(activity.pokemonId, input.pokemonId),
      eq(activity.owner, owner),
      eq(activity.kind, input.kind),
    );

    const [existing] = await db.select().from(activity).where(match).limit(1);

    if (existing && input.kind !== 'reviewed') {
      await db.delete(activity).where(match);
      res.json({ active: false, kind: input.kind, pokemonId: input.pokemonId });
      return;
    }

    const [row] = await db
      .insert(activity)
      .values({ pokemonId: input.pokemonId, owner, kind: input.kind })
      .onConflictDoUpdate({
        target: [activity.pokemonId, activity.owner, activity.kind],
        set: { updatedAt: sql`now()` },
      })
      .returning();

    res.json({ active: true, kind: input.kind, pokemonId: input.pokemonId, record: row });
  }),
);

/** DELETE /api/activity/:id */
activityRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.coerce.number().int().min(1) }).parse(req.params);
    const [deleted] = await db
      .delete(activity)
      .where(eq(activity.id, id))
      .returning({ id: activity.id });
    if (!deleted) throw notFound(`No activity with id ${id}`);
    res.status(204).end();
  }),
);
