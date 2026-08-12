import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, toQueryString } from '../lib/api';
import { useApi, useDebounced } from '../lib/useApi';
import type { ActivityKind, ActivityListResponse } from '../lib/types';
import {
  Button,
  EmptyState,
  ErrorState,
  Loading,
  Paginator,
  Select,
  StatTile,
  TextInput,
  TypeBadge,
} from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { SavedViews } from '../components/SavedViews';
import { ACTIVITY_META, dexNumber, formatDate } from '../lib/format';

/** Sortable columns, keyed to the API's `sort` allow-list. */
const COLUMNS = [
  { key: 'pokemonId', label: '#', align: 'right' },
  { key: 'pokemon', label: 'Pokémon', align: 'left' },
  { key: null, label: 'Types', align: 'left' },
  { key: 'kind', label: 'Status', align: 'left' },
  { key: 'owner', label: 'Owner', align: 'left' },
  { key: 'createdAt', label: 'Set', align: 'left' },
  { key: 'updatedAt', label: 'Last updated', align: 'left' },
  { key: null, label: '', align: 'right' },
] as const;

export function ActivityPage() {
  // Seeded from ?trainerId= so the trainer dashboard can link straight to a
  // roster-scoped activity feed.
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [owner, setOwner] = useState('');
  const [trainerId, setTrainerId] = useState(() => searchParams.get('trainerId') ?? '');
  const [sort, setSort] = useState('updatedAt');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const debouncedSearch = useDebounced(search);

  const path = useMemo(
    () =>
      `/api/activity${toQueryString({
        search: debouncedSearch,
        kind,
        owner,
        trainerId,
        sort,
        direction,
        page,
        pageSize: 25,
      })}`,
    [debouncedSearch, kind, owner, trainerId, sort, direction, page],
  );

  const { data, loading, error, refetch } = useApi<ActivityListResponse>(path);
  const hasFilters = Boolean(search || kind || owner || trainerId);

  function toggleSort(key: string) {
    if (sort === key) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(key);
      // Timestamps are most useful newest-first; names ascending.
      setDirection(key === 'createdAt' || key === 'updatedAt' ? 'desc' : 'asc');
    }
    setPage(1);
  }

  async function removeFlag(id: number, label: string, pokemonName: string) {
    if (!window.confirm(`Remove the "${label}" flag from ${pokemonName}?`)) return;
    setBusyId(id);
    setActionError(null);
    try {
      await api.delete(`/api/activity/${id}`);
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not remove the flag');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1300px] px-8 py-7">
      <PageHeader
        title="Activity"
        description="Every status flag set across the collection. Flags are toggled from a Pokémon's profile."
      />

      {/* Unfiltered totals — these stay put while you filter the table. */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {(Object.keys(ACTIVITY_META) as ActivityKind[]).map((k) => (
          <StatTile
            key={k}
            label={ACTIVITY_META[k].label}
            value={data?.kindCounts?.[k] ?? 0}
            hint={ACTIVITY_META[k].hint}
          />
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <TextInput
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by Pokémon name…"
          aria-label="Search activity by Pokémon name"
          className="w-64"
        />

        <Select
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by status kind"
        >
          <option value="">All statuses</option>
          {(data?.kinds ?? []).map((k) => (
            <option key={k} value={k}>
              {ACTIVITY_META[k].label}
            </option>
          ))}
        </Select>

        <Select
          value={owner}
          onChange={(e) => {
            setOwner(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by owner"
        >
          <option value="">All owners</option>
          {(data?.owners ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>

        <Select
          value={trainerId}
          onChange={(e) => {
            setTrainerId(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by trainer"
        >
          <option value="">All trainers</option>
          {(data?.trainers ?? []).map((trainer) => (
            <option key={trainer.id} value={trainer.id}>
              {trainer.name}
            </option>
          ))}
        </Select>

        {hasFilters && (
          <Button
            onClick={() => {
              setSearch('');
              setKind('');
              setOwner('');
              setTrainerId('');
              setPage(1);
            }}
          >
            Clear filters
          </Button>
        )}

        <span className="ml-auto flex gap-2">
          <SavedViews
            storageKey="activity"
            current={{ search, kind, owner, trainerId, sort, direction }}
            hasActiveFilters={hasFilters}
            onApply={(state) => {
              setSearch(String(state.search ?? ''));
              setKind(String(state.kind ?? ''));
              setOwner(String(state.owner ?? ''));
              setTrainerId(String(state.trainerId ?? ''));
              setSort(String(state.sort ?? 'updatedAt'));
              setDirection(state.direction === 'asc' ? 'asc' : 'desc');
              setPage(1);
            }}
          />
        </span>
      </div>

      {actionError && (
        <p className="mb-3 text-sm text-status-critical">
          <span aria-hidden="true">▲ </span>
          {actionError}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
        {loading && !data ? (
          <div className="p-5">
            <Loading rows={8} label="Loading activity…" />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No activity matches those filters' : 'No status flags yet'}
            description={
              hasFilters
                ? 'Try a different search or clear the filters.'
                : 'Open a Pokémon profile and set a flag — Caught, Favorite, Wishlist, Flagged, or Reviewed — and it will appear here.'
            }
            action={
              !hasFilters && (
                <Link
                  to="/lookup"
                  className="rounded-md border border-hairline px-3 py-1.5 text-sm font-medium text-ink hover:bg-plane"
                >
                  Browse Pokémon
                </Link>
              )
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
                        key={column.label || 'actions'}
                        scope="col"
                        className={`px-3 py-2.5 font-medium ${column.align === 'right' ? 'text-right' : 'text-left'}`}
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
                  {data.data.map((row) => {
                    const meta = ACTIVITY_META[row.kind];
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-hairline/70 last:border-0 hover:bg-plane"
                      >
                        <td className="px-3 py-2 text-right tabular-nums text-muted">
                          {dexNumber(row.pokemonId)}
                        </td>
                        <td className="px-3 py-2">
                          <Link
                            to={`/pokemon/${row.pokemonId}`}
                            className="flex items-center gap-2 font-medium text-ink hover:text-brand"
                          >
                            {row.pokemonSpriteUrl && (
                              <img
                                src={row.pokemonSpriteUrl}
                                alt=""
                                width={32}
                                height={32}
                                loading="lazy"
                                className="h-8 w-8 shrink-0"
                              />
                            )}
                            {row.pokemonName}
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <TypeBadge type={row.pokemonType1} />
                            {row.pokemonType2 && <TypeBadge type={row.pokemonType2} />}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand-strong">
                            <span aria-hidden="true">{meta.icon}</span>
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted">{row.owner}</td>
                        <td className="px-3 py-2 text-muted">{formatDate(row.createdAt)}</td>
                        <td className="px-3 py-2 text-muted">
                          {formatDate(row.updatedAt)}
                          {row.updatedAt !== row.createdAt && (
                            <span className="ml-1 text-xs text-muted">(re-set)</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeFlag(row.id, meta.label, row.pokemonName)}
                            disabled={busyId === row.id}
                            className="text-xs text-muted hover:text-status-critical disabled:opacity-50"
                          >
                            {busyId === row.id ? 'Removing…' : 'Remove'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
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
