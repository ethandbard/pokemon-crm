import { Router } from 'express';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { abilities, activity, notes, pokemon, roster, trainers, users } from '../db/schema.js';
import { asyncHandler, badRequest, notFound } from '../http.js';
import { DEFAULT_OWNER, POKEMON_TYPES } from '../constants.js';

/**
 * Workspace administration: who owns what, and whether the data is intact.
 *
 * **Deliberately ungated**, like everything else here. There is no auth and
 * `users.role` is display-only (see CLAUDE.md § users), so an "admins only"
 * check would be a fiction resting on an unverified header. The page says so.
 *
 * Nothing on this router weakens anything: reassigning a trainer is already
 * achievable by switching to its owner in the switcher, which anyone can do.
 * What it adds is doing it deliberately, and repairing attribution that the
 * deliberate absence of foreign keys on `owner` makes possible.
 */
export const adminRouter = Router();

/** Rows the seed is responsible for, with what a complete import looks like. */
const REFERENCE_TABLES = [
  { key: 'pokemon', label: 'Pokémon', expected: 1025, seededBy: 'npm run seed' },
  { key: 'moves', label: 'Moves', expected: 797, seededBy: 'npm run seed (SEED_MOVES=true)' },
  { key: 'pokemon_moves', label: 'Movepool rows', expected: null, seededBy: 'npm run seed' },
  {
    key: 'type_damage',
    label: 'Type chart',
    expected: POKEMON_TYPES.length * POKEMON_TYPES.length,
    seededBy: 'npm run seed:types',
  },
  { key: 'growth_rates', label: 'Growth curves', expected: 600, seededBy: 'npm run seed' },
  /**
   * No `expected` — the count is however many distinct abilities the seeded dex
   * references (284 at the full 1,025), not PokeAPI's total. A SEED_LIMIT run
   * legitimately imports fewer, so a fixed target would report a healthy
   * workspace as incomplete.
   */
  {
    key: 'abilities',
    label: 'Ability effects',
    expected: null,
    seededBy: 'npm run seed:abilities',
  },
  /** Fixed since Gen 3 and not going to change, so a hard target is right here. */
  { key: 'natures', label: 'Natures', expected: 25, seededBy: 'npm run seed:natures' },
  /** One row per (move, game); the count tracks how many moves were seeded. */
  { key: 'move_machines', label: 'TM numbers', expected: null, seededBy: 'npm run seed:machines' },
  /** Scoped to holdable categories, so no fixed target — see schema.ts § items. */
  { key: 'items', label: 'Held items', expected: null, seededBy: 'npm run seed:items' },
] as const;

/**
 * GET /api/admin/overview — is this workspace intact?
 *
 * Exists because a partly-seeded database currently announces itself as
 * unexplained empty states scattered across five pages. One place should be
 * able to say "the moves import was skipped" instead.
 */
adminRouter.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const [counts] = (
      await db.execute(sql`
        select
          (select count(*)::int from ${users})        as users,
          (select count(*)::int from ${trainers})     as trainers,
          (select count(*)::int from ${notes})        as notes,
          (select count(*)::int from ${activity})     as activity,
          (select count(*)::int from pokemon)         as pokemon,
          (select count(*)::int from moves)           as moves,
          (select count(*)::int from pokemon_moves)   as pokemon_moves,
          (select count(*)::int from type_damage)     as type_damage,
          (select count(*)::int from growth_rates)    as growth_rates,
          (select count(*)::int from roster)          as roster,
          (select count(*)::int from roster_moves)    as roster_moves,
          (select count(*)::int from abilities)       as abilities,
          (select count(*)::int from natures)         as natures,
          (select count(*)::int from move_machines)   as move_machines,
          (select count(*)::int from items)           as items,
          (select count(*)::int from roster_items)    as roster_items
      `)
    ).rows as unknown as Record<string, number>[];

    /*
     * Owner strings with no matching `users` row.
     *
     * `owner` columns intentionally have no foreign key (see schema.ts § users),
     * so deleting a user leaves their notes and flags in place under a raw
     * email. That is the design — but nothing surfaced the result until now.
     */
    const orphans = await db.execute(sql`
      select owner,
             sum(trainers)::int as trainers,
             sum(notes)::int    as notes,
             sum(activity)::int as activity
      from (
        select t.owner as owner, count(*)::int as trainers, 0 as notes, 0 as activity
          from ${trainers} t where not exists (select 1 from ${users} u where u.email = t.owner)
          group by t.owner
        union all
        select n.owner, 0, count(*)::int, 0
          from ${notes} n where not exists (select 1 from ${users} u where u.email = n.owner)
          group by n.owner
        union all
        select a.owner, 0, 0, count(*)::int
          from ${activity} a where not exists (select 1 from ${users} u where u.email = a.owner)
          group by a.owner
      ) s
      group by owner
      order by owner
    `);

    /*
     * Roster abilities that no longer hold up.
     *
     * `PATCH /api/roster/:id` validates an ability against the species when it
     * is set, but the check is a point-in-time one: a later re-seed can rewrite
     * `pokemon.abilities` and strand a value that was legal when it was chosen.
     * Two distinct failures, deliberately reported apart —
     *
     *   `unknown`  the slug has no `abilities` row, so it renders untranslated.
     *              Usually means the ability import was skipped, not corruption.
     *   `illegal`  the species no longer lists it. The roster entry is asserting
     *              something the reference data contradicts.
     *
     * This lives here rather than in the attention queue because it is a
     * data-health fact about the workspace, not a trainer's outstanding work.
     */
    const strandedAbilities = await db.execute(sql`
      select
        r.id                                            as "rosterId",
        t.name                                          as "trainerName",
        p.display_name                                  as "pokemonName",
        r.ability                                       as "ability",
        case
          when not (r.ability = any(p.abilities) or r.ability = p.hidden_ability) then 'illegal'
          else 'unknown'
        end                                             as "reason"
      from ${roster} r
      join ${trainers} t on t.id = r.trainer_id
      join ${pokemon} p on p.id = r.pokemon_id
      where r.ability is not null
        and (
          not (r.ability = any(p.abilities) or r.ability = p.hidden_ability)
          or not exists (select 1 from ${abilities} ab where ab.slug = r.ability)
        )
      order by t.name, p.display_name
    `);

    const tables = REFERENCE_TABLES.map((table) => {
      const actual = counts?.[table.key] ?? 0;
      return {
        ...table,
        actual,
        // `expected: null` means "no fixed target" — the movepool size depends
        // on how far up the dex the seed was told to go.
        status: actual === 0 ? 'empty' : table.expected && actual < table.expected ? 'partial' : 'ok',
      };
    });

    res.json({
      counts: counts ?? {},
      tables,
      orphans: orphans.rows,
      strandedAbilities: strandedAbilities.rows,
      defaultOwner: DEFAULT_OWNER,
    });
  }),
);

