import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  activity,
  moves,
  notes,
  pokemon,
  pokemonMoves,
  roster,
  rosterMoves,
  trainers,
} from '../db/schema.js';
import { asyncHandler, badRequest, notFound, paginationFor } from '../http.js';
import { POKEMON_TYPES } from '../constants.js';
import { loadTypeChart, offensiveCoverage, rosterVulnerabilities } from '../effectiveness.js';

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
 * The note and activity histories are paginated independently of each other,
 * so paging through notes doesn't reset the activity card underneath it. Both
 * used to be a bare `limit 50` with no total, which truncated a busy roster
 * silently — the card said "Note history" and showed 50 of 200 with nothing to
 * say so.
 */
const dashboardQuerySchema = z.object({
  notesPage: z.coerce.number().int().min(1).default(1),
  activityPage: z.coerce.number().int().min(1).default(1),
  historyPageSize: z.coerce.number().int().min(1).max(100).default(10),
});

/** The 18 types as a jsonb array, for the coverage gap report below. */
const ALL_TYPES_JSON = JSON.stringify(POKEMON_TYPES);

/**
 * GET /api/trainers/:id — the trainer dashboard payload.
 *
 * Bundles the roster, aggregate stats, movepool coverage, and a page of the
 * note/activity history for every Pokémon on that roster, so the page renders
 * from one round trip.
 */
trainersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const query = dashboardQuerySchema.parse(req.query);

    const [trainer] = await db.select().from(trainers).where(eq(trainers.id, id)).limit(1);
    if (!trainer) throw notFound(`No trainer with id ${id}`);

    const notesOffset = (query.notesPage - 1) * query.historyPageSize;
    const activityOffset = (query.activityPage - 1) * query.historyPageSize;

    const [
      rosterRows,
      summary,
      typeBreakdown,
      statAverages,
      trainerNotes,
      trainerActivity,
      [noteTotals],
      [activityTotals],
      moveCoverage,
      movepoolSummary,
    ] = await Promise.all([
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
              evolution_condition: string | null;
              sprite_url: string | null;
            } | null>`(
              select to_jsonb(x) from (
                select n.id, n.display_name, n.evolution_min_level, n.evolution_trigger,
                       n.evolution_condition, n.sprite_url
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
            /*
             * Movepool figures per member — "coursework taken" and "how many
             * types it can actually attack with". Both count DISTINCT moves,
             * since a move learnable by both level-up and TM is one move.
             */
            moveCount: sql<number>`(select count(distinct pm.move_id)::int from ${pokemonMoves} pm where pm.pokemon_id = ${roster}.pokemon_id)`,
            coverageCount: sql<number>`(
              select count(distinct m.type)::int
              from ${pokemonMoves} pm
              join ${moves} m on m.id = pm.move_id
              where pm.pokemon_id = ${roster}.pokemon_id and m.damage_class <> 'status'
            )`,
            /*
             * Slots filled, out of four. This is the *equipped* moveset, and
             * it is keyed on the roster entry rather than the species — two
             * trainers carrying the same Pokémon run different movesets.
             */
            movesetSize: sql<number>`(select count(*)::int from ${rosterMoves} rm where rm.roster_id = ${roster}.id)`,
            /** Attacking types those equipped moves actually reach. */
            movesetCoverage: sql<number>`(
              select count(distinct m.type)::int
              from ${rosterMoves} rm
              join ${moves} m on m.id = rm.move_id
              where rm.roster_id = ${roster}.id and m.damage_class <> 'status'
            )`,
            noteCount: sql<number>`(select count(*)::int from ${notes} n where n.pokemon_id = ${roster}.pokemon_id)`,
            /*
             * DISTINCT matters: a flag is keyed on (pokemon, owner, kind), so
             * a Pokémon reviewed by three users has three `reviewed` rows.
             * Without it this column repeats the kind, which renders duplicate
             * icons and hands React duplicate keys for the same list.
             */
            activityKinds: sql<
              string[]
            >`coalesce((select array_agg(distinct a.kind::text) from ${activity} a where a.pokemon_id = ${roster}.pokemon_id), '{}')`,
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

        /*
         * Mean of each base stat across the ACTIVE roster.
         *
         * This was six `union all` arms each repeating the join and the where
         * clause, and five of them had drifted from the sixth: none filtered
         * out retired members, so the card averaged people who had left while
         * its own subtitle said otherwise. Selecting the members once and
         * unpivoting with a lateral VALUES makes the filter unrepeatable —
         * there is now exactly one place it could be wrong.
         */
        db.execute<{ stat: string; avg: number }>(sql`
          with members as (
            select p.hp, p.attack, p.defense, p.special_attack, p.special_defense, p.speed
            from ${roster} r
            join ${pokemon} p on p.id = r.pokemon_id
            where r.trainer_id = ${id} and r.status <> 'retired'
          )
          select s.stat, round(avg(s.value))::int as avg
          from members m
          cross join lateral (values
            (1, 'HP',      m.hp),
            (2, 'Attack',  m.attack),
            (3, 'Defense', m.defense),
            (4, 'Sp. Atk', m.special_attack),
            (5, 'Sp. Def', m.special_defense),
            (6, 'Speed',   m.speed)
          ) as s(ord, stat, value)
          group by s.ord, s.stat
          order by s.ord
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
          // Tiebreaker on id: two notes written in the same second would
          // otherwise be free to swap places between pages.
          .orderBy(desc(notes.createdAt), desc(notes.id))
          .limit(query.historyPageSize)
          .offset(notesOffset),

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
          .orderBy(desc(activity.updatedAt), desc(activity.id))
          .limit(query.historyPageSize)
          .offset(activityOffset),

        // Totals for the two histories above — what "showing 10 of 63" needs.
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(notes)
          .innerJoin(roster, and(eq(roster.pokemonId, notes.pokemonId), eq(roster.trainerId, id))),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(activity)
          .innerJoin(roster, and(eq(roster.pokemonId, activity.pokemonId), eq(roster.trainerId, id))),

        /*
         * Movepool coverage — the gap report.
         *
         * The type breakdown above answers "what types is this roster made of";
         * this answers "what types can it hit", which is the advising analogue
         * that was actually missing. All 18 types are listed, including the
         * ones at zero, because the zeroes ARE the finding — a chart of only
         * what's covered can't show a hole.
         *
         * Status moves are excluded: a Grass-type status move gives no Grass
         * coverage, and counting it would report a gap as filled.
         */
        db.execute<{ type: string; members: number; moves: number }>(sql`
          with all_types as (
            select jsonb_array_elements_text(${ALL_TYPES_JSON}::jsonb) as type
          ),
          covered as (
            select
              m.type                              as type,
              count(distinct r.pokemon_id)::int   as members,
              count(distinct m.id)::int           as moves
            from ${roster} r
            join ${pokemonMoves} pm on pm.pokemon_id = r.pokemon_id
            join ${moves} m on m.id = pm.move_id
            where r.trainer_id = ${id}
              and r.status <> 'retired'
              and m.damage_class <> 'status'
            group by m.type
          )
          select
            all_types.type                        as type,
            coalesce(covered.members, 0)::int     as members,
            coalesce(covered.moves, 0)::int       as moves
          from all_types
          left join covered on covered.type = all_types.type
          order by members desc, type asc
        `),

        // Active roster only, matching every other figure on this dashboard.
        db.execute<{
          distinct_moves: number;
          avg_movepool: number;
          types_covered: number;
          thinnest_movepool: number | null;
        }>(sql`
          with member_moves as (
            select r.pokemon_id, count(distinct pm.move_id)::int as move_count
            from ${roster} r
            left join ${pokemonMoves} pm on pm.pokemon_id = r.pokemon_id
            where r.trainer_id = ${id} and r.status <> 'retired'
            group by r.pokemon_id
          )
          select
            (
              select count(distinct pm.move_id)::int
              from ${roster} r
              join ${pokemonMoves} pm on pm.pokemon_id = r.pokemon_id
              where r.trainer_id = ${id} and r.status <> 'retired'
            )                                                        as distinct_moves,
            coalesce(round(avg(move_count))::int, 0)                 as avg_movepool,
            (
              select count(distinct m.type)::int
              from ${roster} r
              join ${pokemonMoves} pm on pm.pokemon_id = r.pokemon_id
              join ${moves} m on m.id = pm.move_id
              where r.trainer_id = ${id} and r.status <> 'retired' and m.damage_class <> 'status'
            )                                                        as types_covered,
            min(move_count)::int                                     as thinnest_movepool
          from member_moves
        `),
      ]);

    res.json({
      trainer,
      roster: rosterRows,
      summary: summary.rows[0] ?? null,
      typeBreakdown: typeBreakdown.rows,
      statAverages: statAverages.rows,
      moveCoverage: moveCoverage.rows,
      movepool: movepoolSummary.rows[0] ?? null,
      notes: trainerNotes,
      activity: trainerActivity,
      notesPagination: paginationFor(query.notesPage, query.historyPageSize, noteTotals?.count ?? 0),
      activityPagination: paginationFor(
        query.activityPage,
        query.historyPageSize,
        activityTotals?.count ?? 0,
      ),
    });
  }),
);

