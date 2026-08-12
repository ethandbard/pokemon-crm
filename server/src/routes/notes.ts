import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, ilike, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client.js';
import { notes, pokemon } from '../db/schema.js';
import { asyncHandler, badRequest, notFound } from '../http.js';
import { DEFAULT_OWNER } from '../constants.js';

export const notesRouter = Router();

const SORTABLE = {
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt,
  pokemon: pokemon.displayName,
  owner: notes.owner,
} as const;

const listQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  pokemonId: z.coerce.number().int().min(1).optional(),
  owner: z.string().trim().max(200).optional(),
  sort: z.enum(Object.keys(SORTABLE) as [keyof typeof SORTABLE]).default('createdAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

/** GET /api/notes — cross-Pokémon note feed, joined to its Pokémon for display. */
notesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.parse(req.query);

    const filters: SQL[] = [];
    if (query.search) filters.push(ilike(notes.body, `%${query.search}%`));
    if (query.pokemonId !== undefined) filters.push(eq(notes.pokemonId, query.pokemonId));
    if (query.owner) filters.push(eq(notes.owner, query.owner));

    const where = filters.length ? and(...filters) : undefined;
    const orderColumn = SORTABLE[query.sort];
    const orderBy = query.direction === 'desc' ? desc(orderColumn) : asc(orderColumn);

    const [rows, [totals], owners] = await Promise.all([
      db
        .select({
          id: notes.id,
          pokemonId: notes.pokemonId,
          owner: notes.owner,
          body: notes.body,
          createdAt: notes.createdAt,
          updatedAt: notes.updatedAt,
          pokemonName: pokemon.displayName,
          pokemonSpriteUrl: pokemon.spriteUrl,
          pokemonType1: pokemon.type1,
          pokemonType2: pokemon.type2,
        })
        .from(notes)
        .innerJoin(pokemon, eq(notes.pokemonId, pokemon.id))
        .where(where)
        .orderBy(orderBy, desc(notes.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(notes)
        .innerJoin(pokemon, eq(notes.pokemonId, pokemon.id))
        .where(where),
      db.selectDistinct({ owner: notes.owner }).from(notes).orderBy(asc(notes.owner)),
    ]);

    res.json({
      data: rows,
      owners: owners.map((o) => o.owner),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: totals?.count ?? 0,
        totalPages: Math.max(1, Math.ceil((totals?.count ?? 0) / query.pageSize)),
      },
    });
  }),
);

const createSchema = z.object({
  pokemonId: z.number().int().min(1),
  body: z.string().trim().min(1, 'Note cannot be empty').max(5000),
  // Optional today; becomes the session user once auth lands.
  owner: z.string().trim().min(1).max(200).optional(),
});

/** POST /api/notes */
notesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createSchema.parse(req.body);

    const [target] = await db
      .select({ id: pokemon.id })
      .from(pokemon)
      .where(eq(pokemon.id, input.pokemonId))
      .limit(1);
    if (!target) throw badRequest(`No Pokémon with id ${input.pokemonId}`);

    const [created] = await db
      .insert(notes)
      .values({
        pokemonId: input.pokemonId,
        body: input.body,
        owner: input.owner ?? DEFAULT_OWNER,
      })
      .returning();

    res.status(201).json(created);
  }),
);

const idParamSchema = z.object({ id: z.coerce.number().int().min(1) });
const updateSchema = z.object({
  body: z.string().trim().min(1, 'Note cannot be empty').max(5000),
});

/** PATCH /api/notes/:id */
notesRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const input = updateSchema.parse(req.body);

    const [updated] = await db
      .update(notes)
      .set({ body: input.body, updatedAt: new Date() })
      .where(eq(notes.id, id))
      .returning();

    if (!updated) throw notFound(`No note with id ${id}`);
    res.json(updated);
  }),
);

/** DELETE /api/notes/:id */
notesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const [deleted] = await db.delete(notes).where(eq(notes.id, id)).returning({ id: notes.id });
    if (!deleted) throw notFound(`No note with id ${id}`);
    res.status(204).end();
  }),
);
