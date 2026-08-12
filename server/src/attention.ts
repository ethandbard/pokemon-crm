import { sql } from 'drizzle-orm';
import { db } from './db/client.js';
import { activity, growthRates, pokemon, roster, trainers } from './db/schema.js';
import { ATTENTION, type AttentionReasonCode } from './constants.js';

/**
 * Needs-attention scoring — the early-alert model.
 *
 * The split here is deliberate: **SQL gathers facts, TypeScript applies
 * weights.** Every weight lives in ATTENTION (constants.ts), so tuning the
 * model never means editing a query, and the same numbers produce both the
 * score and the human-readable reasons. Scoring in SQL would have scattered the
 * weights through a `case` expression and made the reasons a second, drifting
 * copy of the same logic.
 */

/** Raw signals for one roster member, before weighting. */
interface AttentionFacts {
  rosterId: number;
  trainerId: number;
  trainerName: string;
  pokemonId: number;
  displayName: string;
  nickname: string | null;
  spriteUrl: string | null;
  type1: string;
  type2: string | null;
  level: number | null;
  status: string;
  daysOnRoster: number;
  /** Null when this Pokémon has never been reviewed by anyone. */
  daysSinceReview: number | null;
  isFlagged: boolean;
  milestoneOverdue: boolean;
  nextEvolutionName: string | null;
  nextEvolutionLevel: number | null;
  /** Level the growth curve implies for its time on roster. */
  expectedLevel: number | null;
}

export interface AttentionReason {
  code: AttentionReasonCode;
  /** Weighted contribution to the score — lets the UI show what dominates. */
  points: number;
  label: string;
}

export interface AttentionItem extends AttentionFacts {
  score: number;
  reasons: AttentionReason[];
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Applies ATTENTION weights to raw facts.
 *
 * A member with no firing signals scores 0 and is filtered out by the caller —
 * an "attention queue" that lists everyone is just the roster again.
 */
export function scoreFacts(facts: AttentionFacts): AttentionItem {
  const reasons: AttentionReason[] = [];

  if (facts.daysSinceReview === null) {
    reasons.push({
      code: 'never_reviewed',
      points: ATTENTION.neverReviewed,
      label: 'Never reviewed',
    });
  } else if (facts.daysSinceReview > ATTENTION.staleAfterDays) {
    const overdue = facts.daysSinceReview - ATTENTION.staleAfterDays;
    reasons.push({
      code: 'stale_review',
      points: round(Math.min(overdue * ATTENTION.stalePerDay, ATTENTION.staleCap)),
      label: `Last reviewed ${facts.daysSinceReview} days ago`,
    });
  }

  if (facts.isFlagged) {
    reasons.push({ code: 'flagged', points: ATTENTION.flagged, label: 'Flagged for follow-up' });
  }

  if (facts.milestoneOverdue) {
    reasons.push({
      code: 'milestone_overdue',
      points: ATTENTION.milestoneOverdue,
      label: facts.nextEvolutionName
        ? `Ready to evolve into ${facts.nextEvolutionName} since Lv ${facts.nextEvolutionLevel}`
        : 'Evolution milestone met',
    });
  }

  // Only meaningful when we know both the actual and the expected level.
  if (facts.expectedLevel !== null && facts.level !== null) {
    const behind = facts.expectedLevel - facts.level;
    if (behind > ATTENTION.behindPaceTolerance) {
      reasons.push({
        code: 'behind_pace',
        points: round(Math.min(behind * ATTENTION.behindPacePerLevel, ATTENTION.behindPaceCap)),
        label: `${behind} levels behind pace (expected ~Lv ${facts.expectedLevel} after ${facts.daysOnRoster} days)`,
      });
    }
  }

  const score = round(reasons.reduce((total, reason) => total + reason.points, 0));
  return { ...facts, score, reasons };
}

/**
 * Gathers raw signals for every non-retired roster member, optionally scoped to
 * one trainer.
 *
 * Correlated subqueries alias their own tables and qualify outer references —
 * `roster` and `activity` both have a `pokemon_id`, so the unqualified form
 * would compare a table to itself (see CLAUDE.md § API conventions).
 */
async function loadFacts(trainerId?: number): Promise<AttentionFacts[]> {
  // `db.execute` constrains its generic to Record<string, unknown>, which an
  // interface can't satisfy without an index signature — cast the result
  // instead of weakening the type everything else consumes.
  const rows = await db.execute(sql`
    select
      r.id                                                   as "rosterId",
      r.trainer_id                                           as "trainerId",
      t.name                                                 as "trainerName",
      r.pokemon_id                                           as "pokemonId",
      p.display_name                                         as "displayName",
      r.nickname                                             as "nickname",
      p.sprite_url                                           as "spriteUrl",
      p.type1                                                as "type1",
      p.type2                                                as "type2",
      r.level                                                as "level",
      r.status::text                                         as "status",
      greatest(0, extract(day from now() - r.acquired_at))::int as "daysOnRoster",

      (
        select extract(day from now() - max(a.updated_at))::int
        from ${activity} a
        where a.pokemon_id = r.pokemon_id and a.kind = 'reviewed'
      )                                                      as "daysSinceReview",

      exists (
        select 1 from ${activity} a
        where a.pokemon_id = r.pokemon_id and a.kind = 'flagged'
      )                                                      as "isFlagged",

      (
        not p.is_fully_evolved
        and r.level is not null
        and exists (
          select 1 from ${pokemon} n
          where n.evolves_from_id = r.pokemon_id
            and n.evolution_min_level is not null
            and r.level >= n.evolution_min_level
        )
      )                                                      as "milestoneOverdue",

      (
        select n.display_name from ${pokemon} n
        where n.evolves_from_id = r.pokemon_id
        order by n.evolution_min_level nulls last, n.id limit 1
      )                                                      as "nextEvolutionName",
      (
        select n.evolution_min_level from ${pokemon} n
        where n.evolves_from_id = r.pokemon_id
        order by n.evolution_min_level nulls last, n.id limit 1
      )                                                      as "nextEvolutionLevel",

      -- Highest level whose cumulative EXP is covered by (days on roster ×
      -- ATTENTION.expPerDay), on this species' real growth curve.
      (
        select max(g.level)
        from ${growthRates} g
        where g.name = p.growth_rate
          and g.experience <= greatest(0, extract(day from now() - r.acquired_at)) * ${ATTENTION.expPerDay}
      )                                                      as "expectedLevel"

    from ${roster} r
    join ${pokemon} p on p.id = r.pokemon_id
    join ${trainers} t on t.id = r.trainer_id
    where r.status <> 'retired'
      ${trainerId === undefined ? sql`` : sql`and r.trainer_id = ${trainerId}`}
  `);

  return rows.rows as unknown as AttentionFacts[];
}

/**
 * Ranked needs-attention queue. Returns only members with at least one firing
 * signal, highest score first.
 */
export async function getAttentionQueue(options: {
  trainerId?: number;
  limit?: number;
} = {}): Promise<{ items: AttentionItem[]; scanned: number }> {
  const facts = await loadFacts(options.trainerId);
  const items = facts
    .map(scoreFacts)
    .filter((item) => item.reasons.length > 0)
    .sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName));

  return {
    items: options.limit ? items.slice(0, options.limit) : items,
    scanned: facts.length,
  };
}
