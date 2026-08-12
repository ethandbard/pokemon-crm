import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
import { BulkActionBar } from '../components/BulkActionBar';
import { SavedViews } from '../components/SavedViews';

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
  { key: null, label: 'Trainers', numeric: false },
  { key: null, label: 'CRM', numeric: false },
] as const;

export function LookupPage() {
  // Seeded from ?search= so links in from elsewhere (e.g. the profile's quick
  // search) land with the term already applied.
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const [type, setType] = useState('');
  const [generation, setGeneration] = useState('');
  const [activity, setActivity] = useState('');
  const [trainerId, setTrainerId] = useState(() => searchParams.get('trainerId') ?? '');
  const [sort, setSort] = useState('id');
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const debouncedSearch = useDebounced(search);

  /** Filter values a saved view captures and restores. */
  const viewState = { search, type, generation, activity, trainerId, sort, direction };

  function applyView(state: Record<string, string | number | undefined>) {
    setSearch(String(state.search ?? ''));
    setType(String(state.type ?? ''));
    setGeneration(String(state.generation ?? ''));
    setActivity(String(state.activity ?? ''));
    setTrainerId(String(state.trainerId ?? ''));
    setSort(String(state.sort ?? 'id'));
    setDirection(state.direction === 'desc' ? 'desc' : 'asc');
    setPage(1);
  }

  const listPath = useMemo(
    () =>
      `/api/pokemon${toQueryString({
        search: debouncedSearch,
        type,
        generation,
        activity,
        trainerId,
        sort,
        direction,
        page,
        pageSize: 25,
      })}`,
    [debouncedSearch, type, generation, activity, trainerId, sort, direction, page],
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

  /*
   * Selection spans pages: ids are kept in a Set rather than derived from the
   * current rows, so paging through and picking a few from each page works.
   * The header checkbox therefore reflects only *this page*.
   */
  const pageIds = data?.data.map((row) => row.id) ?? [];
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPageSelected = pageIds.some((id) => selected.has(id));

  function toggleRow(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage(checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of pageIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  const hasFilters = Boolean(search || type || generation || activity || trainerId);

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

        <Select
          value={trainerId}
          onChange={(e) => withReset(setTrainerId)(e.target.value)}
          aria-label="Filter by trainer"
        >
          <option value="">All trainers</option>
          {filters.data?.trainers.map((trainer) => (
            <option key={trainer.id} value={trainer.id}>
              {trainer.name}
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
              setTrainerId('');
              setPage(1);
            }}
          >
            Clear filters
          </Button>
        )}

        <span className="ml-auto flex gap-2">
          <SavedViews
            storageKey="lookup"
            current={viewState}
            onApply={applyView}
            hasActiveFilters={hasFilters}
          />
        </span>
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
            <BulkActionBar
              selectedIds={[...selected]}
              onClear={() => setSelected(new Set())}
              onDone={() => {
                setSelected(new Set());
                refetch();
              }}
            />

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline text-xs text-muted">
                    <th scope="col" className="w-9 px-3 py-2.5">
                      <input
                        type="checkbox"
                        aria-label="Select all rows on this page"
                        checked={allOnPageSelected}
                        // Partial selection reads as neither on nor off.
                        ref={(el) => {
                          if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected;
                        }}
                        onChange={(e) => toggleAllOnPage(e.target.checked)}
                        className="h-3.5 w-3.5 accent-[var(--color-brand)]"
                      />
                    </th>
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
                    <tr
                      key={row.id}
                      className={`border-b border-hairline/70 last:border-0 ${
                        selected.has(row.id) ? 'bg-brand/5' : 'hover:bg-plane'
                      }`}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.displayName}`}
                          checked={selected.has(row.id)}
                          onChange={() => toggleRow(row.id)}
                          className="h-3.5 w-3.5 accent-[var(--color-brand)]"
                        />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted">
                        {dexNumber(row.id)}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          to={`/pokemon/${row.id}`}
                          className="flex items-center gap-2 font-medium text-ink hover:text-brand"
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
                        {row.trainerNames.length === 0 ? (
                          <span className="text-xs text-muted">—</span>
                        ) : (
                          <Link
                            to={`/trainers${toQueryString({
                              trainerId: filters.data?.trainers.find(
                                (t) => t.name === row.trainerNames[0],
                              )?.id,
                            })}`}
                            className="text-xs text-ink-2 hover:text-brand"
                            title={row.trainerNames.join(', ')}
                          >
                            {row.trainerNames[0]}
                            {row.trainerNames.length > 1 && ` +${row.trainerNames.length - 1}`}
                          </Link>
                        )}
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
