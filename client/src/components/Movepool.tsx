import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MoveSummary, MovepoolEntry } from '../lib/types';
import { Card, DamageClassBadge, EmptyState, Select, TextInput, TypeBadge } from './ui';
import { LEARN_METHOD_ORDER, learnMethodLabel, movePower, moveStat, slugLabel, titleCase } from '../lib/format';
import { toQueryString } from '../lib/api';

type SortKey = 'level' | 'name' | 'type' | 'class' | 'power' | 'accuracy' | 'pp';
type SortDirection = 'asc' | 'desc';
interface Sort {
  key: SortKey;
  direction: SortDirection;
}

/** Measures read high-to-low first; labels and level read low-to-high. */
const DESC_FIRST: SortKey[] = ['power', 'accuracy', 'pp'];

/**
 * The value a column sorts on, which is not always the value it stores.
 *
 * Power is the exception: PokeAPI reports **0** as well as null for "no fixed
 * base power", `movePower` renders both as "—", and so both sort as absent.
 * Sorting 0 as a number would file every status move below Splash's 40 while
 * the column shows them all as the same dash.
 */
function sortValue(move: MovepoolEntry, key: SortKey): string | number | null {
  switch (key) {
    case 'level':
      return move.levelLearnedAt;
    case 'name':
      return move.displayName.toLowerCase();
    case 'type':
      return move.type;
    case 'class':
      return move.damageClass;
    case 'power':
      return move.power === 0 ? null : move.power;
    case 'accuracy':
      return move.accuracy;
    case 'pp':
      return move.pp;
  }
}

function compareBy(a: MovepoolEntry, b: MovepoolEntry, { key, direction }: Sort): number {
  const left = sortValue(a, key);
  const right = sortValue(b, key);

  // Absent values sink in BOTH directions. Flipping them to the top on a
  // descending sort would bury the strongest move under a wall of dashes,
  // which is the opposite of what clicking "Pow" asks for.
  if (left === null || right === null) {
    if (left === right) return 0;
    return left === null ? 1 : -1;
  }

  const cmp =
    typeof left === 'string'
      ? left.localeCompare(right as string)
      : (left as number) - (right as number);

  return direction === 'asc' ? cmp : -cmp;
}

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
  const tabRows = active ? (byMethod.groups.get(active) ?? []) : [];

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  // null = "whatever this tab sorts by naturally"; set once the user clicks a
  // header, so switching tabs doesn't silently keep a sort they never chose.
  const [sort, setSort] = useState<Sort | null>(null);

  // Dropdown options come from the active tab, not the whole movepool, so every
  // option offered returns at least one row.
  const { types, classes } = useMemo(
    () => ({
      types: [...new Set(tabRows.map((move) => move.type))].sort(),
      classes: [...new Set(tabRows.map((move) => move.damageClass))].sort(),
    }),
    [tabRows],
  );

  // "Lv" only exists on the level-up tab, so a level sort can't survive a move
  // to another tab; fall back rather than sorting by a column that isn't there.
  const defaultSort: Sort =
    active === 'level-up' ? { key: 'level', direction: 'asc' } : { key: 'name', direction: 'asc' };
  const activeSort: Sort =
    sort && (sort.key !== 'level' || active === 'level-up') ? sort : defaultSort;

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tabRows
      .filter(
        (move) =>
          (!needle || move.displayName.toLowerCase().includes(needle)) &&
          (!typeFilter || move.type === typeFilter) &&
          (!classFilter || move.damageClass === classFilter),
      )
      .sort(
        (a, b) =>
          compareBy(a, b, activeSort) ||
          // Tiebreakers keep the order stable when a column has ties, so rows
          // don't shuffle between renders.
          a.displayName.localeCompare(b.displayName) ||
          a.moveId - b.moveId,
      );
  }, [tabRows, query, typeFilter, classFilter, activeSort.key, activeSort.direction]);

  const hasFilters = Boolean(query || typeFilter || classFilter);

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: DESC_FIRST.includes(key) ? 'desc' : 'asc' },
    );
  }

  function clearFilters() {
    setQuery('');
    setTypeFilter('');
    setClassFilter('');
  }

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

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <TextInput
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter moves…"
          aria-label="Filter moves by name"
          className="w-44"
        />
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Filter moves by type"
        >
          <option value="">All types</option>
          {types.map((type) => (
            <option key={type} value={type}>
              {titleCase(type)}
            </option>
          ))}
        </Select>
        <Select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          aria-label="Filter moves by damage class"
        >
          <option value="">All classes</option>
          {classes.map((damageClass) => (
            <option key={damageClass} value={damageClass}>
              {titleCase(damageClass)}
            </option>
          ))}
        </Select>

        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs font-medium text-brand hover:underline"
          >
            Clear
          </button>
        )}

        <span className="ml-auto text-xs tabular-nums text-muted">
          {hasFilters
            ? `${rows.length} of ${tabRows.length}`
            : `${tabRows.length} ${tabRows.length === 1 ? 'move' : 'moves'}`}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-hairline">
          <EmptyState
            title="No moves match those filters"
            description={`Nothing in ${learnMethodLabel(active ?? '')} matches. Try another type or class, or clear the filters.`}
          />
        </div>
      ) : (
      <div className="max-h-96 overflow-y-auto rounded-lg border border-hairline">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-hairline text-xs text-muted">
              {active === 'level-up' && (
                <SortableTh label="Lv" sortKey="level" sort={activeSort} onSort={toggleSort} align="right" />
              )}
              {/* Only on the machine tab, mirroring the level column: on any
                  other tab the number answers a question nobody asked. */}
              {active === 'machine' && (
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  TM
                </th>
              )}
              <SortableTh label="Move" sortKey="name" sort={activeSort} onSort={toggleSort} />
              <SortableTh label="Type" sortKey="type" sort={activeSort} onSort={toggleSort} />
              <SortableTh label="Class" sortKey="class" sort={activeSort} onSort={toggleSort} />
              <SortableTh label="Pow" sortKey="power" sort={activeSort} onSort={toggleSort} align="right" />
              <SortableTh label="Acc" sortKey="accuracy" sort={activeSort} onSort={toggleSort} align="right" />
              <SortableTh label="PP" sortKey="pp" sort={activeSort} onSort={toggleSort} align="right" />
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
                {active === 'machine' && (
                  <td className="px-3 py-1.5 tabular-nums text-muted">
                    {/* Null when the machines import has not run. The row is
                        still true — this move IS machine-taught — so the cell
                        goes quiet rather than the row disappearing. */}
                    {move.tmNumber ?? <span className="text-hairline">—</span>}
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
      )}

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

/**
 * A movepool column header that sorts. The arrow sits in a fixed-width slot so
 * the header row doesn't jitter as the active column changes.
 */
function SortableTh({
  label,
  sortKey,
  sort,
  onSort,
  align = 'left',
}: {
  label: string;
  sortKey: SortKey;
  sort: Sort;
  onSort: (key: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const isActive = sort.key === sortKey;

  // The padding lives on the button, not the cell, so the whole header is the
  // hit target rather than just the few pixels the label covers.
  return (
    <th
      scope="col"
      aria-sort={isActive ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className="p-0 font-medium"
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={[
          'flex w-full items-center gap-1 px-3 py-2 hover:text-ink',
          align === 'right' ? 'flex-row-reverse' : '',
          isActive ? 'text-ink' : '',
        ].join(' ')}
      >
        {label}
        <span aria-hidden="true" className="w-2 text-[9px] text-brand-strong">
          {isActive ? (sort.direction === 'asc' ? '▲' : '▼') : ''}
        </span>
      </button>
    </th>
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
