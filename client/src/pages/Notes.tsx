import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toQueryString } from '../lib/api';
import { useApi, useDebounced, usePageClamp } from '../lib/useApi';
import type { NotesResponse } from '../lib/types';
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
import { PageHeader } from '../components/PageHeader';
import { NoteActions } from '../components/NoteEditor';
import { SavedViews } from '../components/SavedViews';
import { dexNumber, formatDate } from '../lib/format';

const SORT_OPTIONS = [
  { value: 'createdAt', label: 'Date created' },
  { value: 'updatedAt', label: 'Date updated' },
  { value: 'pokemon', label: 'Pokémon name' },
  { value: 'owner', label: 'Owner' },
] as const;

export function NotesPage() {
  // Seeded from ?trainerId= so the trainer dashboard can link straight to a
  // roster-scoped note feed.
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [owner, setOwner] = useState('');
  const [trainerId, setTrainerId] = useState(() => searchParams.get('trainerId') ?? '');
  const [sort, setSort] = useState<string>('createdAt');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounced(search);

  const path = useMemo(
    () =>
      `/api/notes${toQueryString({
        search: debouncedSearch,
        owner,
        trainerId,
        sort,
        direction,
        page,
        pageSize: 20,
      })}`,
    [debouncedSearch, owner, trainerId, sort, direction, page],
  );

  const { data, loading, error, refetch } = useApi<NotesResponse>(path);
  // Deleting the last note on a page would otherwise strand the feed on an
  // empty page that reads as "no notes match".
  usePageClamp(data?.pagination, setPage);
  const hasFilters = Boolean(search || owner || trainerId);

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-7">
      <PageHeader
        title="Notes"
        description="Every note across every Pokémon. Add notes from a Pokémon's profile."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <TextInput
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search note text…"
          aria-label="Search notes"
          className="w-64"
        />

        <Select
          value={owner}
          onChange={(e) => {
            setOwner(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by owner"
        >
          <option value="">All owners</option>
          {data?.owners.map((o) => (
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
          {data?.trainers.map((trainer) => (
            <option key={trainer.id} value={trainer.id}>
              {trainer.name}
            </option>
          ))}
        </Select>

        <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort notes by">
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              Sort: {option.label}
            </option>
          ))}
        </Select>

        <Button onClick={() => setDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}>
          {direction === 'asc' ? 'Ascending ▲' : 'Descending ▼'}
        </Button>

        {hasFilters && (
          <Button
            onClick={() => {
              setSearch('');
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
            storageKey="notes"
            current={{ search, owner, trainerId, sort, direction }}
            hasActiveFilters={hasFilters}
            onApply={(state) => {
              setSearch(String(state.search ?? ''));
              setOwner(String(state.owner ?? ''));
              setTrainerId(String(state.trainerId ?? ''));
              setSort(String(state.sort ?? 'createdAt'));
              setDirection(state.direction === 'asc' ? 'asc' : 'desc');
              setPage(1);
            }}
          />
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
        {loading && !data ? (
          <div className="p-5">
            <Loading rows={6} label="Loading notes…" />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No notes match those filters' : 'No notes yet'}
            description={
              hasFilters
                ? 'Try a different search term or clear the filters.'
                : 'Open any Pokémon profile and add your first note — it will show up here.'
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
            <ul className={loading ? 'opacity-60 transition-opacity' : undefined}>
              {data.data.map((note) => (
                <li key={note.id} className="border-b border-hairline last:border-0 p-5">
                  <div className="flex items-start gap-4">
                    <Link
                      to={`/pokemon/${note.pokemonId}`}
                      className="flex w-40 shrink-0 flex-col items-center gap-1.5 rounded-lg p-2 hover:bg-plane"
                    >
                      {note.pokemonSpriteUrl && (
                        <img
                          src={note.pokemonSpriteUrl}
                          alt=""
                          width={56}
                          height={56}
                          loading="lazy"
                          className="h-14 w-14"
                        />
                      )}
                      <span className="text-sm font-medium text-ink">{note.pokemonName}</span>
                      <span className="text-xs tabular-nums text-muted">
                        {dexNumber(note.pokemonId)}
                      </span>
                      <span className="flex gap-1">
                        <TypeBadge type={note.pokemonType1} />
                        {note.pokemonType2 && <TypeBadge type={note.pokemonType2} />}
                      </span>
                    </Link>

                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-wrap text-sm text-ink">{note.body}</p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-muted">
                          {note.owner} · created {formatDate(note.createdAt)}
                          {note.updatedAt !== note.createdAt &&
                            ` · updated ${formatDate(note.updatedAt)}`}
                        </p>
                        <NoteActions noteId={note.id} body={note.body} onChanged={refetch} />
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <Paginator pagination={data.pagination} onChange={setPage} label="note" />
          </>
        )}
      </div>
    </div>
  );
}
