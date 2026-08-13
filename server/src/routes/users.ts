import { Router } from 'express';
import { z } from 'zod';
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { activity, notes, users } from '../db/schema.js';
import { asyncHandler, badRequest, notFound } from '../http.js';
import { DEFAULT_OWNER } from '../constants.js';

export const usersRouter = Router();

/**
 * Notes and flags written by a user, counted through `owner = email` — there is
 * no foreign key (see schema.ts). Inner tables are aliased and the outer
 * reference qualified, per CLAUDE.md § correlated subqueries.
 */
const noteCount = sql<number>`(select count(*)::int from ${notes} n where n.owner = ${users}.email)`;
const activityCount = sql<number>`(select count(*)::int from ${activity} a where a.owner = ${users}.email)`;

const selection = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
  initials: users.initials,
  createdAt: users.createdAt,
  noteCount,
  activityCount,
} as const;

/**
 * GET /api/users — the whole directory.
 *
 * Unpaginated on purpose: it backs the "acting as" switcher, which is a select
 * control and needs every option at once. Same call as `/api/trainers`.
 */
usersRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await db.select(selection).from(users).orderBy(asc(users.name));
    res.json({ data: rows, defaultOwner: DEFAULT_OWNER });
  }),
);

/** Two initials from a display name — "Professor Oak" → "PO", "Oak" → "OA". */
function initialsFor(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1 ? words[0]![0]! + words[words.length - 1]![0]! : name.slice(0, 2);
  return letters.toUpperCase();
}

const createSchema = z.object({
  email: z.string().trim().email().max(200),
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().max(60).optional(),
  initials: z.string().trim().min(1).max(2).optional(),
});

/** POST /api/users */
usersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createSchema.parse(req.body);

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (existing) throw badRequest(`A user with email ${input.email} already exists`);

    const [created] = await db
      .insert(users)
      .values({
        email: input.email,
        name: input.name,
        role: input.role || null,
        initials: (input.initials || initialsFor(input.name)).toUpperCase(),
      })
      .returning();

    res.status(201).json(created);
  }),
);

const idParamSchema = z.object({ id: z.coerce.number().int().min(1) });

/**
 * PATCH /api/users/:id — display fields only.
 *
 * `email` is not editable: it is the value already written into every `owner`
 * column, so changing it would orphan that user's whole history rather than
 * rename it. Rename via `name`.
 */
const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    role: z.string().trim().max(60).nullable().optional(),
    initials: z.string().trim().min(1).max(2).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });

usersRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const input = updateSchema.parse(req.body);

    const [updated] = await db
      .update(users)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.role !== undefined ? { role: input.role || null } : {}),
        ...(input.initials !== undefined ? { initials: input.initials.toUpperCase() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();

    if (!updated) throw notFound(`No user with id ${id}`);
    res.json(updated);
  }),
);

/**
 * DELETE /api/users/:id — removes the identity, never the work.
 *
 * Their notes and flags keep the raw owner email and stay visible; only the
 * option to act as them goes away. The response reports what was left behind
 * so the UI can say so. DEFAULT_OWNER cannot be deleted — unattributed writes
 * land on it, so it must always resolve to a real user.
 */
usersRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);

    const [target] = await db.select(selection).from(users).where(eq(users.id, id)).limit(1);
    if (!target) throw notFound(`No user with id ${id}`);
    if (target.email === DEFAULT_OWNER) {
      throw badRequest('The default user cannot be deleted — unattributed writes are filed under it');
    }

    await db.delete(users).where(eq(users.id, id));
    res.json({
      deleted: target.email,
      orphanedNotes: target.noteCount,
      orphanedActivity: target.activityCount,
    });
  }),
);
