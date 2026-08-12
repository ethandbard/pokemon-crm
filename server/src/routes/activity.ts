import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { activity, pokemon } from '../db/schema.js';
import { asyncHandler, badRequest, notFound } from '../http.js';
import { DEFAULT_OWNER } from '../constants.js';

export const activityRouter = Router();

const kindSchema = z.enum(activity.kind.enumValues);

/** GET /api/activity — recent status changes across all Pokémon. */
activityRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        kind: kindSchema.optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(req.query);

    const rows = await db
      .select({
        id: activity.id,
        pokemonId: activity.pokemonId,
        kind: activity.kind,
        owner: activity.owner,
        createdAt: activity.createdAt,
        updatedAt: activity.updatedAt,
        pokemonName: pokemon.displayName,
        pokemonSpriteUrl: pokemon.spriteUrl,
      })
      .from(activity)
      .innerJoin(pokemon, eq(activity.pokemonId, pokemon.id))
      .where(query.kind ? eq(activity.kind, query.kind) : undefined)
      .orderBy(desc(activity.updatedAt))
      .limit(query.limit);

    res.json({ data: rows });
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
