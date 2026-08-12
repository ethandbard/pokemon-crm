import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toQueryString } from '../lib/api';
import { useApi, useDebounced } from '../lib/useApi';
import type { FilterOptions, PokemonListResponse } from '../lib/types';
import {
  Button,
  EmptyState,
  ErrorState,
  Loading,
  Paginator,
  Select,
  TextInput,
  TypeBadge,
} from '../components/ui';
import { ACTIVITY_META, dexNumber, titleCase } from '../lib/format';
import { PageHeader } from '../components/PageHeader';

const COLUMNS = [
  { key: 'id', label: '#', numeric: true },
  { key: 'name', label: 'Name', numeric: false },
  { key: null, label: 'Types', numeric: false },
  { key: 'generation', label: 'Gen', numeric: true },
  { key: 'hp', label: 'HP', numeric: true },
  { key: 'attack', label: 'Atk', numeric: true },
  { key: 'defense', label: 'Def', numeric: true },
  { key: 'specialAttack', label: 'SpA', numeric: true },
  { key: 'specialDefense', label: 'SpD', numeric: true },
  { key: 'speed', label: 'Spe', numeric: true },
  { key: 'baseStatTotal', label: 'BST', numeric: true },
  { key: null, label: 'CRM', numeric: false },
] as const;

export function LookupPage() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [generation, setGeneration] = useState('');
  const [activity, setActivity] = useState('');
  const [sort, setSort] = useState('id');
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounced(search);

  const listPath = useMemo(
    () =>
      `/api/pokemon${toQueryString({
        search: debouncedSearch,
        type,
        generation,
        activity,
        sort,
        direction,
        page,
        pageSize: 25,
      })}`,
    [debouncedSearch, type, generation, activity, sort, direction, page],
  );

  const { data, loading, error, refetch } = useApi<PokemonListResponse>(listPath);
  const filters = useApi<FilterOptions>('/api/pokemon/filters');

  /** Clicking a header sorts by it; clicking the active header flips direction. */
  function toggleSort(key: string) {
    if (sort === key) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(key);
      setDirection('asc');
    }
    setPage(1);
  }

  /** Any filter change invalidates the current page number. */
  function withReset<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  const hasFilters = Boolean(search || type || generation || activity);

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-7">
      <PageHeader
        title="Pokémon Lookup"
        description="Search and filter the full National Pokédex. Select a row to open its profile."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <TextInput
          type="search"
          value={search}
          onChange={(e) => withReset(setSearch)(e.target.value)}
          placeholder="Search by name…"
          aria-label="Search Pokémon by name"
          className="w-64"
        />

        <Select
          value={type}
          onChange={(e) => withReset(setType)(e.target.value)}
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          {filters.data?.types.map((t) => (
            <option key={t} value={t}>
              {titleCase(t)}
            </option>
          ))}
        </Select>

        <Select
          value={generation}
          onChange={(e) => withReset(setGeneration)(e.target.value)}
          aria-label="Filter by generation"
        >
          <option value="">All generations</option>
          {filters.data?.generations.map((g) => (
            <option key={g} value={g}>
              Generation {g}
            </option>
          ))}
        </Select>

        <Select
          value={activity}
          onChange={(e) => withReset(setActivity)(e.target.value)}
          aria-label="Filter by status flag"
        >
          <option value="">Any status</option>
          {filters.data?.activityKinds.map((k) => (
            <option key={k} value={k}>
              {ACTIVITY_META[k].label}
            </option>
          ))}
        </Select>

        {hasFilters && (
          <Button
            onClick={() => {
              setSearch('');
              setType('');
              setGeneration('');
              setActivity('');
              setPage(1);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
        {loading && !data ? (
          <div className="p-5">
            <Loading rows={10} label="Loading Pokémon…" />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState
            title="No Pokémon match those filters"
            description={
              hasFilters
                ? 'Try a broader search or clear the filters.'
                : 'The pokemon table looks empty — run `npm run seed` to import from PokeAPI.'
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
                  {data.data.map((row) => (
                    <tr key={row.id} className="border-b border-hairline/70 last:border-0 hover:bg-plane">
                      <td className="px-3 py-2 text-right tabular-nums text-muted">
                        {dexNumber(row.id)}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          to={`/pokemon/${row.id}`}
                          className="flex items-center gap-2 font-medium text-ink hover:text-series-1"
                        >
                          {row.spriteUrl && (
                            <img
                              src={row.spriteUrl}
                              alt=""
                              width={32}
                              height={32}
                              loading="lazy"
                              className="h-8 w-8 shrink-0"
                            />
                          )}
                          {row.displayName}
                          {row.isLegendary && (
                            <span className="rounded bg-series-4/15 px-1.5 py-0.5 text-[10px] font-semibold text-ink-2">
                              LEGENDARY
                            </span>
                          )}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <TypeBadge type={row.type1} />
                          {row.type2 && <TypeBadge type={row.type2} />}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">{row.generation}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.hp}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.attack}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.defense}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.specialAttack}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.specialDefense}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.speed}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {row.baseStatTotal}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5 text-xs text-muted">
                          {row.noteCount > 0 && (
                            <span title={`${row.noteCount} note(s)`}>✎ {row.noteCount}</span>
                          )}
                          {row.activityKinds.map((kind) => (
                            <span key={kind} title={ACTIVITY_META[kind].label} aria-label={ACTIVITY_META[kind].label}>
                              {ACTIVITY_META[kind].icon}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Paginator
              page={data.pagination.page}
              totalPages={data.pagination.totalPages}
              total={data.pagination.total}
              onChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
