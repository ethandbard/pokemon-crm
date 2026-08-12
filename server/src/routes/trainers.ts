import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client.js';
import { activity, notes, pokemon, roster, trainers } from '../db/schema.js';
import { asyncHandler, badRequest, notFound } from '../http.js';

export const trainersRouter = Router();

/**
 * GET /api/trainers — every trainer, with roster size and a headline stat.
 *
 * Returns the full list unpaginated: it backs a select/search control, which
 * needs all options client-side to filter without a round trip per keystroke.
 * Revisit if the trainer count ever gets large.
 */
trainersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { search } = z
      .object({ search: z.string().trim().max(100).optional() })
      .parse(req.query);

    const filters: SQL[] = [];
    if (search) {
      const pattern = `%${search}%`;
      const clause = or(
        ilike(trainers.name, pattern),
        ilike(trainers.region, pattern),
        ilike(trainers.specialty, pattern),
      );
      if (clause) filters.push(clause);
    }

    const rows = await db
      .select({
        id: trainers.id,
        name: trainers.name,
        region: trainers.region,
        specialty: trainers.specialty,
        email: trainers.email,
        bio: trainers.bio,
        // Outer reference qualified as `${trainers}.id` — see the note in
        // routes/pokemon.ts on why the bare form is unsafe here.
        rosterSize: sql<number>`(select count(*)::int from ${roster} r where r.trainer_id = ${trainers}.id)`,
        activeCount: sql<number>`(select count(*)::int from ${roster} r where r.trainer_id = ${trainers}.id and r.status <> 'retired')`,
        avgBaseStatTotal: sql<number>`coalesce((
          select round(avg(p.base_stat_total))::int
          from ${roster} r join ${pokemon} p on p.id = r.pokemon_id
          where r.trainer_id = ${trainers}.id
        ), 0)`,
      })
      .from(trainers)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(trainers.name));

    res.json({ data: rows });
  }),
);

const idParamSchema = z.object({ id: z.coerce.number().int().min(1) });

/** Empty strings from HTML inputs become NULL rather than ''. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === '' || value === undefined ? null : value));

const trainerBodySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  region: optionalText(80),
  specialty: optionalText(40),
  email: z.union([z.string().trim().email('Must be a valid email'), z.literal('')]).optional()
    .transform((value) => (value === '' || value === undefined ? null : value)),
  bio: optionalText(1000),
});

/** POST /api/trainers — create a trainer. */
trainersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = trainerBodySchema.parse(req.body);

    const [existing] = await db
      .select({ id: trainers.id })
      .from(trainers)
      .where(eq(trainers.name, input.name))
      .limit(1);
    // The unique index would reject this anyway; catching it here turns a
    // 500 into a message the form can show against the name field.
    if (existing) throw badRequest(`A trainer named “${input.name}” already exists`);

    const [created] = await db.insert(trainers).values(input).returning();
    res.status(201).json(created);
  }),
);

/** PATCH /api/trainers/:id */
trainersRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const input = trainerBodySchema.parse(req.body);

    const [clash] = await db
      .select({ id: trainers.id })
      .from(trainers)
      .where(eq(trainers.name, input.name))
      .limit(1);
    if (clash && clash.id !== id) throw badRequest(`A trainer named “${input.name}” already exists`);

    const [updated] = await db
      .update(trainers)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(trainers.id, id))
      .returning();

    if (!updated) throw notFound(`No trainer with id ${id}`);
    res.json(updated);
  }),
);

/** DELETE /api/trainers/:id — cascades to their roster rows. */
trainersRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const [deleted] = await db
      .delete(trainers)
      .where(eq(trainers.id, id))
      .returning({ id: trainers.id });
    if (!deleted) throw notFound(`No trainer with id ${id}`);
    res.status(204).end();
  }),
);

/**
 * POST /api/trainers/:id/roster/bulk — add several Pokémon at once.
 *
 * Pokémon already on the roster are skipped rather than erroring, so adding a
 * selection that partly overlaps still does the useful part. The response says
 * what was added and what was skipped.
 */
trainersRouter.post(
  '/:id/roster/bulk',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const input = z
      .object({ pokemonIds: z.array(z.number().int().min(1)).min(1).max(200) })
      .parse(req.body);

    const [trainer] = await db
      .select({ id: trainers.id })
      .from(trainers)
      .where(eq(trainers.id, id))
      .limit(1);
    if (!trainer) throw notFound(`No trainer with id ${id}`);

    const valid = await db
      .select({ id: pokemon.id })
      .from(pokemon)
      .where(inArray(pokemon.id, input.pokemonIds));
    const validIds = new Set(valid.map((row) => row.id));

    const already = await db
      .select({ pokemonId: roster.pokemonId })
      .from(roster)
      .where(and(eq(roster.trainerId, id), inArray(roster.pokemonId, input.pokemonIds)));
    const alreadyIds = new Set(already.map((row) => row.pokemonId));

    const toAdd = input.pokemonIds.filter((pid) => validIds.has(pid) && !alreadyIds.has(pid));

    if (toAdd.length > 0) {
      await db
        .insert(roster)
        .values(toAdd.map((pokemonId) => ({ trainerId: id, pokemonId })))
        .onConflictDoNothing();
    }

    res.status(201).json({
      added: toAdd.length,
      skippedAlreadyOnRoster: alreadyIds.size,
      skippedUnknown: input.pokemonIds.filter((pid) => !validIds.has(pid)).length,
    });
  }),
);

