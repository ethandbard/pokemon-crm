import { Router } from 'express';
import { z } from 'zod';
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  abilities,
  activity,
  moveMachines,
  moves,
  notes,
  pokemon,
  pokemonMoves,
  roster,
  trainers,
} from '../db/schema.js';
import { asyncHandler, badRequest, notFound, paginationFor } from '../http.js';
import { POKEMON_TYPES, REGIONS, REGION_POKEDEXES, titleCase } from '../constants.js';
import { defensiveProfile, loadTypeChart } from '../effectiveness.js';
import { scopeSchema, trainerScope } from '../owner.js';

export const pokemonRouter = Router();

/** Columns the lookup table is allowed to sort by, mapped to real columns. */
const SORTABLE = {
  id: pokemon.id,
  name: pokemon.displayName,
  generation: pokemon.generation,
  type1: pokemon.type1,
  hp: pokemon.hp,
  attack: pokemon.attack,
  defense: pokemon.defense,
  specialAttack: pokemon.specialAttack,
  specialDefense: pokemon.specialDefense,
  speed: pokemon.speed,
  baseStatTotal: pokemon.baseStatTotal,
  height: pokemon.height,
  weight: pokemon.weight,
  evYieldTotal: pokemon.evYieldTotal,
  captureRate: pokemon.captureRate,
  baseHappiness: pokemon.baseHappiness,
} as const;

const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  type: z.enum(POKEMON_TYPES).optional(),
  generation: z.coerce.number().int().min(1).max(9).optional(),
  legendary: z.enum(['true', 'false']).optional(),
  /** Filter to Pokémon carrying a given status flag. */
  activity: z.enum(activity.kind.enumValues).optional(),
  /** Filter to Pokémon on a given trainer's roster. */
  trainerId: z.coerce.number().int().min(1).optional(),
  // Species dimensions from the species endpoint. `habitat` is only populated
  // for generations 1–3 — PokeAPI has no habitat for anything later — so
  // filtering on it legitimately excludes most of the dex.
  habitat: z.string().trim().max(40).optional(),
  shape: z.string().trim().max(40).optional(),
  eggGroup: z.string().trim().max(40).optional(),
  growthRate: z.string().trim().max(40).optional(),
  /** Appears in any of this region's pokédexes. */
  region: z.enum(REGIONS).optional(),
  /**
   * Only species that can learn this move. Takes a move id rather than a name
   * because the Moves page links here directly ("open the learners in Lookup"),
   * and an id needs no resolution step.
   */
  moveId: z.coerce.number().int().min(1).optional(),
  /** Narrows `moveId` to one route in — level-up only, TM only, egg only. */
  learnMethod: z.string().trim().max(40).optional(),
  /** Can hit with at least one damaging move of this type. */
  moveType: z.enum(POKEMON_TYPES).optional(),
  baby: z.enum(['true', 'false']).optional(),
  /** Trains at least one EV in this stat — the "what does this teach" filter. */
  evYield: z
    .enum(['hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed'])
    .optional(),
  minBaseStatTotal: z.coerce.number().int().min(0).max(1200).optional(),
  maxBaseStatTotal: z.coerce.number().int().min(0).max(1200).optional(),
  sort: z.enum(Object.keys(SORTABLE) as [keyof typeof SORTABLE]).default('id'),
  direction: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});

/**
 * GET /api/pokemon — searchable, filterable, sortable, paginated list.
 *
 * Every value below is bound as a parameter by Drizzle; the only interpolated
 * things are column references chosen from the SORTABLE allow-list.
 */
pokemonRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = listQuerySchema.parse(req.query);

    const filters: SQL[] = [];

    if (query.search) {
      const pattern = `%${query.search}%`;
      const searchClause = or(ilike(pokemon.displayName, pattern), ilike(pokemon.name, pattern));
      if (searchClause) filters.push(searchClause);
    }

    if (query.type) {
      const typeClause = or(eq(pokemon.type1, query.type), eq(pokemon.type2, query.type));
      if (typeClause) filters.push(typeClause);
    }

    if (query.generation !== undefined) filters.push(eq(pokemon.generation, query.generation));
    if (query.legendary) filters.push(eq(pokemon.isLegendary, query.legendary === 'true'));
    if (query.minBaseStatTotal !== undefined) {
      filters.push(sql`${pokemon.baseStatTotal} >= ${query.minBaseStatTotal}`);
    }
    if (query.maxBaseStatTotal !== undefined) {
      filters.push(sql`${pokemon.baseStatTotal} <= ${query.maxBaseStatTotal}`);
    }
    if (query.activity) {
      filters.push(
        sql`exists (select 1 from ${activity} a where a.pokemon_id = ${pokemon}.id and a.kind = ${query.activity})`,
      );
    }
    if (query.trainerId !== undefined) {
      filters.push(
        sql`exists (select 1 from ${roster} r where r.pokemon_id = ${pokemon}.id and r.trainer_id = ${query.trainerId})`,
      );
    }

    /*
     * Movepool filters. All three are `exists` against the join table with the
     * outer reference qualified as `${pokemon}.id` — `pokemon_moves` carries
     * its own `id`, so the bare form would compare the subquery to itself.
     *
     * `learnMethod` narrows `moveId` rather than standing alone: "learns
     * anything by TM" matches almost the whole dex and isn't a question worth
     * asking, while "learns Surf by TM" is.
     */
    if (query.moveId !== undefined) {
      const method = query.learnMethod
        ? sql` and pm.learn_method = ${query.learnMethod}`
        : sql``;
      filters.push(
        sql`exists (select 1 from ${pokemonMoves} pm where pm.pokemon_id = ${pokemon}.id and pm.move_id = ${query.moveId}${method})`,
      );
    }
    if (query.moveType) {
      // Damaging moves only: a status move of a type doesn't let anything hit
      // with that type, so counting it would overstate coverage.
      filters.push(sql`exists (
        select 1 from ${pokemonMoves} pm
        join ${moves} m on m.id = pm.move_id
        where pm.pokemon_id = ${pokemon}.id and m.type = ${query.moveType} and m.damage_class <> 'status'
      )`);
    }

    if (query.habitat) filters.push(eq(pokemon.habitat, query.habitat));
    if (query.shape) filters.push(eq(pokemon.shape, query.shape));
    if (query.growthRate) filters.push(eq(pokemon.growthRate, query.growthRate));
    if (query.baby) filters.push(eq(pokemon.isBaby, query.baby === 'true'));
    if (query.eggGroup) {
      filters.push(sql`${query.eggGroup} = any(${pokemon.eggGroups})`);
    }
    if (query.evYield) {
      // The stat is chosen from the Zod enum above, never from raw input, so
      // this stays an allow-list lookup rather than an interpolated column name.
      const EV_COLUMNS = {
        hp: pokemon.evHp,
        attack: pokemon.evAttack,
        defense: pokemon.evDefense,
        specialAttack: pokemon.evSpecialAttack,
        specialDefense: pokemon.evSpecialDefense,
        speed: pokemon.evSpeed,
      } as const;
      filters.push(sql`${EV_COLUMNS[query.evYield]} > 0`);
    }
    if (query.region) {
      /*
       * `?|` asks "does this jsonb object have any of these keys" — a region
       * spans several pokédexes (Kalos has three), so membership in any one of
       * them counts.
       *
       * The slugs go over as a single JSON string and are unpacked in SQL.
       * Interpolating a JS array directly does NOT work: Drizzle expands it to
       * a record tuple `($1, $2)`, and `?|` then fails with "cannot cast type
       * record to text[]". One scalar parameter sidesteps that entirely.
       */
      const slugs = JSON.stringify(REGION_POKEDEXES[query.region]);
      filters.push(
        sql`${pokemon.regionalDexNumbers} ?| array(select jsonb_array_elements_text(${slugs}::jsonb))`,
      );
    }

    const where = filters.length ? and(...filters) : undefined;
    const orderColumn = SORTABLE[query.sort];
    const orderBy = query.direction === 'desc' ? desc(orderColumn) : asc(orderColumn);

    const offset = (query.page - 1) * query.pageSize;

    const [rows, [totals]] = await Promise.all([
      db
        .select({
          id: pokemon.id,
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
          height: pokemon.height,
          weight: pokemon.weight,
          isLegendary: pokemon.isLegendary,
          isMythical: pokemon.isMythical,
          spriteUrl: pokemon.spriteUrl,
          /*
           * Correlated subqueries must alias their own tables and qualify the
           * OUTER reference as `${pokemon}.id`. Drizzle renders `${pokemon.id}`
           * as a bare `"id"`, which Postgres resolves against the innermost
           * scope — so an unqualified form silently compares the subquery's own
           * id column instead of the outer row's.
           */
          noteCount: sql<number>`(select count(*)::int from ${notes} n where n.pokemon_id = ${pokemon}.id)`,
          /** Distinct moves, not join rows — a move learnable two ways counts once. */
          moveCount: sql<number>`(select count(distinct pm.move_id)::int from ${pokemonMoves} pm where pm.pokemon_id = ${pokemon}.id)`,
          /**
           * Which flags exist on this Pokémon at all, across every user —
           * `distinct` because two people reviewing the same Pokémon is two
           * rows but one badge.
           */
          activityKinds: sql<
            string[]
          >`coalesce((select array_agg(distinct a.kind::text order by a.kind::text) from ${activity} a where a.pokemon_id = ${pokemon}.id), '{}')`,
          trainerNames: sql<
            string[]
          >`coalesce((select array_agg(t.name order by t.name) from ${roster} r join ${trainers} t on t.id = r.trainer_id where r.pokemon_id = ${pokemon}.id), '{}')`,
        })
        .from(pokemon)
        .where(where)
        // Secondary sort on id keeps pagination stable when the primary key ties.
        .orderBy(orderBy, asc(pokemon.id))
        .limit(query.pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(pokemon).where(where),
    ]);

    res.json({
      data: rows,
      pagination: paginationFor(query.page, query.pageSize, totals?.count ?? 0),
    });
  }),
);

