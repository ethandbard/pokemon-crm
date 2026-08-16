import { sql, type SQL } from 'drizzle-orm';
import { db } from './db/client.js';
import { activity, moves, pokemon, roster, rosterMoves, trainers } from './db/schema.js';
import { ATTENTION, type AttentionReasonCode, type RosterAlertCode } from './constants.js';
import {
  loadTypeChart,
  offensiveCoverage,
  rosterVulnerabilities,
  type RosterMember,
} from './effectiveness.js';

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
  /** Filled move slots, 0–4. The readiness signal. */
  movesetSize: number;
  /** The recorded ability slug, or null. Scored only once the moveset is full. */
  ability: string | null;
  /** The recorded nature slug, or null. Same gate. */
  nature: string | null;
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

  // Readiness first — it is the heaviest signal and the most actionable.
  if (facts.movesetSize === 0) {
    reasons.push({
      code: 'moveset_missing',
      points: ATTENTION.movesetMissing,
      label: 'No moves set — cannot attack, and adds nothing to team coverage',
    });
  } else if (facts.movesetSize < 4) {
    const empty = 4 - facts.movesetSize;
    reasons.push({
      code: 'moveset_incomplete',
      points: round(empty * ATTENTION.movesetIncompletePerSlot),
      label: `${facts.movesetSize} of 4 moves set`,
    });
  }

  /*
   * Build detail, and only once the moveset is finished.
   *
   * The gate is the point. These are the smallest signals in the model and
   * nothing seeds them, so ungated they would fire on every member of a fresh
   * database alongside `moveset_missing` — three chips on every row, which is
   * the roster wearing a queue's clothing. Gated, the queue reads as a
   * progression: get the moves in, then finish the build.
   *
   * Drop `movesetSize === 4` from this condition to ungate them.
   */
  if (facts.movesetSize === 4) {
    if (!facts.ability) {
      reasons.push({
        code: 'ability_missing',
        points: ATTENTION.abilityMissing,
        label: 'No ability recorded',
      });
    }
    if (!facts.nature) {
      reasons.push({
        code: 'nature_missing',
        points: ATTENTION.natureMissing,
        label: 'No nature recorded',
      });
    }
  }

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
async function loadFacts(trainerId?: number, scope?: SQL): Promise<AttentionFacts[]> {
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

      -- Equipped moves, not the learnable movepool. Keyed on the roster entry,
      -- so two trainers carrying the same species are judged separately.
      (
        select count(*)::int from ${rosterMoves} rm where rm.roster_id = r.id
      )                                                      as "movesetSize",

      -- Build detail. Plain columns, not joins: the scorer only asks whether
      -- they are set, and resolving a display name here would be work the
      -- queue never uses.
      r.ability                                              as "ability",
      r.nature                                               as "nature"

    from ${roster} r
    join ${pokemon} p on p.id = r.pokemon_id
    join ${trainers} t on t.id = r.trainer_id
    where r.status <> 'retired'
      ${trainerId === undefined ? sql`` : sql`and r.trainer_id = ${trainerId}`}
      ${scope ? sql`and ${scope}` : sql``}
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
  /** Owner predicate over `t` (the trainers alias). Omit for every roster. */
  scope?: SQL;
} = {}): Promise<{ items: AttentionItem[]; scanned: number }> {
  const facts = await loadFacts(options.trainerId, options.scope);
  const items = facts
    .map(scoreFacts)
    .filter((item) => item.reasons.length > 0)
    .sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName));

  return {
    items: options.limit ? items.slice(0, options.limit) : items,
    scanned: facts.length,
  };
}

/* -------------------------------------------------------------------------- */
/*  Trainer-level alerts                                                       */
/* -------------------------------------------------------------------------- */

export interface RosterAlert {
  code: RosterAlertCode;
  trainerId: number;
  trainerName: string;
  label: string;
  /** Supporting detail — the exposed members, the count of empty slots. */
  detail: string;
}

