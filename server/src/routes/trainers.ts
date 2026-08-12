import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client.js';
import { activity, notes, pokemon, roster, trainers } from '../db/schema.js';
import { asyncHandler, notFound } from '../http.js';

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

        db.execute<{
          roster_size: number;
          active_count: number;
          avg_base_stat_total: number;
          max_base_stat_total: number;
          avg_level: number;
          legendary_count: number;
          distinct_types: number;
        }>(sql`
          select
            count(*)::int                                          as roster_size,
            count(*) filter (where r.status <> 'retired')::int      as active_count,
            coalesce(round(avg(p.base_stat_total))::int, 0)         as avg_base_stat_total,
            coalesce(max(p.base_stat_total)::int, 0)                as max_base_stat_total,
            coalesce(round(avg(r.level))::int, 0)                   as avg_level,
            count(*) filter (where p.is_legendary)::int             as legendary_count,
            (
              select count(distinct t)::int
              from ${roster} r2
              join ${pokemon} p2 on p2.id = r2.pokemon_id,
              unnest(array[p2.type1, p2.type2]) as t
              where r2.trainer_id = ${id} and t is not null
            )                                                       as distinct_types
          from ${roster} r
          join ${pokemon} p on p.id = r.pokemon_id
          where r.trainer_id = ${id}
        `),

        db.execute<{ type: string; count: number }>(sql`
          select t as type, count(*)::int as count
          from ${roster} r
          join ${pokemon} p on p.id = r.pokemon_id,
          unnest(array[p.type1, p.type2]) as t
          where r.trainer_id = ${id} and t is not null
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
