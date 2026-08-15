import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toQueryString } from '../lib/api';
import { useApi, useDebounced, usePageClamp } from '../lib/useApi';
import type { FilterOptions, MoveDetailResponse, PokemonListResponse } from '../lib/types';
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
import { ACTIVITY_META, dexNumber, slugLabel, titleCase } from '../lib/format';
import { PageHeader } from '../components/PageHeader';
import { BulkActionBar } from '../components/BulkActionBar';
import { SavedViews } from '../components/SavedViews';
import { PAGE_CONTAINER } from '../lib/page';

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
  { key: null, label: 'Moves', numeric: true },
  { key: null, label: 'Trainers', numeric: false },
  { key: null, label: 'CRM', numeric: false },
] as const;

/** Values match the `evYield` enum on GET /api/pokemon. */
const EV_YIELD_OPTIONS = [
  { value: 'hp', label: 'HP' },
  { value: 'attack', label: 'Attack' },
  { value: 'defense', label: 'Defense' },
  { value: 'specialAttack', label: 'Sp. Atk' },
  { value: 'specialDefense', label: 'Sp. Def' },
  { value: 'speed', label: 'Speed' },
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
  // Species dimensions from the PokeAPI species endpoint. Kept behind a
  // disclosure: nine selects in one row is unreadable, and these are the
  // narrower questions you reach for after the primary five.
  // Set by the Moves page ("open the learners in Lookup"), never by a control
  // here — a select of 797 moves isn't a filter anyone can use. It renders as a
  // removable chip so it can't silently narrow the table.
  const [moveId, setMoveId] = useState(() => searchParams.get('moveId') ?? '');
  const [learnMethod, setLearnMethod] = useState(() => searchParams.get('learnMethod') ?? '');
  const [region, setRegion] = useState('');
  const [habitat, setHabitat] = useState('');
  const [shape, setShape] = useState('');
  const [eggGroup, setEggGroup] = useState('');
  const [growthRate, setGrowthRate] = useState('');
  const [evYield, setEvYield] = useState('');
  const [baby, setBaby] = useState('');
  const [showMore, setShowMore] = useState(false);

  const [sort, setSort] = useState('id');
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const debouncedSearch = useDebounced(search);

  /** Filter values a saved view captures and restores. */
  const viewState = {
    search,
    type,
    generation,
    activity,
    trainerId,
    region,
    habitat,
    shape,
    eggGroup,
    growthRate,
    evYield,
    baby,
    sort,
    direction,
  };

  function applyView(state: Record<string, string | number | undefined>) {
    setSearch(String(state.search ?? ''));
    setType(String(state.type ?? ''));
    setGeneration(String(state.generation ?? ''));
    setActivity(String(state.activity ?? ''));
    setTrainerId(String(state.trainerId ?? ''));
    setRegion(String(state.region ?? ''));
    setHabitat(String(state.habitat ?? ''));
    setShape(String(state.shape ?? ''));
    setEggGroup(String(state.eggGroup ?? ''));
    setGrowthRate(String(state.growthRate ?? ''));
    setEvYield(String(state.evYield ?? ''));
    setBaby(String(state.baby ?? ''));
    setSort(String(state.sort ?? 'id'));
    setDirection(state.direction === 'desc' ? 'desc' : 'asc');
    setPage(1);
    // A saved view carrying species filters must not restore them into a
    // collapsed panel, or the row count won't match the visible controls.
    if (state.region || state.habitat || state.shape || state.eggGroup || state.growthRate || state.evYield || state.baby) {
      setShowMore(true);
    }
  }

  const listPath = useMemo(
    () =>
      `/api/pokemon${toQueryString({
        search: debouncedSearch,
        type,
        generation,
        activity,
        trainerId,
        moveId,
        learnMethod,
        region,
        habitat,
        shape,
        eggGroup,
        growthRate,
        evYield,
        baby,
        sort,
        direction,
        page,
        pageSize: 25,
      })}`,
    [
      debouncedSearch,
      type,
      generation,
      activity,
      trainerId,
      moveId,
      learnMethod,
      region,
      habitat,
      shape,
      eggGroup,
      growthRate,
      evYield,
      baby,
      sort,
      direction,
      page,
    ],
  );

  const { data, loading, error, refetch } = useApi<PokemonListResponse>(listPath);
  const filters = useApi<FilterOptions>('/api/pokemon/filters');
  // Null path skips the fetch entirely when no move filter is set — see
  // CLAUDE.md § frontend conventions.
  const activeMove = useApi<MoveDetailResponse>(
    moveId ? `/api/moves/${moveId}?pageSize=1` : null,
  );

  usePageClamp(data?.pagination, setPage);

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

  const speciesFilterCount = [region, habitat, shape, eggGroup, growthRate, evYield, baby].filter(
    Boolean,
  ).length;
  const hasFilters = Boolean(
    search || type || generation || activity || trainerId || moveId || speciesFilterCount,
  );

  function clearFilters() {
    setSearch('');
    setType('');
    setGeneration('');
    setActivity('');
    setTrainerId('');
    setMoveId('');
    setLearnMethod('');
    setRegion('');
    setHabitat('');
    setShape('');
    setEggGroup('');
    setGrowthRate('');
    setEvYield('');
    setBaby('');
    setPage(1);
  }

  return (
    <div className={PAGE_CONTAINER}>
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

        <Button
          onClick={() => setShowMore((open) => !open)}
          aria-expanded={showMore}
          title="Region, habitat, egg group, shape, growth rate, EV yield"
        >
          {showMore ? 'Fewer filters' : 'More filters'}
          {speciesFilterCount > 0 && !showMore && ` (${speciesFilterCount})`}
        </Button>

        {hasFilters && <Button onClick={clearFilters}>Clear filters</Button>}

        <span className="ml-auto flex gap-2">
          <SavedViews
            storageKey="lookup"
            current={viewState}
            onApply={applyView}
            hasActiveFilters={hasFilters}
          />
        </span>
      </div>

      {/* The move filter has no control of its own — it arrives by link, so it
          needs to announce itself and be removable in one click. */}
      {moveId && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand bg-brand/10 px-3 py-1 text-xs font-medium text-brand-strong">
            Learns{' '}
            <Link to={`/moves/${moveId}`} className="underline underline-offset-2">
              {activeMove.data?.move.displayName ?? `move #${moveId}`}
            </Link>
            {learnMethod && ` by ${slugLabel(learnMethod)}`}
            <button
              type="button"
              onClick={() => {
                setMoveId('');
                setLearnMethod('');
                setPage(1);
              }}
              aria-label="Remove the move filter"
              className="ml-0.5 text-sm leading-none hover:text-ink"
            >
              ×
            </button>
          </span>
          {activeMove.data && (
            <span className="text-xs text-muted">
              {activeMove.data.move.learnedByCount.toLocaleString()} species learn it dex-wide
            </span>
          )}
        </div>
      )}

      {showMore && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-plane p-3">
          <Select
            value={region}
            onChange={(e) => withReset(setRegion)(e.target.value)}
            aria-label="Filter by region"
          >
            <option value="">All regions</option>
            {filters.data?.regions.map((r) => (
              <option key={r} value={r}>
                {r} dex
              </option>
            ))}
          </Select>

          <Select
            value={habitat}
            onChange={(e) => withReset(setHabitat)(e.target.value)}
            aria-label="Filter by habitat"
          >
            <option value="">Any habitat</option>
            {filters.data?.habitats.map((h) => (
              <option key={h} value={h}>
                {slugLabel(h)}
              </option>
            ))}
          </Select>

          <Select
            value={eggGroup}
            onChange={(e) => withReset(setEggGroup)(e.target.value)}
            aria-label="Filter by egg group"
          >
            <option value="">Any egg group</option>
            {filters.data?.eggGroups.map((g) => (
              <option key={g} value={g}>
                {slugLabel(g)}
              </option>
            ))}
          </Select>

          <Select
            value={shape}
            onChange={(e) => withReset(setShape)(e.target.value)}
            aria-label="Filter by shape"
          >
            <option value="">Any shape</option>
            {filters.data?.shapes.map((s) => (
              <option key={s} value={s}>
                {slugLabel(s)}
              </option>
            ))}
          </Select>

          <Select
            value={growthRate}
            onChange={(e) => withReset(setGrowthRate)(e.target.value)}
            aria-label="Filter by growth rate"
          >
            <option value="">Any growth rate</option>
            {filters.data?.growthRates.map((g) => (
              <option key={g} value={g}>
                {slugLabel(g)}
              </option>
            ))}
          </Select>

          <Select
            value={evYield}
            onChange={(e) => withReset(setEvYield)(e.target.value)}
            aria-label="Filter by EV yield"
          >
            <option value="">Any EV yield</option>
            {EV_YIELD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                Trains {option.label}
              </option>
            ))}
          </Select>

          <Select
            value={baby}
            onChange={(e) => withReset(setBaby)(e.target.value)}
            aria-label="Filter by baby species"
          >
            <option value="">Baby or not</option>
            <option value="true">Baby only</option>
            <option value="false">Exclude babies</option>
          </Select>

          {/* Stated rather than left to be discovered from an empty table:
              PokeAPI only assigns habitats to generations 1–3. */}
          <p className="basis-full text-xs text-muted">
            Habitat is only recorded for generations 1–3 in PokeAPI, so filtering by it excludes
            later generations entirely.
          </p>
        </div>
      )}

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
                      <td className="px-3 py-2 text-right tabular-nums text-muted">
                        {row.moveCount}
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
              pagination={data.pagination}
              onChange={setPage}
              label="Pokémon"
              labelPlural="Pokémon"
            />
          </>
        )}
      </div>
    </div>
  );
}