/**
 * Problems that belong to a **roster**, not to any one member.
 *
 * Deliberately a separate list from the member queue rather than a wider item
 * shape: "this team has no answer to Ground" has no `rosterId`, sprite, level
 * or species, and folding it in would leave half of every item null.
 *
 * Two signals today, both facts about the team as a whole:
 *  - the active roster is short of a full party
 *  - a type hits several members for 2× and nothing on the team answers it
 */
export async function getRosterAlerts(trainerId?: number, scope?: SQL): Promise<RosterAlert[]> {
  const rows = await db.execute(sql`
    select
      t.id                                            as "trainerId",
      t.name                                          as "trainerName",
      r.id                                            as "rosterId",
      coalesce(r.nickname, p.display_name)            as "memberName",
      p.display_name                                  as "displayName",
      p.type1                                         as "type1",
      p.type2                                         as "type2",
      (select count(*)::int from ${rosterMoves} rm where rm.roster_id = r.id) as "movesetSize",
      coalesce(
        (
          select array_agg(distinct m.type)
          from ${rosterMoves} rm
          join ${moves} m on m.id = rm.move_id
          where rm.roster_id = r.id and m.damage_class <> 'status'
        ),
        '{}'
      )                                               as "equippedMoveTypes"
    from ${trainers} t
    left join ${roster} r on r.trainer_id = t.id and r.status <> 'retired'
    left join ${pokemon} p on p.id = r.pokemon_id
    where true
      ${trainerId === undefined ? sql`` : sql`and t.id = ${trainerId}`}
      ${scope ? sql`and ${scope}` : sql``}
  `);

  // Group the flat join back into rosters. A trainer with an empty active
  // roster still appears, with a null member row — that is itself an alert.
  const byTrainer = new Map<number, { name: string; members: RosterMember[] }>();
  for (const row of rows.rows as unknown as {
    trainerId: number;
    trainerName: string;
    rosterId: number | null;
    memberName: string | null;
    displayName: string | null;
    type1: string | null;
    type2: string | null;
    movesetSize: number;
    equippedMoveTypes: string[];
  }[]) {
    const entry = byTrainer.get(row.trainerId) ?? { name: row.trainerName, members: [] };
    if (row.rosterId !== null && row.type1 !== null) {
      entry.members.push({
        rosterId: row.rosterId,
        displayName: row.displayName ?? '',
        nickname: row.memberName,
        type1: row.type1,
        type2: row.type2,
        equippedMoveTypes: row.equippedMoveTypes,
        movesetSize: row.movesetSize,
      });
    }
    byTrainer.set(row.trainerId, entry);
  }

  const chart = await loadTypeChart();
  const alerts: RosterAlert[] = [];

  for (const [id, { name, members }] of byTrainer) {
    if (members.length < ATTENTION.fullRosterSize) {
      const short = ATTENTION.fullRosterSize - members.length;
      alerts.push({
        code: 'roster_incomplete',
        trainerId: id,
        trainerName: name,
        label: `Roster is ${short} short of a full party`,
        detail: `${members.length} of ${ATTENTION.fullRosterSize} active members`,
      });
    }

    if (members.length === 0) continue;

    // Same rule as the team analysis: exposed on several members AND no
    // super-effective reply. Either alone is survivable.
    const answered = new Set(
      offensiveCoverage(chart, members)
        .filter((entry) => entry.bestMultiplier > 100)
        .map((entry) => entry.type),
    );

    // Worst first, so a capped view keeps the alerts that matter most.
    const exposures = rosterVulnerabilities(chart, members)
      .filter(
        (exposure) =>
          exposure.weakCount >= ATTENTION.sharedWeaknessMembers && !answered.has(exposure.type),
      )
      .sort((a, b) => b.weakCount - a.weakCount || a.type.localeCompare(b.type));

    for (const exposure of exposures) {
      alerts.push({
        code: 'unanswered_weakness',
        trainerId: id,
        trainerName: name,
        label: `No answer to ${exposure.type}`,
        detail: `Hits ${exposure.weakCount} hard: ${exposure.weakMembers.join(', ')}`,
      });
    }
  }

  return alerts;
}
