import { Router } from 'express';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { activity, notes, pokemon } from '../db/schema.js';
import { asyncHandler } from '../http.js';

export const statsRouter = Router();

/**
 * GET /api/stats/dashboard — every aggregation the Performance Dashboard needs,
 * in one round trip.
 *
 * These are raw `sql` templates because the aggregations (width_bucket,
 * correlation, unnest) go past what the query builder expresses cleanly. Every
 * interpolated value is still a bound parameter — Drizzle's sql`` tag
 * parameterises `${}` holes rather than concatenating them.
 */
statsRouter.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const { bucketSize } = z
      .object({ bucketSize: z.coerce.number().int().min(10).max(200).default(50) })
      .parse(req.query);

    const [summary, typeBreakdown, generationBreakdown, statDistribution, statAverages, topPokemon, scatter, crm] =
      await Promise.all([
        db.execute<{
          total: number;
          legendary: number;
          mythical: number;
          avg_base_stat_total: number;
          max_base_stat_total: number;
          min_base_stat_total: number;
          median_base_stat_total: number;
        }>(sql`
          select
            count(*)::int                                                        as total,
            count(*) filter (where is_legendary)::int                            as legendary,
            count(*) filter (where is_mythical)::int                             as mythical,
            round(avg(base_stat_total))::int                                     as avg_base_stat_total,
            max(base_stat_total)::int                                            as max_base_stat_total,
            min(base_stat_total)::int                                            as min_base_stat_total,
            percentile_cont(0.5) within group (order by base_stat_total)::int    as median_base_stat_total
          from ${pokemon}
        `),

        // Counts both primary and secondary typings, so a Charizard shows up
        // under fire and flying alike.
        db.execute<{ type: string; count: number; avg_base_stat_total: number; avg_attack: number; avg_defense: number; avg_speed: number }>(sql`
          select
            t                                  as type,
            count(*)::int                      as count,
            round(avg(base_stat_total))::int   as avg_base_stat_total,
            round(avg(attack))::int            as avg_attack,
            round(avg(defense))::int           as avg_defense,
            round(avg(speed))::int             as avg_speed
          from ${pokemon}, unnest(array[type1, type2]) as t
          where t is not null
          group by t
          order by count desc, t asc
        `),

        db.execute<{ generation: number; count: number; avg_base_stat_total: number; legendary: number }>(sql`
          select
            generation::int                    as generation,
            count(*)::int                      as count,
            round(avg(base_stat_total))::int   as avg_base_stat_total,
            count(*) filter (where is_legendary)::int as legendary
          from ${pokemon}
          group by generation
          order by generation
        `),

        // Histogram of base stat totals. width_bucket needs a fixed range, so
        // the floor/ceiling come from the data itself.
        db.execute<{ bucket_start: number; bucket_end: number; count: number }>(sql`
          with bounds as (
            select
              (floor(min(base_stat_total)::numeric / ${bucketSize}) * ${bucketSize})::int as lo,
              (ceil(max(base_stat_total)::numeric / ${bucketSize}) * ${bucketSize})::int  as hi
            from ${pokemon}
          )
          select
            (bounds.lo + (bucket - 1) * ${bucketSize})::int as bucket_start,
            (bounds.lo + bucket * ${bucketSize})::int       as bucket_end,
            count(*)::int                                   as count
          from ${pokemon}, bounds,
            lateral width_bucket(
              base_stat_total,
              bounds.lo,
              bounds.hi,
              greatest(1, ((bounds.hi - bounds.lo) / ${bucketSize})::int)
            ) as bucket
          group by bounds.lo, bucket
          order by bucket
        `),

        db.execute<{ stat: string; avg: number; min: number; max: number; median: number; p90: number }>(sql`
          select stat, round(avg(value))::int as avg, min(value)::int as min, max(value)::int as max,
                 percentile_cont(0.5) within group (order by value)::int as median,
                 percentile_cont(0.9) within group (order by value)::int as p90
          from (
            select 'HP' as stat, hp as value from ${pokemon}
            union all select 'Attack', attack from ${pokemon}
            union all select 'Defense', defense from ${pokemon}
            union all select 'Sp. Atk', special_attack from ${pokemon}
            union all select 'Sp. Def', special_defense from ${pokemon}
            union all select 'Speed', speed from ${pokemon}
          ) s
          group by stat
          order by avg desc
        `),

        db
          .select({
            id: pokemon.id,
            displayName: pokemon.displayName,
            type1: pokemon.type1,
            type2: pokemon.type2,
            baseStatTotal: pokemon.baseStatTotal,
            spriteUrl: pokemon.spriteUrl,
          })
          .from(pokemon)
          .orderBy(sql`${pokemon.baseStatTotal} desc`, sql`${pokemon.id} asc`)
          .limit(10),

        // Attack vs. Speed scatter. Sampled deterministically so the chart is
        // readable and stable across reloads.
        db.execute<{ id: number; display_name: string; attack: number; speed: number; type1: string; base_stat_total: number }>(sql`
          select id, display_name, attack, speed, type1, base_stat_total
          from ${pokemon}
          where id % 2 = 1
          order by id
        `),

        db.execute<{ note_count: number; pokemon_with_notes: number; activity_counts: Record<string, number> }>(sql`
          select
            (select count(*)::int from ${notes})                          as note_count,
            (select count(distinct ${notes.pokemonId})::int from ${notes}) as pokemon_with_notes,
            coalesce(
              (select jsonb_object_agg(kind, c)
                 from (select kind::text as kind, count(*)::int as c from ${activity} group by kind) k),
              '{}'::jsonb
            ) as activity_counts
        `),
      ]);

    res.json({
      summary: summary.rows[0] ?? null,
      typeBreakdown: typeBreakdown.rows,
      generationBreakdown: generationBreakdown.rows,
      statDistribution: statDistribution.rows,
      statAverages: statAverages.rows,
      topPokemon,
      scatter: scatter.rows,
      crm: crm.rows[0] ?? null,
    });
  }),
);