/** GET /api/pokemon/filters — distinct values used to populate filter dropdowns. */
pokemonRouter.get(
  '/filters',
  asyncHandler(async (req, res) => {
    const { scope } = z.object({ scope: scopeSchema }).parse(req.query);

    const [
      types,
      generations,
      trainerOptions,
      habitats,
      shapes,
      eggGroups,
      growthRates,
      learnMethods,
    ] = await Promise.all([
        db.execute<{ type: string }>(
          sql`select distinct t as type
            from ${pokemon}, unnest(array[${pokemon.type1}, ${pokemon.type2}]) as t
            where t is not null
            order by t`,
        ),
        db
          .selectDistinct({ generation: pokemon.generation })
          .from(pokemon)
          .orderBy(asc(pokemon.generation)),
        db
          .select({ id: trainers.id, name: trainers.name })
          .from(trainers)
          // Lookup's trainer filter is a roster surface, so it scopes.
          .where(trainerScope(req, scope))
          .orderBy(asc(trainers.name)),
        db.execute<{ value: string }>(
          sql`select distinct habitat as value from ${pokemon} where habitat is not null order by 1`,
        ),
        db.execute<{ value: string }>(
          sql`select distinct shape as value from ${pokemon} where shape is not null order by 1`,
        ),
        db.execute<{ value: string }>(
          sql`select distinct g as value from ${pokemon}, unnest(egg_groups) as g order by 1`,
        ),
        db.execute<{ value: string }>(
          sql`select distinct growth_rate as value from ${pokemon} where growth_rate is not null order by 1`,
        ),
        // Commonest first, so `level-up` and `machine` lead and the one-game
        // oddities (`zygarde-cube`, `light-ball-egg`) trail.
        db.execute<{ value: string; count: number }>(
          sql`select learn_method as value, count(*)::int as count
                from ${pokemonMoves}
               group by learn_method
               order by count desc, value asc`,
        ),
      ]);

    res.json({
      types: types.rows.map((r) => r.type),
      generations: generations.map((r) => r.generation),
      activityKinds: activity.kind.enumValues,
      trainers: trainerOptions,
      habitats: habitats.rows.map((r) => r.value),
      shapes: shapes.rows.map((r) => r.value),
      eggGroups: eggGroups.rows.map((r) => r.value),
      growthRates: growthRates.rows.map((r) => r.value),
      learnMethods: learnMethods.rows,
      // Static: driven by REGION_POKEDEXES, not by what happens to be seeded.
      regions: REGIONS,
    });
  }),
);

const idParamSchema = z.object({ id: z.coerce.number().int().min(1) });

