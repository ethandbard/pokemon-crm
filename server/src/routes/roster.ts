import { Router } from 'express';
import { z } from 'zod';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { db } from '../db/client.js';
import { moves, pokemon, pokemonMoves, roster, rosterMoves, trainers } from '../db/schema.js';
import { asyncHandler, badRequest, forbidden, notFound } from '../http.js';
import { ownerFor } from '../owner.js';
import { titleCase } from '../constants.js';

/**
 * Mutations on individual roster entries. Creating one lives on the trainer
 * (`POST /api/trainers/:id/roster`) because it needs a trainer to belong to;
 * everything else keys off the entry's own id.
 */
export const rosterRouter = Router();

const idParamSchema = z.object({ id: z.coerce.number().int().min(1) });

/**
 * Refuses when the acting user does not own the trainer this entry belongs to.
 *
 * Roster entries have no owner of their own — they inherit the trainer's, so
 * ownership is always one join away. A transfer has to clear **both** sides:
 * you cannot push a Pokémon onto someone else's roster, and you cannot pull one
 * off theirs.
 */
async function assertOwnsTrainer(req: Parameters<typeof ownerFor>[0], trainerId: number) {
  const [trainer] = await db
    .select({ name: trainers.name, owner: trainers.owner })
    .from(trainers)
    .where(eq(trainers.id, trainerId))
    .limit(1);

  if (!trainer) throw badRequest(`No trainer with id ${trainerId}`);
  if (trainer.owner !== ownerFor(req)) {
    throw forbidden(`${trainer.name} belongs to another user — switch to them to make changes`);
  }
}

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
    /**
     * An ability slug. Legality is checked against the species below — the
     * schema can only say "a string", since which strings are valid depends on
     * another table's array.
     */
    ability: z
      .string()
      .trim()
      .max(60)
      .nullable()
      .optional()
      .transform((value) => (value === '' ? null : value)),
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
    await assertOwnsTrainer(req, entry.trainerId);

    // An ability must be one this species actually has. Like move legality this
    // is a constraint against another row's contents, so no foreign key can
    // carry it — and unlike a held item, which any Pokémon may carry, there is
    // a real rule here to enforce.
    //
    // Only the value being *set* is checked. The transfer branch below moves an
    // entry between trainers, never between species, so a stored ability stays
    // legal across a transfer and needs no re-validation.
    if (input.ability) {
      const [species] = await db
        .select({
          displayName: pokemon.displayName,
          abilities: pokemon.abilities,
          hiddenAbility: pokemon.hiddenAbility,
        })
        .from(pokemon)
        .where(eq(pokemon.id, entry.pokemonId))
        .limit(1);

      const legal = new Set([...(species?.abilities ?? []), species?.hiddenAbility].filter(Boolean));
      if (!legal.has(input.ability)) {
        // Name what it could be instead — a rejection with no alternatives is
        // not actionable from a form.
        const options = [...legal].map((slug) => titleCase(String(slug))).join(', ') || 'none on record';
        throw badRequest(
          `${species?.displayName ?? 'This Pokémon'} cannot have ${titleCase(input.ability)} — its abilities are: ${options}`,
        );
      }
    }

    if (input.trainerId !== undefined && input.trainerId !== entry.trainerId) {
      // Both ends of a transfer must be yours. This also proves the
      // destination exists, so no separate existence check is needed.
      await assertOwnsTrainer(req, input.trainerId);

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

/**
 * The four move slots a roster entry carries, in slot order, with enough of the
 * move to render a row without a second request.
 */
async function movesetFor(rosterId: number) {
  return db
    .select({
      slot: rosterMoves.slot,
      moveId: moves.id,
      name: moves.name,
      displayName: moves.displayName,
      type: moves.type,
      damageClass: moves.damageClass,
      power: moves.power,
      accuracy: moves.accuracy,
      pp: moves.pp,
    })
    .from(rosterMoves)
    .innerJoin(moves, eq(moves.id, rosterMoves.moveId))
    .where(eq(rosterMoves.rosterId, rosterId))
    .orderBy(asc(rosterMoves.slot));
}

/** GET /api/roster/:id/moves — the current moveset. */
rosterRouter.get(
  '/:id/moves',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const [entry] = await db.select({ id: roster.id }).from(roster).where(eq(roster.id, id)).limit(1);
    if (!entry) throw notFound(`No roster entry with id ${id}`);

    res.json({ moveset: await movesetFor(id) });
  }),
);

