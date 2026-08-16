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
import { useCurrentUser } from '../lib/useCurrentUser';
import { dexNumber, formatDate } from '../lib/format';
import { PAGE_CONTAINER } from '../lib/page';

/**
 * `key` is the API's `sort` value; a column without one doesn't sort. Kept in
 * step with the SORTABLE allow-list in `server/src/routes/notes.ts`.
 */
const COLUMNS: { key: string | null; label: string; align?: 'right' }[] = [
  { key: 'pokemon', label: 'Pokémon' },
  { key: null, label: 'Note' },
  { key: 'owner', label: 'Author' },
  { key: 'createdAt', label: 'Created' },
  { key: 'updatedAt', label: 'Updated' },
  { key: null, label: '', align: 'right' },
];

/**
 * Marks the searched term inside a result so it's obvious why a row matched —
 * which matters here because the search spans both the note text and the
 * Pokémon's name, and the hit is often in the column you weren't reading.
 */
function Highlight({ text, term }: { text: string; term: string }) {
  const needle = term.trim();
  if (!needle) return <>{text}</>;

  // The term is raw user input, so escape it before it becomes a pattern.
  const pattern = new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, i) =>
        // String.split with one capture group puts the matches at odd indices.
        i % 2 === 1 ? (
          <mark key={i} className="rounded-sm bg-brand/15 px-0.5 text-ink">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

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
  const { email: actingEmail, labelFor } = useCurrentUser();

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

  return (
    <div className={PAGE_CONTAINER}>
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
          placeholder="Search note text or Pokémon…"
          aria-label="Search note text or Pokémon name"
          className="w-72"
        />

        <Select
          value={owner}
          onChange={(e) => {
            setOwner(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by author"
        >
          <option value="">All authors</option>
          {data?.owners.map((o) => (
            <option key={o} value={o}>
              {labelFor(o)}
              {o === actingEmail ? ' (me)' : ''}
            </option>
          ))}
        </Select>

        {/*
         * "Mine" is the one owner filter worth a click rather than a dropdown
         * hunt — it's the question you ask most, and it re-answers itself when
         * you switch user.
         */}
        <Button
          onClick={() => {
            setOwner(owner === actingEmail ? '' : (actingEmail ?? ''));
            setPage(1);
          }}
          variant={owner && owner === actingEmail ? 'primary' : 'secondary'}
          aria-pressed={Boolean(owner) && owner === actingEmail}
          disabled={!actingEmail}
        >
          Only mine
        </Button>

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

        {/* Sorting lives on the column headers, as it does on every other
            table in the app — no sort dropdown here. */}

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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline text-xs text-muted">
                    {COLUMNS.map((column) => {
                      // Bound to a local so the narrowing survives into the
                      // deferred onClick closure.
                      const sortKey = column.key;
                      const isActive = sortKey !== null && sort === sortKey;

                      return (
                        <th
                          key={column.label || 'actions'}
                          scope="col"
                          aria-sort={
                            isActive ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'
                          }
                          // Padding goes on the button for sortable columns so
                          // the whole cell is the hit target, not just the label.
                          className={`font-medium ${sortKey ? 'p-0' : 'px-4 py-2.5'} ${
                            column.align === 'right' ? 'text-right' : 'text-left'
                          }`}
                        >
                          {sortKey ? (
                            <button
                              type="button"
                              onClick={() => toggleSort(sortKey)}
                              aria-label={`Sort by ${column.label}`}
                              className={`flex w-full items-center gap-1 px-4 py-2.5 hover:text-ink ${
                                isActive ? 'text-ink' : ''
                              }`}
                            >
                              {column.label}
                              <span aria-hidden="true" className="w-2 text-[9px] text-brand-strong">
                                {isActive ? (direction === 'asc' ? '▲' : '▼') : ''}
                              </span>
                            </button>
                          ) : (
                            column.label
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className={loading ? 'opacity-60 transition-opacity' : undefined}>
                  {data.data.map((note) => (
                    <tr key={note.id} className="border-b border-hairline last:border-0 align-top">
                      <td className="px-4 py-3">
                        <Link
                          to={`/pokemon/${note.pokemonId}`}
                          className="-m-1 flex items-center gap-2.5 rounded-lg p-1 hover:bg-plane"
                        >
                          {note.pokemonSpriteUrl && (
                            <img
                              src={note.pokemonSpriteUrl}
                              alt=""
                              width={36}
                              height={36}
                              loading="lazy"
                              className="h-9 w-9 shrink-0"
                            />
                          )}
                          <span className="min-w-0">
                            <span className="flex items-baseline gap-1.5">
                              <span className="truncate font-medium text-ink">
                                <Highlight text={note.pokemonName} term={debouncedSearch} />
                              </span>
                              <span className="shrink-0 text-[11px] tabular-nums text-muted">
                                {dexNumber(note.pokemonId)}
                              </span>
                            </span>
                            <span className="mt-1 flex gap-1">
                              <TypeBadge type={note.pokemonType1} />
                              {note.pokemonType2 && <TypeBadge type={note.pokemonType2} />}
                            </span>
                          </span>
                        </Link>
                      </td>

                      <td className="px-4 py-3">
                        <p className="whitespace-pre-wrap text-ink">
                          <Highlight text={note.body} term={debouncedSearch} />
                        </p>
                      </td>

                      {/* The identity and timestamp columns stay on one line —
                          the table already scrolls sideways when it must, and
                          wrapping a date over three lines just makes tall rows
                          out of the columns nobody is reading closely. */}
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">
                        <span title={note.owner}>{labelFor(note.owner)}</span>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-muted">
                        {formatDate(note.createdAt)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-muted">
                        {/* An unedited note repeats its created date here, which
                            reads as noise — say so instead. */}
                        {note.updatedAt === note.createdAt ? (
                          <span className="text-muted/70">—</span>
                        ) : (
                          formatDate(note.updatedAt)
                        )}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <NoteActions noteId={note.id} body={note.body} onChanged={refetch} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Paginator pagination={data.pagination} onChange={setPage} label="note" />
          </>
        )}
      </div>
    </div>
  );
}
