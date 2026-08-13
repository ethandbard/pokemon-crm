import { Router } from 'express';
import { z } from 'zod';
import { and, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client.js';
import { activity, moves, notes, pokemon, pokemonMoves } from '../db/schema.js';
import { asyncHandler } from '../http.js';
import { POKEMON_TYPES, REGIONS, REGION_POKEDEXES } from '../constants.js';

export const statsRouter = Router();

/**
 * Dashboard filters. The same vocabulary as `GET /api/pokemon`, deliberately:
 * "filter the table, then see the charts for exactly that set" only works if
 * both endpoints mean the same thing by `type` or `region`.
 */
const dashboardQuerySchema = z.object({
  bucketSize: z.coerce.number().int().min(10).max(200).default(50),
  type: z.enum(POKEMON_TYPES).optional(),
  generation: z.coerce.number().int().min(1).max(9).optional(),
  legendary: z.enum(['true', 'false']).optional(),
  mythical: z.enum(['true', 'false']).optional(),
  region: z.enum(REGIONS).optional(),
  habitat: z.string().trim().max(40).optional(),
  eggGroup: z.string().trim().max(40).optional(),
  growthRate: z.string().trim().max(40).optional(),
  minBaseStatTotal: z.coerce.number().int().min(0).max(1200).optional(),
  maxBaseStatTotal: z.coerce.number().int().min(0).max(1200).optional(),
});

type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

/** The 18 types as a jsonb array, for the coverage report's zero rows. */
const ALL_TYPES_JSON = JSON.stringify(POKEMON_TYPES);

function scopeFilters(query: DashboardQuery): SQL[] {
  const filters: SQL[] = [];

  if (query.type) {
    filters.push(sql`(${pokemon.type1} = ${query.type} or ${pokemon.type2} = ${query.type})`);
  }
  if (query.generation !== undefined) filters.push(eq(pokemon.generation, query.generation));
  if (query.legendary) filters.push(eq(pokemon.isLegendary, query.legendary === 'true'));
  if (query.mythical) filters.push(eq(pokemon.isMythical, query.mythical === 'true'));
  if (query.habitat) filters.push(eq(pokemon.habitat, query.habitat));
  if (query.growthRate) filters.push(eq(pokemon.growthRate, query.growthRate));
  if (query.eggGroup) filters.push(sql`${query.eggGroup} = any(${pokemon.eggGroups})`);
  if (query.minBaseStatTotal !== undefined) {
    filters.push(sql`${pokemon.baseStatTotal} >= ${query.minBaseStatTotal}`);
  }
  if (query.maxBaseStatTotal !== undefined) {
    filters.push(sql`${pokemon.baseStatTotal} <= ${query.maxBaseStatTotal}`);
  }
  if (query.region) {
    // One scalar parameter, unpacked by Postgres — interpolating a JS array
    // here produces a record and `?|` rejects it. See CLAUDE.md § conventions.
    const slugs = JSON.stringify(REGION_POKEDEXES[query.region]);
    filters.push(
      sql`${pokemon.regionalDexNumbers} ?| array(select jsonb_array_elements_text(${slugs}::jsonb))`,
    );
  }

  return filters;
}

/**
 * GET /api/stats/dashboard — every aggregation the Performance Dashboard needs,
 * in one round trip.
 *
 * **Every query below reads `${scope}`, never `pokemon` directly.** `scope` is
 * the filtered subset as a subquery aliased back to `pokemon`, so adding a
 * filter scopes all fourteen aggregations at once and none can silently keep
 * covering the whole dex. If you add an aggregation here, select from `${scope}`
 * — a chart that ignores the filters is worse than no chart, because it looks
 * like an answer to the question the filter bar asked.
 *
 * These are raw `sql` templates because the aggregations (width_bucket,
 * percentiles, unnest) go past what the query builder expresses cleanly. Every
 * interpolated value is still a bound parameter — Drizzle's sql`` tag
 * parameterises `${}` holes rather than concatenating them.
 */
statsRouter.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const query = dashboardQuerySchema.parse(req.query);
    const { bucketSize } = query;

    const filters = scopeFilters(query);
    const where = filters.length ? and(...filters) : undefined;

    /*
     * The alias is literally `pokemon`, so correlated references written as
     * `${pokemon}.id` still resolve — and an unfiltered request produces
     * `(select * from "pokemon" where true) pokemon`, which Postgres plans the
     * same as the bare table.
     */
    const scope = sql`(select * from ${pokemon} where ${where ?? sql`true`}) pokemon`;

    const [
      summary,
      typeBreakdown,
      generationBreakdown,
      statDistribution,
      statAverages,
      topPokemon,
      scatter,
      crm,
      habitatBreakdown,
      eggGroupBreakdown,
      evYieldBreakdown,
      moveCoverage,
      moveClassBreakdown,
      movepoolStats,
      topMoves,
    ] = await Promise.all([
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
            coalesce(round(avg(base_stat_total))::int, 0)                        as avg_base_stat_total,
            coalesce(max(base_stat_total)::int, 0)                               as max_base_stat_total,
            coalesce(min(base_stat_total)::int, 0)                               as min_base_stat_total,
            coalesce(percentile_cont(0.5) within group (order by base_stat_total)::int, 0) as median_base_stat_total
          from ${scope}
        `),

      // Counts both primary and secondary typings, so a Charizard shows up
      // under fire and flying alike.
      db.execute<{
        type: string;
        count: number;
        avg_base_stat_total: number;
        avg_attack: number;
        avg_defense: number;
        avg_speed: number;
      }>(sql`
          select
            t                                  as type,
            count(*)::int                      as count,
            round(avg(base_stat_total))::int   as avg_base_stat_total,
            round(avg(attack))::int            as avg_attack,
            round(avg(defense))::int           as avg_defense,
            round(avg(speed))::int             as avg_speed
          from ${scope}, unnest(array[type1, type2]) as t
          where t is not null
          group by t
          order by count desc, t asc
        `),

      db.execute<{
        generation: number;
        count: number;
        avg_base_stat_total: number;
        legendary: number;
      }>(sql`
          select
            generation::int                    as generation,
            count(*)::int                      as count,
            round(avg(base_stat_total))::int   as avg_base_stat_total,
            count(*) filter (where is_legendary)::int as legendary
          from ${scope}
          group by generation
          order by generation
        `),

      // Histogram of base stat totals. width_bucket needs a fixed range, so
      // the floor/ceiling come from the (filtered) data itself — which is why
      // the bands shift when you filter rather than staying on dex-wide bounds.
      db.execute<{ bucket_start: number; bucket_end: number; count: number }>(sql`
          with bounds as (
            select
              (floor(min(base_stat_total)::numeric / ${bucketSize}) * ${bucketSize})::int as lo,
              (ceil(max(base_stat_total)::numeric / ${bucketSize}) * ${bucketSize})::int  as hi
            from ${scope}
          )
          select
            (bounds.lo + (bucket - 1) * ${bucketSize})::int as bucket_start,
            (bounds.lo + bucket * ${bucketSize})::int       as bucket_end,
            count(*)::int                                   as count
          from ${scope}, bounds,
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
            select 'HP' as stat, hp as value from ${scope}
            union all select 'Attack', attack from ${scope}
            union all select 'Defense', defense from ${scope}
            union all select 'Sp. Atk', special_attack from ${scope}
            union all select 'Sp. Def', special_defense from ${scope}
            union all select 'Speed', speed from ${scope}
          ) s
          group by stat
          order by avg desc
        `),

      db.execute<{
        id: number;
        display_name: string;
        type1: string;
        type2: string | null;
        base_stat_total: number;
        sprite_url: string | null;
      }>(sql`
          select id, display_name, type1, type2, base_stat_total, sprite_url
          from ${scope}
          order by base_stat_total desc, id asc
          limit 10
        `),

      /*
       * Attack vs. Speed scatter. Sampled deterministically so the chart is
       * readable and stable across reloads — but only while the scope is big
       * enough for a sample to be a sample. Under 300 species every point is
       * plotted, or filtering to one type would silently halve an already
       * small set.
       */
      db.execute<{
        id: number;
        display_name: string;
        attack: number;
        speed: number;
        type1: string;
        base_stat_total: number;
      }>(sql`
          select id, display_name, attack, speed, type1, base_stat_total
          from ${scope}
          where (select count(*) from ${scope}) <= 300 or id % 2 = 1
          order by id
        `),

      // The CRM half is scoped too: notes and flags on Pokémon in the current
      // selection, not workspace-wide, so the tiles answer the same question
      // the charts above them do.
      db.execute<{ note_count: number; pokemon_with_notes: number; activity_counts: Record<string, number> }>(sql`
          select
            (select count(*)::int from ${notes} n where exists (select 1 from ${scope} where pokemon.id = n.pokemon_id))            as note_count,
            (select count(distinct n.pokemon_id)::int from ${notes} n where exists (select 1 from ${scope} where pokemon.id = n.pokemon_id)) as pokemon_with_notes,
            coalesce(
              (select jsonb_object_agg(kind, c)
                 from (
                   select a.kind::text as kind, count(*)::int as c
                     from ${activity} a
                    where exists (select 1 from ${scope} where pokemon.id = a.pokemon_id)
                    group by a.kind
                 ) k),
              '{}'::jsonb
            ) as activity_counts
        `),

      // PokeAPI only assigns a habitat to generation 1–3 species, so this
      // deliberately covers ~380 of 1,025 rows. `unknown` is a real habitat
      // value in their data; a null habitat means "not classified at all"
      // and is excluded rather than bucketed with it.
      db.execute<{ habitat: string; count: number; avg_base_stat_total: number }>(sql`
          select
            habitat                            as habitat,
            count(*)::int                      as count,
            round(avg(base_stat_total))::int   as avg_base_stat_total
          from ${scope}
          where habitat is not null
          group by habitat
          order by count desc, habitat asc
        `),

      // Egg groups are an array, so a species in two groups counts in both —
      // the same double-counting the type breakdown does, for the same reason.
      db.execute<{ egg_group: string; count: number; avg_base_stat_total: number }>(sql`
          select
            g                                  as egg_group,
            count(*)::int                      as count,
            round(avg(base_stat_total))::int   as avg_base_stat_total
          from ${scope}, unnest(egg_groups) as g
          group by g
          order by count desc, g asc
        `),

      // How many species train each EV. A species can yield more than one
      // stat, so these columns are counted independently rather than grouped.
      db.execute<{ stat: string; count: number; avg_yield: number }>(sql`
          select stat, count(*)::int as count, round(avg(value), 2)::float8 as avg_yield
          from (
            select 'HP' as stat, ev_hp as value from ${scope}
            union all select 'Attack', ev_attack from ${scope}
            union all select 'Defense', ev_defense from ${scope}
            union all select 'Sp. Atk', ev_special_attack from ${scope}
            union all select 'Sp. Def', ev_special_defense from ${scope}
            union all select 'Speed', ev_speed from ${scope}
          ) s
          where value > 0
          group by stat
          order by count desc
        `),

      /*
       * Movepool coverage across the scope: for each of the 18 types, how many
       * species can attack with it and how many distinct moves are available.
       *
       * All 18 rows are returned, zeroes included — with a filter applied the
       * zeroes are the finding ("nothing in this selection hits for Ice"), and
       * a chart of only what's covered cannot show a hole. Status moves are
       * excluded: a Grass-type status move gives no Grass coverage.
       */
      db.execute<{ type: string; species: number; moves: number }>(sql`
          with all_types as (
            select jsonb_array_elements_text(${ALL_TYPES_JSON}::jsonb) as type
          ),
          covered as (
            select
              m.type                               as type,
              count(distinct pokemon.id)::int      as species,
              count(distinct m.id)::int            as moves
            from ${scope}
            join ${pokemonMoves} pm on pm.pokemon_id = pokemon.id
            join ${moves} m on m.id = pm.move_id
            where m.damage_class <> 'status'
            group by m.type
          )
          select
            all_types.type                     as type,
            coalesce(covered.species, 0)::int  as species,
            coalesce(covered.moves, 0)::int    as moves
          from all_types
          left join covered on covered.type = all_types.type
          order by species desc, type asc
        `),

      // Physical / special / status split of the moves this selection can
      // learn, with the mean power of each (status moves have none).
      db.execute<{ damage_class: string; moves: number; avg_power: number | null }>(sql`
          select
            m.damage_class::text               as damage_class,
            count(distinct m.id)::int          as moves,
            -- power > 0, not "is not null": PokeAPI reports 0 for status moves
            -- and for fixed-damage ones (Seismic Toss), and averaging those in
            -- drags the mean toward a meaningless zero.
            round(avg(m.power) filter (where m.power > 0))::int as avg_power
          from ${scope}
          join ${pokemonMoves} pm on pm.pokemon_id = pokemon.id
          join ${moves} m on m.id = pm.move_id
          group by m.damage_class
          order by moves desc
        `),

      // Movepool size per species — "how much coursework does a record carry".
      db.execute<{
        distinct_moves: number;
        avg_movepool: number;
        median_movepool: number;
        max_movepool: number;
        min_movepool: number;
        level_up_rows: number;
        machine_rows: number;
        egg_rows: number;
        tutor_rows: number;
      }>(sql`
          with per_species as (
            select pokemon.id as id, count(distinct pm.move_id)::int as move_count
            from ${scope}
            left join ${pokemonMoves} pm on pm.pokemon_id = pokemon.id
            group by pokemon.id
          )
          select
            (
              select count(distinct pm.move_id)::int
              from ${scope} join ${pokemonMoves} pm on pm.pokemon_id = pokemon.id
            )                                                                 as distinct_moves,
            coalesce(round(avg(move_count))::int, 0)                           as avg_movepool,
            coalesce(percentile_cont(0.5) within group (order by move_count)::int, 0) as median_movepool,
            coalesce(max(move_count), 0)                                       as max_movepool,
            coalesce(min(move_count), 0)                                       as min_movepool,
            (select count(*)::int from ${scope} join ${pokemonMoves} pm on pm.pokemon_id = pokemon.id where pm.learn_method = 'level-up') as level_up_rows,
            (select count(*)::int from ${scope} join ${pokemonMoves} pm on pm.pokemon_id = pokemon.id where pm.learn_method = 'machine')  as machine_rows,
            (select count(*)::int from ${scope} join ${pokemonMoves} pm on pm.pokemon_id = pokemon.id where pm.learn_method = 'egg')      as egg_rows,
            (select count(*)::int from ${scope} join ${pokemonMoves} pm on pm.pokemon_id = pokemon.id where pm.learn_method = 'tutor')    as tutor_rows
          from per_species
        `),

      /*
       * The most widely learned moves *within the scope*. `learners` is counted
       * against the filtered set rather than read off `moves.learned_by_count`,
       * which is a dex-wide figure — using the denormalised column here would
       * make the one chart on this page that ignores the filter bar.
       */
      db.execute<{
        id: number;
        display_name: string;
        type: string;
        damage_class: string;
        power: number | null;
        learners: number;
      }>(sql`
          select
            m.id                            as id,
            m.display_name                  as display_name,
            m.type                          as type,
            m.damage_class::text            as damage_class,
            m.power                         as power,
            count(distinct pokemon.id)::int as learners
          from ${scope}
          join ${pokemonMoves} pm on pm.pokemon_id = pokemon.id
          join ${moves} m on m.id = pm.move_id
          group by m.id, m.display_name, m.type, m.damage_class, m.power
          order by learners desc, m.display_name asc
          limit 12
        `),
    ]);

    // Denominator for "231 of 1,025 species" — the unfiltered count, so the UI
    // can say how much of the dataset the charts above actually cover.
    const [datasetTotal] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(pokemon);

    res.json({
      summary: summary.rows[0] ?? null,
      typeBreakdown: typeBreakdown.rows,
      generationBreakdown: generationBreakdown.rows,
      statDistribution: statDistribution.rows,
      statAverages: statAverages.rows,
      // Kept camelCase for the client, which had this shape before the filters
      // landed — this row set is the one the query builder used to return.
      topPokemon: topPokemon.rows.map((row) => ({
        id: row.id,
        displayName: row.display_name,
        type1: row.type1,
        type2: row.type2,
        baseStatTotal: row.base_stat_total,
        spriteUrl: row.sprite_url,
      })),
      scatter: scatter.rows,
      crm: crm.rows[0] ?? null,
      habitatBreakdown: habitatBreakdown.rows,
      eggGroupBreakdown: eggGroupBreakdown.rows,
      evYieldBreakdown: evYieldBreakdown.rows,
      moveCoverage: moveCoverage.rows,
      moveClassBreakdown: moveClassBreakdown.rows,
      movepool: movepoolStats.rows[0] ?? null,
      topMoves: topMoves.rows,
      scope: {
        filtered: summary.rows[0]?.total ?? 0,
        total: datasetTotal?.count ?? 0,
        /** Whether the numbers above cover the whole dataset or a slice of it. */
        isFiltered: filters.length > 0,
        /** Echoed back so a saved/linked dashboard URL is self-describing. */
        filters: {
          type: query.type ?? null,
          generation: query.generation ?? null,
          legendary: query.legendary ?? null,
          mythical: query.mythical ?? null,
          region: query.region ?? null,
          habitat: query.habitat ?? null,
          eggGroup: query.eggGroup ?? null,
          growthRate: query.growthRate ?? null,
          minBaseStatTotal: query.minBaseStatTotal ?? null,
          maxBaseStatTotal: query.maxBaseStatTotal ?? null,
        },
      },
    });
  }),
);