const rosterBodySchema = z.object({
  pokemonId: z.number().int().min(1),
  nickname: optionalText(60),
  level: z.number().int().min(1).max(100).nullable().optional(),
  status: z.enum(roster.status.enumValues).default('active'),
});

/** POST /api/trainers/:id/roster — add a Pokémon to the roster. */
trainersRouter.post(
  '/:id/roster',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const input = rosterBodySchema.parse(req.body);

    const [trainer] = await db
      .select({ id: trainers.id })
      .from(trainers)
      .where(eq(trainers.id, id))
      .limit(1);
    if (!trainer) throw notFound(`No trainer with id ${id}`);

    const [target] = await db
      .select({ id: pokemon.id, displayName: pokemon.displayName })
      .from(pokemon)
      .where(eq(pokemon.id, input.pokemonId))
      .limit(1);
    if (!target) throw badRequest(`No Pokémon with id ${input.pokemonId}`);

    const [duplicate] = await db
      .select({ id: roster.id })
      .from(roster)
      .where(and(eq(roster.trainerId, id), eq(roster.pokemonId, input.pokemonId)))
      .limit(1);
    if (duplicate) throw badRequest(`${target.displayName} is already on this roster`);

    const [created] = await db
      .insert(roster)
      .values({
        trainerId: id,
        pokemonId: input.pokemonId,
        nickname: input.nickname,
        level: input.level ?? null,
        status: input.status,
      })
      .returning();

    res.status(201).json(created);
  }),
);

/**
 * GET /api/trainers/:id — the trainer dashboard payload.
 *
 * Bundles the roster, aggregate stats, and the note/activity history for every
 * Pokémon on that roster, so the page renders from one round trip.
 */
trainersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);

    const [trainer] = await db.select().from(trainers).where(eq(trainers.id, id)).limit(1);
    if (!trainer) throw notFound(`No trainer with id ${id}`);

    const [rosterRows, summary, typeBreakdown, statAverages, trainerNotes, trainerActivity] =
      await Promise.all([
        db
          .select({
            id: roster.id,
            pokemonId: roster.pokemonId,
            nickname: roster.nickname,
            level: roster.level,
            status: roster.status,
            acquiredAt: roster.acquiredAt,
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
            isLegendary: pokemon.isLegendary,
            spriteUrl: pokemon.spriteUrl,

            // --- Evolution progress ("degree progress") -------------------
            evolutionStage: pokemon.evolutionStage,
            chainLength: pokemon.chainLength,
            isFullyEvolved: pokemon.isFullyEvolved,
            /** The cheapest next stage, or null when fully evolved. */
            nextEvolution: sql<{
              id: number;
              display_name: string;
              evolution_min_level: number | null;
              evolution_trigger: string | null;
              sprite_url: string | null;
            } | null>`(
              select to_jsonb(x) from (
                select n.id, n.display_name, n.evolution_min_level, n.evolution_trigger, n.sprite_url
                from ${pokemon} n
                where n.evolves_from_id = ${roster}.pokemon_id
                order by n.evolution_min_level nulls last, n.id
                limit 1
              ) x
            )`,
            /**
             * "Milestone eligible": has met the level requirement for its next
             * stage but hasn't been evolved yet — the advising equivalent of a
             * student who has satisfied a requirement and needs signing off.
             */
            milestoneEligible: sql<boolean>`(
              not ${pokemon}.is_fully_evolved
              and ${roster}.level is not null
              and exists (
                select 1 from ${pokemon} n
                where n.evolves_from_id = ${roster}.pokemon_id
                  and n.evolution_min_level is not null
                  and ${roster}.level >= n.evolution_min_level
              )
            )`,
            noteCount: sql<number>`(select count(*)::int from ${notes} n where n.pokemon_id = ${roster}.pokemon_id)`,
            activityKinds: sql<
              string[]
            >`coalesce((select array_agg(a.kind::text order by a.kind::text) from ${activity} a where a.pokemon_id = ${roster}.pokemon_id), '{}')`,
          })
          .from(roster)
          .innerJoin(pokemon, eq(roster.pokemonId, pokemon.id))
          .where(eq(roster.trainerId, id))
          // Starters first, then the rest of the working roster, retired last.
          .orderBy(
            sql`case ${roster.status} when 'starter' then 0 when 'active' then 1 when 'reserve' then 2 else 3 end`,
            desc(pokemon.baseStatTotal),
          ),

        /*
         * `roster_size` counts everyone; every other figure is computed over
         * the ACTIVE roster (status <> 'retired'). Mixing the two is what made
         * "5 active" sit beside a mean that included a retired member — if you
         * add a metric here, filter it the same way and label it accordingly.
         */
        db.execute<{
          roster_size: number;
          active_count: number;
          avg_base_stat_total: number;
          max_base_stat_total: number;
          avg_level: number;
          legendary_count: number;
          distinct_types: number;
          milestone_eligible: number;
        }>(sql`
          select
            count(*)::int                                                          as roster_size,
            count(*) filter (where r.status <> 'retired')::int                     as active_count,
            coalesce(round(avg(p.base_stat_total) filter (where r.status <> 'retired'))::int, 0) as avg_base_stat_total,
            coalesce(max(p.base_stat_total) filter (where r.status <> 'retired')::int, 0)        as max_base_stat_total,
            coalesce(round(avg(r.level) filter (where r.status <> 'retired'))::int, 0)           as avg_level,
            count(*) filter (where p.is_legendary and r.status <> 'retired')::int  as legendary_count,
            (
              select count(distinct t)::int
              from ${roster} r2
              join ${pokemon} p2 on p2.id = r2.pokemon_id,
              unnest(array[p2.type1, p2.type2]) as t
              where r2.trainer_id = ${id} and r2.status <> 'retired' and t is not null
            )                                                                      as distinct_types,
            count(*) filter (
              where r.status <> 'retired'
                and not p.is_fully_evolved
                and r.level is not null
                and exists (
                  select 1 from ${pokemon} n
                  where n.evolves_from_id = r.pokemon_id
                    and n.evolution_min_level is not null
                    and r.level >= n.evolution_min_level
                )
            )::int                                                                 as milestone_eligible
          from ${roster} r
          join ${pokemon} p on p.id = r.pokemon_id
          where r.trainer_id = ${id}
        `),

        // Active roster only, matching the summary tiles.
        db.execute<{ type: string; count: number }>(sql`
          select t as type, count(*)::int as count
          from ${roster} r
          join ${pokemon} p on p.id = r.pokemon_id,
          unnest(array[p.type1, p.type2]) as t
          where r.trainer_id = ${id} and r.status <> 'retired' and t is not null
          group by t
          order by count desc, t asc
        `),

        db.execute<{ stat: string; avg: number }>(sql`
          select stat, round(avg(value))::int as avg
          from (
            select 'HP' as stat, p.hp as value from ${roster} r join ${pokemon} p on p.id = r.pokemon_id where r.trainer_id = ${id}
            union all select 'Attack', p.attack from ${roster} r join ${pokemon} p on p.id = r.pokemon_id where r.trainer_id = ${id}
            union all select 'Defense', p.defense from ${roster} r join ${pokemon} p on p.id = r.pokemon_id where r.trainer_id = ${id}
            union all select 'Sp. Atk', p.special_attack from ${roster} r join ${pokemon} p on p.id = r.pokemon_id where r.trainer_id = ${id}
            union all select 'Sp. Def', p.special_defense from ${roster} r join ${pokemon} p on p.id = r.pokemon_id where r.trainer_id = ${id}
            union all select 'Speed', p.speed from ${roster} r join ${pokemon} p on p.id = r.pokemon_id where r.trainer_id = ${id}
          ) s
          group by stat
        `),

        // Note history for the roster — every note on any Pokémon this trainer carries.
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
            nickname: roster.nickname,
          })
          .from(notes)
          .innerJoin(roster, and(eq(roster.pokemonId, notes.pokemonId), eq(roster.trainerId, id)))
          .innerJoin(pokemon, eq(notes.pokemonId, pokemon.id))
          .orderBy(desc(notes.createdAt))
          .limit(50),

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
            nickname: roster.nickname,
          })
          .from(activity)
          .innerJoin(roster, and(eq(roster.pokemonId, activity.pokemonId), eq(roster.trainerId, id)))
          .innerJoin(pokemon, eq(activity.pokemonId, pokemon.id))
          .orderBy(desc(activity.updatedAt))
          .limit(50),
      ]);

    res.json({
      trainer,
      roster: rosterRows,
      summary: summary.rows[0] ?? null,
      typeBreakdown: typeBreakdown.rows,
      statAverages: statAverages.rows,
      notes: trainerNotes,
      activity: trainerActivity,
    });
  }),
);
