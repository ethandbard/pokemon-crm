import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MoveSummary, MovepoolEntry } from '../lib/types';
import { Card, DamageClassBadge, EmptyState, TypeBadge } from './ui';
import { LEARN_METHOD_ORDER, learnMethodLabel, movePower, moveStat, slugLabel, titleCase } from '../lib/format';
import { toQueryString } from '../lib/api';

/**
 * A species' movepool, grouped by how each move is learned.
 *
 * Tabs rather than one long table: a full movepool runs to ~200 rows across
 * four unrelated routes, and "what does it learn by levelling" and "what can I
 * teach it" are different questions.
 */
export function Movepool({
  pokemonId,
  moves,
  summary,
  type1,
  type2,
}: {
  pokemonId: number;
  moves: MovepoolEntry[];
  summary: MoveSummary | null;
  type1: string;
  type2: string | null;
}) {
  const byMethod = useMemo(() => {
    const groups = new Map<string, MovepoolEntry[]>();
    for (const move of moves) {
      const list = groups.get(move.learnMethod) ?? [];
      list.push(move);
      groups.set(move.learnMethod, list);
    }
    // Known methods in a fixed order first, then whatever else the data has —
    // PokeAPI keeps adding one-game methods and they shouldn't lead the tabs.
    const known = LEARN_METHOD_ORDER.filter((method) => groups.has(method));
    const rest = [...groups.keys()].filter((method) => !LEARN_METHOD_ORDER.includes(method)).sort();
    return { groups, methods: [...known, ...rest] };
  }, [moves]);

  const [method, setMethod] = useState<string | null>(null);
  const active = method && byMethod.groups.has(method) ? method : (byMethod.methods[0] ?? null);
  const rows = active ? (byMethod.groups.get(active) ?? []) : [];

  if (moves.length === 0) {
    return (
      <Card title="Movepool" subtitle="Moves this Pokémon can learn">
        <EmptyState
          title="No moves imported"
          description="Run `npm run seed` with SEED_MOVES unset to import movepools from PokeAPI."
        />
      </Card>
    );
  }

  const ownTypes = [type1, type2].filter(Boolean) as string[];

  return (
    <Card
      title="Movepool"
      subtitle={
        summary
          ? `${summary.total} moves — ${summary.damaging} damaging, ${summary.status} status, covering ${summary.coverage_types.length} of 18 attacking types`
          : `${moves.length} moves`
      }
      actions={
        <Link
          to={`/moves${toQueryString({ pokemonId })}`}
          className="text-xs font-medium text-brand hover:underline"
        >
          Browse as catalogue →
        </Link>
      }
    >
      {summary && (
        <div className="mb-4">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Attacking coverage
          </p>
          <div className="flex flex-wrap gap-1.5">
            {summary.coverage_types.map((type) => (
              <span key={type} className="inline-flex items-center gap-1">
                <TypeBadge type={type} />
                {/* Same-type attack bonus: coverage that matches its own
                    typing hits harder, so it isn't equivalent to the rest. */}
                {ownTypes.includes(type) && (
                  <span
                    title="Same-type attack bonus"
                    className="rounded bg-brand/10 px-1 py-0.5 text-[9px] font-semibold text-brand-strong"
                  >
                    STAB
                  </span>
                )}
              </span>
            ))}
          </div>
          {/* `> 0`, not `!== null`: a status-only movepool reports max power 0,
              and "strongest move 0 power" is noise. */}
          {(summary.max_power ?? 0) > 0 && (
            <p className="mt-2 text-xs text-muted">
              Strongest move {summary.max_power} power · mean damaging power{' '}
              {summary.avg_power ?? '—'}
            </p>
          )}
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Learn method">
        {byMethod.methods.map((candidate) => (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={active === candidate}
            onClick={() => setMethod(candidate)}
            className={[
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              active === candidate
                ? 'border-brand bg-brand/10 text-brand-strong'
                : 'border-hairline bg-surface text-muted hover:text-ink',
            ].join(' ')}
          >
            {learnMethodLabel(candidate)}
            <span className="ml-1.5 tabular-nums opacity-70">
              {byMethod.groups.get(candidate)?.length ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="max-h-96 overflow-y-auto rounded-lg border border-hairline">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-hairline text-xs text-muted">
              {active === 'level-up' && (
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Lv
                </th>
              )}
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Move
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Type
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Class
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Pow
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Acc
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                PP
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((move) => (
              <tr
                key={`${move.moveId}-${move.learnMethod}`}
                className="border-b border-hairline/70 last:border-0 hover:bg-plane"
              >
                {active === 'level-up' && (
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted">
                    {move.levelLearnedAt > 0 ? (
                      move.levelLearnedAt
                    ) : (
                      // Level 0 on a level-up move is PokeAPI's encoding for
                      // "learned on evolution", not "learned at level zero".
                      <span title="Learned on evolution" className="text-[11px] not-italic">
                        Evo
                      </span>
                    )}
                  </td>
                )}
                <td className="px-3 py-1.5">
                  <Link
                    to={`/moves/${move.moveId}`}
                    className="font-medium text-ink hover:text-brand"
                    title={move.effect ?? undefined}
                  >
                    {move.displayName}
                  </Link>
                </td>
                <td className="px-3 py-1.5">
                  <TypeBadge type={move.type} />
                </td>
                <td className="px-3 py-1.5">
                  <DamageClassBadge damageClass={move.damageClass} />
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{movePower(move.power)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{moveStat(move.accuracy)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted">
                  {moveStat(move.pp)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The version group is stated because a movepool is per-game data and
          this row set is one game's answer, not a timeless fact. */}
      {rows[0]?.versionGroup && (
        <p className="mt-2 text-[11px] text-muted">
          {learnMethodLabel(active ?? '')} data from {slugLabel(rows[0].versionGroup)}
          {rows.some((row) => row.versionGroup !== rows[0]?.versionGroup) && ' and others'}. Each
          move keeps its most recent game's entry.
        </p>
      )}
    </Card>
  );
}

/** Compact coverage read-out used on the trainer dashboard's roster board. */
export function CoverageSummary({ types }: { types: string[] }) {
  if (types.length === 0) return <span className="text-xs text-muted">No damaging moves</span>;
  return (
    <span className="text-xs text-muted">
      {types.length} of 18 types · {types.map(titleCase).join(', ')}
    </span>
  );
}
