import { Router } from 'express';
import { z } from 'zod';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '../db/client.js';
import { pokemon, roster, trainers } from '../db/schema.js';
import { asyncHandler, badRequest, notFound } from '../http.js';

/**
 * Mutations on individual roster entries. Creating one lives on the trainer
 * (`POST /api/trainers/:id/roster`) because it needs a trainer to belong to;
 * everything else keys off the entry's own id.
 */
export const rosterRouter = Router();

const idParamSchema = z.object({ id: z.coerce.number().int().min(1) });

const patchSchema = z
  .object({
    nickname: z
      .string()
      .trim()
      .max(60)
      .nullable()
      .optional()
      .transform((value) => (value === '' ? null : value)),
    level: z.number().int().min(1).max(100).nullable().optional(),
    status: z.enum(roster.status.enumValues).optional(),
    /** Reassigning to another trainer — the caseload-transfer path. */
    trainerId: z.number().int().min(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No fields to update' });

/** PATCH /api/roster/:id */
rosterRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const input = patchSchema.parse(req.body);

    const [entry] = await db.select().from(roster).where(eq(roster.id, id)).limit(1);
    if (!entry) throw notFound(`No roster entry with id ${id}`);

    if (input.trainerId !== undefined && input.trainerId !== entry.trainerId) {
      const [trainer] = await db
        .select({ id: trainers.id })
        .from(trainers)
        .where(eq(trainers.id, input.trainerId))
        .limit(1);
      if (!trainer) throw badRequest(`No trainer with id ${input.trainerId}`);

      // The destination roster may already carry this Pokémon; the unique
      // index would reject it, so say so plainly instead.
      const [clash] = await db
        .select({ id: roster.id })
        .from(roster)
        .where(
          and(
            eq(roster.trainerId, input.trainerId),
            eq(roster.pokemonId, entry.pokemonId),
            ne(roster.id, id),
          ),
        )
        .limit(1);
      if (clash) {
        const [target] = await db
          .select({ displayName: pokemon.displayName })
          .from(pokemon)
          .where(eq(pokemon.id, entry.pokemonId))
          .limit(1);
        throw badRequest(`That trainer already carries ${target?.displayName ?? 'this Pokémon'}`);
      }
    }

    const [updated] = await db
      .update(roster)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(roster.id, id))
      .returning();

    res.json(updated);
  }),
);

/** DELETE /api/roster/:id */
rosterRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const [deleted] = await db.delete(roster).where(eq(roster.id, id)).returning({ id: roster.id });
    if (!deleted) throw notFound(`No roster entry with id ${id}`);
    res.status(204).end();
  }),
);