/**
 * The moveset, as an ordered list of move ids — slot 1 first.
 *
 * Four is the game's limit and the number every coverage figure downstream
 * assumes. An empty array clears the moveset, which is why this is a PUT of the
 * whole set rather than per-slot patching: one round trip, atomic, and no way to
 * leave slot 3 pointing at a move that slot 1 was just given.
 */
const movesetSchema = z.object({
  moveIds: z.array(z.number().int().min(1)).max(4),
});

/** PUT /api/roster/:id/moves */
rosterRouter.put(
  '/:id/moves',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const { moveIds } = movesetSchema.parse(req.body);

    const [entry] = await db
      .select({ id: roster.id, pokemonId: roster.pokemonId, trainerId: roster.trainerId })
      .from(roster)
      .where(eq(roster.id, id))
      .limit(1);
    if (!entry) throw notFound(`No roster entry with id ${id}`);
    await assertOwnsTrainer(req, entry.trainerId);

    if (new Set(moveIds).size !== moveIds.length) {
      throw badRequest('A moveset cannot carry the same move twice');
    }

    // **The rule that makes this feature mean anything**: a move must be one
    // this species can actually learn. It is a constraint against a join, so no
    // foreign key can carry it — it lives here, and nothing else writes the
    // table. Without it the coverage analysis is just a wish list.
    if (moveIds.length > 0) {
      const legal = await db
        .select({ moveId: pokemonMoves.moveId })
        .from(pokemonMoves)
        .where(and(eq(pokemonMoves.pokemonId, entry.pokemonId), inArray(pokemonMoves.moveId, moveIds)));

      const legalIds = new Set(legal.map((row) => row.moveId));
      const illegal = moveIds.filter((moveId) => !legalIds.has(moveId));

      if (illegal.length > 0) {
        // Name them — an id in an error message is not actionable.
        const named = await db
          .select({ displayName: moves.displayName })
          .from(moves)
          .where(inArray(moves.id, illegal));
        const [species] = await db
          .select({ displayName: pokemon.displayName })
          .from(pokemon)
          .where(eq(pokemon.id, entry.pokemonId))
          .limit(1);

        const label = named.length > 0 ? named.map((m) => m.displayName).join(', ') : illegal.join(', ');
        throw badRequest(`${species?.displayName ?? 'This Pokémon'} cannot learn ${label}`);
      }
    }

    // Replace wholesale inside one transaction: a half-applied moveset would
    // report coverage the trainer does not have.
    await db.transaction(async (tx) => {
      await tx.delete(rosterMoves).where(eq(rosterMoves.rosterId, id));
      if (moveIds.length > 0) {
        await tx.insert(rosterMoves).values(
          moveIds.map((moveId, index) => ({ rosterId: id, moveId, slot: index + 1 })),
        );
      }
      await tx.update(roster).set({ updatedAt: new Date() }).where(eq(roster.id, id));
    });

    res.json({ moveset: await movesetFor(id) });
  }),
);

/** DELETE /api/roster/:id */
rosterRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);

    const [entry] = await db
      .select({ trainerId: roster.trainerId })
      .from(roster)
      .where(eq(roster.id, id))
      .limit(1);
    if (!entry) throw notFound(`No roster entry with id ${id}`);
    await assertOwnsTrainer(req, entry.trainerId);

    const [deleted] = await db.delete(roster).where(eq(roster.id, id)).returning({ id: roster.id });
    if (!deleted) throw notFound(`No roster entry with id ${id}`);
    res.status(204).end();
  }),
);
