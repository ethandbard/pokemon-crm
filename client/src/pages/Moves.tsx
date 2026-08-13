import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toQueryString } from '../lib/api';
import { useApi, useDebounced, usePageClamp } from '../lib/useApi';
import type { MoveFilterOptions, MovesResponse } from '../lib/types';
import {
  Button,
  DamageClassBadge,
  EmptyState,
  ErrorState,
  Loading,
  Paginator,
  Select,
  TextInput,
  TypeBadge,
} from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { SavedViews } from '../components/SavedViews';
import { learnMethodLabel, movePower, moveStat, slugLabel, titleCase } from '../lib/format';

const COLUMNS = [
  { key: 'name', label: 'Move', numeric: false },
  { key: 'type', label: 'Type', numeric: false },
  { key: 'damageClass', label: 'Class', numeric: false },
  { key: 'power', label: 'Power', numeric: true },
  { key: 'accuracy', label: 'Acc', numeric: true },
  { key: 'pp', label: 'PP', numeric: true },
  { key: 'generation', label: 'Gen', numeric: true },
  { key: 'learnedBy', label: 'Learned by', numeric: true },
  { key: null, label: 'Effect', numeric: false },
] as const;

export function MovesPage() {
  // ?pokemonId= and ?trainerId= let the Profile and Trainers pages open a
  // scoped catalogue rather than the whole 797.
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [damageClass, setDamageClass] = useState('');
  const [generation, setGeneration] = useState('');
  const [learnMethod, setLearnMethod] = useState('');
  const [pokemonId, setPokemonId] = useState(() => searchParams.get('pokemonId') ?? '');
  const [trainerId, setTrainerId] = useState(() => searchParams.get('trainerId') ?? '');
  const [minPower, setMinPower] = useState('');

  const [sort, setSort] = useState('learnedBy');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounced(search);

  const listPath = useMemo(
    () =>
      `/api/moves${toQueryString({
        search: debouncedSearch,
        type,
        damageClass,
        generation,
        learnMethod,
        pokemonId,
        trainerId,
        minPower,
        sort,
        direction,
        page,
        pageSize: 25,
      })}`,
    [
      debouncedSearch,
      type,
      damageClass,
      generation,
      learnMethod,
      pokemonId,
      trainerId,
      minPower,
      sort,
      direction,
      page,
    ],
  );

  const { data, loading, error, refetch } = useApi<MovesResponse>(listPath);
  const filters = useApi<MoveFilterOptions>('/api/moves/filters');
  usePageClamp(data?.pagination, setPage);

  const hasFilters = Boolean(
    search || type || damageClass || generation || learnMethod || pokemonId || trainerId || minPower,
  );

  /** Clicking a header sorts by it; clicking the active header flips direction. */
  function toggleSort(key: string) {
    if (sort === key) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(key);
      // Counts and power read best highest-first; names and types A–Z.
      setDirection(key === 'name' || key === 'type' || key === 'damageClass' ? 'asc' : 'desc');
    }
    setPage(1);
  }

  function withReset<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  function clearFilters() {
    setSearch('');
    setType('');
    setDamageClass('');
    setGeneration('');
    setLearnMethod('');
    setPokemonId('');
    setTrainerId('');
    setMinPower('');
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-7">
      <PageHeader
        title="Moves"
        description="Every move in the dataset — the course catalogue behind each Pokémon's movepool. Select a move to see who learns it and how."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <TextInput
          type="search"
          value={search}
          onChange={(e) => withReset(setSearch)(e.target.value)}
          placeholder="Search moves…"
          aria-label="Search moves by name"
          className="w-56"
        />

        <Select
          value={type}
          onChange={(e) => withReset(setType)(e.target.value)}
          aria-label="Filter by move type"
        >
          <option value="">All types</option>
          {filters.data?.types.map((t) => (
            <option key={t} value={t}>
              {titleCase(t)}
            </option>
          ))}
        </Select>

        <Select
          value={damageClass}
          onChange={(e) => withReset(setDamageClass)(e.target.value)}
          aria-label="Filter by damage class"
        >
          <option value="">Any class</option>
          {filters.data?.damageClasses.map((c) => (
            <option key={c} value={c}>
              {titleCase(c)}
            </option>
          ))}
        </Select>

        <Select
          value={generation}
          onChange={(e) => withReset(setGeneration)(e.target.value)}
          aria-label="Filter by generation introduced"
        >
          <option value="">All generations</option>
          {filters.data?.generations.map((g) => (
            <option key={g} value={g}>
              Generation {g}
            </option>
          ))}
        </Select>

        <Select
          value={learnMethod}
          onChange={(e) => withReset(setLearnMethod)(e.target.value)}
          aria-label="Filter by how the move is learned"
        >
          <option value="">Any learn method</option>
          {filters.data?.learnMethods.map((method) => (
            <option key={method.value} value={method.value}>
              {learnMethodLabel(method.value)}
            </option>
          ))}
        </Select>

        <Select
          value={minPower}
          onChange={(e) => withReset(setMinPower)(e.target.value)}
          aria-label="Filter by minimum power"
        >
          <option value="">Any power</option>
          <option value="1">Damaging only</option>
          <option value="80">80+</option>
          <option value="100">100+</option>
          <option value="120">120+</option>
        </Select>

        {hasFilters && <Button onClick={clearFilters}>Clear filters</Button>}

        <span className="ml-auto flex gap-2">
          <SavedViews
            storageKey="moves"
            current={{ search, type, damageClass, generation, learnMethod, minPower, sort, direction }}
            hasActiveFilters={hasFilters}
            onApply={(state) => {
              setSearch(String(state.search ?? ''));
              setType(String(state.type ?? ''));
              setDamageClass(String(state.damageClass ?? ''));
              setGeneration(String(state.generation ?? ''));
              setLearnMethod(String(state.learnMethod ?? ''));
              setMinPower(String(state.minPower ?? ''));
              setSort(String(state.sort ?? 'learnedBy'));
              setDirection(state.direction === 'asc' ? 'asc' : 'desc');
              setPage(1);
            }}
          />
        </span>
      </div>

      {/* Scope filters arrive by link, so they announce themselves the same way
          the move chip does on Lookup. */}
      {(pokemonId || trainerId) && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand bg-brand/10 px-3 py-1 text-xs font-medium text-brand-strong">
            {pokemonId ? 'Learnable by one Pokémon' : "On a trainer's roster"}
            <button
              type="button"
              onClick={() => {
                setPokemonId('');
                setTrainerId('');
                setPage(1);
              }}
              aria-label="Remove the scope filter"
              className="ml-0.5 text-sm leading-none hover:text-ink"
            >
              ×
            </button>
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
        {loading && !data ? (
          <div className="p-5">
            <Loading rows={10} label="Loading moves…" />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No moves match those filters' : 'No moves imported yet'}
            description={
              hasFilters
                ? 'Try a broader search or clear the filters.'
                : 'The moves table is empty — run `npm run seed` (with SEED_MOVES unset) to import them from PokeAPI.'
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline text-xs text-muted">
                    {COLUMNS.map((column) => (
                      <th
                        key={column.label}
                        scope="col"
                        className={`px-3 py-2.5 font-medium ${column.numeric ? 'text-right' : 'text-left'}`}
                      >
                        {column.key ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(column.key)}
                            className="inline-flex items-center gap-1 hover:text-ink"
                            aria-label={`Sort by ${column.label}`}
                          >
                            {column.label}
                            {sort === column.key && (
                              <span aria-hidden="true">{direction === 'asc' ? '▲' : '▼'}</span>
                            )}
                          </button>
                        ) : (
                          column.label
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className={loading ? 'opacity-60 transition-opacity' : undefined}>
                  {data.data.map((move) => (
                    <tr
                      key={move.id}
                      className="border-b border-hairline/70 last:border-0 hover:bg-plane"
                    >
                      <td className="px-3 py-2">
                        <Link
                          to={`/moves/${move.id}`}
                          className="font-medium text-ink hover:text-brand"
                        >
                          {move.displayName}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <TypeBadge type={move.type} />
                      </td>
                      <td className="px-3 py-2">
                        <DamageClassBadge damageClass={move.damageClass} />
                      </td>
                      {/* Null power/accuracy render "—": a status move has no
                          power, and a move with no accuracy never misses. */}
                      <td className="px-3 py-2 text-right tabular-nums">{movePower(move.power)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {moveStat(move.accuracy)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">
                        {moveStat(move.pp)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">
                        {move.generation ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {move.learnedByCount.toLocaleString()}
                      </td>
                      <td className="max-w-md px-3 py-2 text-xs text-muted">
                        <span className="line-clamp-2">
                          {move.effect ?? (move.ailment && move.ailment !== 'none'
                            ? `Causes ${slugLabel(move.ailment).toLowerCase()}`
                            : '—')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Paginator pagination={data.pagination} onChange={setPage} label="move" />
          </>
        )}
      </div>
    </div>
  );
}