/**
 * A member of the active roster with its **equipped** move types — the input to
 * every figure on the analysis endpoint below.
 *
 * The left join to `roster_moves` is deliberate: a member with no moveset must
 * still appear, contributing its defensive typing and counting against
 * readiness. Inner-joining would quietly drop exactly the members the readiness
 * report exists to find.
 */
interface AnalysisRow {
  rosterId: number;
  displayName: string;
  nickname: string | null;
  type1: string;
  type2: string | null;
  movesetSize: number;
  equippedMoveTypes: string[];
}

/**
 * GET /api/trainers/:id/analysis — how good is this team, actually.
 *
 * Separate from the dashboard payload above, which already runs 15+ queries and
 * returns 11 keys. Both the trainer dashboard and the team page read this.
 *
 * Everything here is scoped to the **active roster** (`status <> 'retired'`),
 * matching every other aggregate on the trainer dashboard.
 */
trainersRouter.get(
  '/:id/analysis',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);

    const [trainer] = await db
      .select({ id: trainers.id, name: trainers.name })
      .from(trainers)
      .where(eq(trainers.id, id))
      .limit(1);
    if (!trainer) throw notFound(`No trainer with id ${id}`);

    const rows = await db.execute(sql`
      select
        r.id                                             as "rosterId",
        p.display_name                                   as "displayName",
        r.nickname                                       as "nickname",
        p.type1                                          as "type1",
        p.type2                                          as "type2",
        count(rm.id)::int                                as "movesetSize",
        -- Damaging moves only: a Grass-type status move gives no Grass
        -- coverage. A filter clause yields null when nothing matches, so the
        -- coalesce turns "no equipped moves" into an empty array, not a null.
        coalesce(
          array_agg(distinct m.type) filter (where m.damage_class <> 'status'),
          '{}'
        )                                                as "equippedMoveTypes"
      from ${roster} r
      join ${pokemon} p on p.id = r.pokemon_id
      left join ${rosterMoves} rm on rm.roster_id = r.id
      left join ${moves} m on m.id = rm.move_id
      where r.trainer_id = ${id} and r.status <> 'retired'
      group by r.id, p.display_name, r.nickname, p.type1, p.type2
      order by p.display_name
    `);

    const members = rows.rows as unknown as AnalysisRow[];
    const chart = await loadTypeChart();

    const offense = offensiveCoverage(chart, members);
    const defense = rosterVulnerabilities(chart, members);

    // A gap is a type nothing on the team hits for extra damage. The team can
    // still attack it — it just never gets the advantage.
    const gaps = offense.filter((entry) => entry.bestMultiplier <= 100).map((entry) => entry.type);

    // A threat hits more than one member hard AND has no super-effective
    // answer. Either alone is survivable; together is what loses a match, and
    // it is the one thing this whole endpoint exists to surface.
    const gapSet = new Set(gaps);
    const threats = defense
      .filter((entry) => entry.weakCount >= 2 && gapSet.has(entry.type))
      .sort((a, b) => b.weakCount - a.weakCount || a.type.localeCompare(b.type));

    res.json({
      trainer,
      offense,
      defense,
      gaps,
      threats,
      readiness: {
        activeMembers: members.length,
        /** Slots filled across the roster, out of four per member. */
        withFullMoveset: members.filter((m) => m.movesetSize === 4).length,
        withPartialMoveset: members.filter((m) => m.movesetSize > 0 && m.movesetSize < 4).length,
        withoutMoveset: members.filter((m) => m.movesetSize === 0).length,
        members: members.map((m) => ({
          rosterId: m.rosterId,
          displayName: m.displayName,
          nickname: m.nickname,
          movesetSize: m.movesetSize,
        })),
      },
    });
  }),
);
