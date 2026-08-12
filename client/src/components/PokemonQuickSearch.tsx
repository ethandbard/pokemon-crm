import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toQueryString } from '../lib/api';
import { useApi, useDebounced } from '../lib/useApi';
import type { PokemonListResponse } from '../lib/types';
import { EmptyState, ErrorState, Loading, TextInput, TypeBadge } from './ui';
import { dexNumber } from '../lib/format';

const RESULT_LIMIT = 8;

/**
 * Compact lookup table for jumping between Pokémon without leaving the profile.
 * Deliberately a trimmed version of the Lookup page's table — same data, same
 * endpoint, just the columns that fit in a sidebar-width card.
 *
 * `currentId` marks the Pokémon already open so the row reads as "you are here"
 * rather than looking like a dead link.
 */
export function PokemonQuickSearch({ currentId }: { currentId?: number }) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);

  const path = useMemo(
    () =>
      `/api/pokemon${toQueryString({
        search: debouncedSearch,
        pageSize: RESULT_LIMIT,
        sort: 'id',
        direction: 'asc',
      })}`,
    [debouncedSearch],
  );

  const { data, loading, error, refetch } = useApi<PokemonListResponse>(path);
  const navigate = useNavigate();

  /** Enter jumps straight to the first result — the common case when typing a name. */
  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const first = data?.data.find((row) => row.id !== currentId) ?? data?.data[0];
    if (first) navigate(`/pokemon/${first.id}`);
  }

  const total = data?.pagination.total ?? 0;

  return (
    <div>
      <form onSubmit={onSubmit}>
        <label htmlFor="quick-search" className="sr-only">
          Search for another Pokémon
        </label>
        <TextInput
          id="quick-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Jump to another Pokémon…"
          className="w-full"
        />
      </form>

      <div className="mt-3">
        {loading && !data ? (
          <Loading rows={4} label="Searching…" />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : !data || data.data.length === 0 ? (
          <EmptyState
            title="No matches"
            description={`Nothing matches “${debouncedSearch}”. Try a shorter search.`}
          />
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="sr-only">
                <tr>
                  <th scope="col">Dex number</th>
                  <th scope="col">Name</th>
                  <th scope="col">Types</th>
                  <th scope="col">Base stat total</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((row) => {
                  const isCurrent = row.id === currentId;
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-hairline/70 last:border-0 ${
                        isCurrent ? 'bg-brand/5' : 'hover:bg-plane'
                      }`}
                    >
                      <td className="py-1.5 pr-2 text-right text-xs tabular-nums text-muted">
                        {dexNumber(row.id)}
                      </td>
                      <td className="py-1.5">
                        {isCurrent ? (
                          <span className="flex items-center gap-2 font-medium text-brand-strong">
                            {row.spriteUrl && (
                              <img src={row.spriteUrl} alt="" width={28} height={28} className="h-7 w-7" />
                            )}
                            {row.displayName}
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                              viewing
                            </span>
                          </span>
                        ) : (
                          <Link
                            to={`/pokemon/${row.id}`}
                            className="flex items-center gap-2 font-medium text-ink hover:text-brand"
                          >
                            {row.spriteUrl && (
                              <img
                                src={row.spriteUrl}
                                alt=""
                                width={28}
                                height={28}
                                loading="lazy"
                                className="h-7 w-7"
                              />
                            )}
                            {row.displayName}
                          </Link>
                        )}
                      </td>
                      <td className="py-1.5">
                        <span className="flex gap-1">
                          <TypeBadge type={row.type1} />
                          {row.type2 && <TypeBadge type={row.type2} />}
                        </span>
                      </td>
                      <td className="py-1.5 text-right text-xs tabular-nums text-muted">
                        {row.baseStatTotal}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {total > RESULT_LIMIT && (
              <p className="mt-3 text-xs text-muted">
                Showing {RESULT_LIMIT} of {total.toLocaleString()} matches —{' '}
                <Link
                  to={`/lookup${toQueryString({ search: debouncedSearch })}`}
                  className="text-brand hover:underline"
                >
                  see all in Lookup
                </Link>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