/** GET /api/pokemon/:id — full profile, plus its notes and activity flags. */
pokemonRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = idParamSchema.parse(req.params);

    const [record] = await db.select().from(pokemon).where(eq(pokemon.id, id)).limit(1);
    if (!record) throw notFound(`No Pokémon with id ${id}`);

    /**
     * Every ability slug this species carries, ordinary and hidden alike — the
     * lookup keys for the effect text fetched below.
     */
    const abilitySlugs = [...record.abilities, record.hiddenAbility].filter(
      (slug): slug is string => Boolean(slug),
    );

    const [
      noteRows,
      activityRows,
      neighbours,
      trainerRows,
      chainRows,
      moveRows,
      moveSummary,
      abilityRows,
    ] = await Promise.all([
        db.select().from(notes).where(eq(notes.pokemonId, id)).orderBy(desc(notes.createdAt)),
        db.select().from(activity).where(eq(activity.pokemonId, id)).orderBy(asc(activity.kind)),
        db
          .select({ id: pokemon.id, displayName: pokemon.displayName, spriteUrl: pokemon.spriteUrl })
          .from(pokemon)
          .where(inArray(pokemon.id, [id - 1, id + 1])),
        // Which trainers carry this Pokémon — makes the roster relation
        // navigable from the Pokémon side too.
        db
          .select({
            rosterId: roster.id,
            trainerId: trainers.id,
            trainerName: trainers.name,
            region: trainers.region,
            nickname: roster.nickname,
            level: roster.level,
            status: roster.status,
          })
          .from(roster)
          .innerJoin(trainers, eq(roster.trainerId, trainers.id))
          .where(eq(roster.pokemonId, id))
          .orderBy(asc(trainers.name)),
        // The whole evolution chain this Pokémon belongs to, in stage order —
        // the "programme of study" it sits within.
        record.evolutionChainId === null
          ? Promise.resolve([])
          : db
              .select({
                id: pokemon.id,
                displayName: pokemon.displayName,
                spriteUrl: pokemon.spriteUrl,
                evolutionStage: pokemon.evolutionStage,
                evolvesFromId: pokemon.evolvesFromId,
                evolutionMinLevel: pokemon.evolutionMinLevel,
                evolutionTrigger: pokemon.evolutionTrigger,
                evolutionCondition: pokemon.evolutionCondition,
                isFullyEvolved: pokemon.isFullyEvolved,
              })
              .from(pokemon)
              .where(eq(pokemon.evolutionChainId, record.evolutionChainId))
              .orderBy(asc(pokemon.evolutionStage), asc(pokemon.id)),

        /*
         * The full movepool — the "coursework" half of the record. Returned
         * whole rather than paginated: the widest movepool in the dex is Mew's
         * at ~490 rows, and the UI groups them by learn method, which needs all
         * of them anyway.
         */
        db
          .select({
            moveId: moves.id,
            name: moves.name,
            displayName: moves.displayName,
            type: moves.type,
            damageClass: moves.damageClass,
            power: moves.power,
            accuracy: moves.accuracy,
            pp: moves.pp,
            priority: moves.priority,
            effect: moves.effect,
            generation: moves.generation,
            learnedByCount: moves.learnedByCount,
            learnMethod: pokemonMoves.learnMethod,
            levelLearnedAt: pokemonMoves.levelLearnedAt,
            versionGroup: pokemonMoves.versionGroup,
            /*
             * The move's most recent TM, or null.
             *
             * "Most recent" is `max(version_group_order)`, not `max(id)` —
             * PokeAPI's version-group ids are not chronological, which is why
             * that order is stored on the row at all. Correlated subquery, so
             * the inner table is aliased and the outer reference qualified.
             *
             * Not filtered to `learn_method = 'machine'`: a move can be both
             * level-up for this species and a TM in general, and the number is
             * true either way. The UI shows it on machine rows.
             */
            tmNumber: sql<string | null>`(
              select mm.tm_number
              from ${moveMachines} mm
              where mm.move_id = ${moves}.id
              order by mm.version_group_order desc nulls last, mm.id desc
              limit 1
            )`,
          })
          .from(pokemonMoves)
          .innerJoin(moves, eq(pokemonMoves.moveId, moves.id))
          .where(eq(pokemonMoves.pokemonId, id))
          // Level-up moves in level order; everything else alphabetically,
          // since their `level_learned_at` is a uniform 0.
          .orderBy(asc(pokemonMoves.levelLearnedAt), asc(moves.displayName)),

        /*
         * Movepool summary. `coverage_types` is the set of types this species
         * can actually *attack* with — status moves are excluded, because a
         * Grass-type status move gives no Grass coverage. That set is what
         * makes "can this cover its own weaknesses" answerable once the type
         * chart lands (TODO 3b).
         */
        db.execute<{
          total: number;
          damaging: number;
          status: number;
          coverage_types: string[];
          stab_types: string[];
          max_power: number | null;
          avg_power: number | null;
          level_up_count: number;
          machine_count: number;
          egg_count: number;
          tutor_count: number;
        }>(sql`
          select
            count(distinct pm.move_id)::int                                          as total,
            count(distinct pm.move_id) filter (where m.damage_class <> 'status')::int as damaging,
            count(distinct pm.move_id) filter (where m.damage_class = 'status')::int  as status,
            coalesce(array_agg(distinct m.type) filter (where m.damage_class <> 'status'), '{}') as coverage_types,
            coalesce(array_agg(distinct m.type) filter (
              where m.damage_class <> 'status' and m.type in (${record.type1}, ${record.type2 ?? record.type1})
            ), '{}')                                                                 as stab_types,
            -- power > 0 throughout: PokeAPI reports 0 for status moves and for
            -- fixed-damage ones (Seismic Toss), meaning "no fixed base power",
            -- never "deals zero damage".
            max(m.power)::int                                                        as max_power,
            round(avg(m.power) filter (where m.power > 0))::int                      as avg_power,
            count(distinct pm.move_id) filter (where pm.learn_method = 'level-up')::int as level_up_count,
            count(distinct pm.move_id) filter (where pm.learn_method = 'machine')::int  as machine_count,
            count(distinct pm.move_id) filter (where pm.learn_method = 'egg')::int      as egg_count,
            count(distinct pm.move_id) filter (where pm.learn_method = 'tutor')::int    as tutor_count
          from ${pokemonMoves} pm
          join ${moves} m on m.id = pm.move_id
          where pm.pokemon_id = ${id}
        `),

        // Effect text for this species' abilities. The join is slug-to-slug
        // with no FK, so a miss is expected rather than exceptional — see the
        // assembly below, which falls back to the slug.
        abilitySlugs.length === 0
          ? Promise.resolve([])
          : db.select().from(abilities).where(inArray(abilities.slug, abilitySlugs)),
      ]);

    /**
     * Abilities as objects rather than slugs, in slot order with the hidden one
     * last.
     *
     * Built from `record.abilities` rather than from the fetched rows so slot
     * order survives and **an ability with no `abilities` row still appears** —
     * it renders as its title-cased slug with no effect text, which is what the
     * whole Profile showed before that table existed. Dropping it instead would
     * make a failed seed look like a species with fewer abilities.
     */
    const abilityBySlug = new Map(abilityRows.map((row) => [row.slug, row]));
    const abilityList = abilitySlugs.map((slug) => {
      const row = abilityBySlug.get(slug);
      return {
        slug,
        displayName: row?.displayName ?? titleCase(slug),
        effect: row?.effect ?? null,
        shortEffect: row?.shortEffect ?? null,
        isHidden: slug === record.hiddenAbility,
      };
    });

    // How this Pokémon's base stat total ranks against the whole dataset.
    const [rank] = await db
      .select({
        betterThan: sql<number>`(select count(*)::int from ${pokemon} p where p.base_stat_total < ${record.baseStatTotal})`,
        total: sql<number>`count(*)::int`,
      })
      .from(pokemon);

    // Defensive matchups. Computed here rather than shipped as a matrix — see
    // effectiveness.ts. Neutral types are omitted from all three lists.
    const matchups = defensiveProfile(await loadTypeChart(), record.type1, record.type2);

    res.json({
      pokemon: record,
      notes: noteRows,
      activity: activityRows,
      trainers: trainerRows,
      abilities: abilityList,
      moves: moveRows,
      moveSummary: moveSummary.rows[0] ?? null,
      matchups,
      evolution: {
        chain: chainRows,
        stage: record.evolutionStage,
        chainLength: record.chainLength,
        isFullyEvolved: record.isFullyEvolved,
        /** Stages reachable directly from here (plural for Eevee-style chains). */
        nextStages: chainRows.filter((link) => link.evolvesFromId === record.id),
      },
      neighbours: {
        previous: neighbours.find((n) => n.id === id - 1) ?? null,
        next: neighbours.find((n) => n.id === id + 1) ?? null,
      },
      ranking: {
        baseStatTotalPercentile:
          rank && rank.total > 0 ? Math.round((rank.betterThan / rank.total) * 100) : null,
        total: rank?.total ?? 0,
      },
    });
  }),
);

/** Guard against a route ordering mistake silently returning the wrong thing. */
pokemonRouter.use((req) => {
  throw badRequest(`Unknown pokemon route: ${req.path}`);
});