/**
 * PATCH /api/admin/trainers/:id/owner — hand a trainer to another user.
 *
 * Its own endpoint rather than a field on the trainer form: this is the one
 * edit that can remove your own access, and it is not the same kind of change
 * as fixing a bio. Unlike every other trainer write it is **not** guarded by
 * current ownership — otherwise an orphaned trainer, whose owner no longer
 * exists, could never be recovered by anyone.
 */
adminRouter.patch(
  '/trainers/:id/owner',
  asyncHandler(async (req, res) => {
    const { id } = z.object({ id: z.coerce.number().int().min(1) }).parse(req.params);
    const { owner } = z.object({ owner: z.string().trim().min(1).max(200) }).parse(req.body);

    // Assigning to an address with no user row would manufacture exactly the
    // orphan this page exists to clean up.
    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.email, owner)).limit(1);
    if (!target) throw badRequest(`No user with email ${owner} — create them first`);

    const [updated] = await db
      .update(trainers)
      .set({ owner, updatedAt: new Date() })
      .where(eq(trainers.id, id))
      .returning();

    if (!updated) throw notFound(`No trainer with id ${id}`);
    res.json(updated);
  }),
);

/**
 * POST /api/admin/reassign-owner — move everything filed under one owner
 * string to another.
 *
 * The realistic "someone left" operation, and the repair for orphaned
 * attribution. `notes` and `activity` are opt-in because handing over a
 * caseload is not the same as claiming authorship of somebody's write-ups —
 * the caller decides.
 */
adminRouter.post(
  '/reassign-owner',
  asyncHandler(async (req, res) => {
    const input = z
      .object({
        from: z.string().trim().min(1).max(200),
        to: z.string().trim().min(1).max(200),
        includeTrainers: z.boolean().default(true),
        includeNotes: z.boolean().default(false),
        includeActivity: z.boolean().default(false),
      })
      .parse(req.body);

    if (input.from === input.to) throw badRequest('Source and destination are the same');

    const [target] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.to))
      .limit(1);
    if (!target) throw badRequest(`No user with email ${input.to} — create them first`);

    // One transaction: a half-applied handover splits a caseload between two
    // owners with no record of which rows moved.
    const moved = await db.transaction(async (tx) => {
      const result = { trainers: 0, notes: 0, activity: 0 };

      if (input.includeTrainers) {
        const rows = await tx
          .update(trainers)
          .set({ owner: input.to, updatedAt: new Date() })
          .where(eq(trainers.owner, input.from))
          .returning({ id: trainers.id });
        result.trainers = rows.length;
      }

      if (input.includeNotes) {
        const rows = await tx
          .update(notes)
          .set({ owner: input.to, updatedAt: new Date() })
          .where(eq(notes.owner, input.from))
          .returning({ id: notes.id });
        result.notes = rows.length;
      }

      if (input.includeActivity) {
        /*
         * `activity` is unique on (pokemon, owner, kind), so moving a flag onto
         * an owner who already has the same flag would collide. Drop those
         * duplicates first — the destination already records the fact.
         */
        await tx.execute(sql`
          delete from ${activity} a
          where a.owner = ${input.from}
            and exists (
              select 1 from ${activity} b
              where b.pokemon_id = a.pokemon_id and b.kind = a.kind and b.owner = ${input.to}
            )
        `);
        const rows = await tx
          .update(activity)
          .set({ owner: input.to, updatedAt: new Date() })
          .where(eq(activity.owner, input.from))
          .returning({ id: activity.id });
        result.activity = rows.length;
      }

      return result;
    });

    res.json({ from: input.from, to: input.to, moved });
  }),
);
