import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toQueryString } from '../lib/api';
import { useApi, useDebounced } from '../lib/useApi';
import type { TrainerDashboardResponse, TrainerListItem } from '../lib/types';
import {
  Card,
  EmptyState,
  ErrorState,
  Loading,
  StatTile,
  TextInput,
  TypeBadge,
} from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import {
  ACTIVITY_META,
  ROSTER_STATUS_META,
  dexNumber,
  formatDate,
  titleCase,
} from '../lib/format';

export function TrainersPage() {
  // The selected trainer lives in the URL so a dashboard can be linked to
  // directly (the Profile page's trainer chips do exactly that).
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('trainerId');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);

  const listPath = useMemo(
    () => `/api/trainers${toQueryString({ search: debouncedSearch })}`,
    [debouncedSearch],
  );
  const list = useApi<{ data: TrainerListItem[] }>(listPath);

  function selectTrainer(id: string) {
    if (id) setSearchParams({ trainerId: id });
    else setSearchParams({});
  }

  return (
    <div className="mx-auto max-w-[1300px] px-8 py-7">
      <PageHeader
        title="Trainers"
        description="Each trainer carries a roster of Pokémon — the advising analogue of an advisor's caseload. Pick a trainer to open their dashboard."
      />

      {/* ---- Selector: search + dropdown, side by side ---- */}
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="trainer-search" className="mb-1 block text-xs font-medium text-muted">
            Search trainers
          </label>
          <TextInput
            id="trainer-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, region, or specialty…"
            className="w-64"
          />
        </div>

        <div>
          <label htmlFor="trainer-select" className="mb-1 block text-xs font-medium text-muted">
            Select a trainer
          </label>
          <select
            id="trainer-select"
            value={selectedId ?? ''}
            onChange={(e) => selectTrainer(e.target.value)}
            disabled={list.loading && !list.data}
            className="w-72 rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-50"
          >
            <option value="">— Choose a trainer —</option>
            {list.data?.data.map((trainer) => (
              <option key={trainer.id} value={trainer.id}>
                {trainer.name} · {trainer.rosterSize} on roster
              </option>
            ))}
          </select>
        </div>

        {list.data && (
          <p className="pb-1.5 text-xs text-muted">
            {list.data.data.length} {list.data.data.length === 1 ? 'trainer' : 'trainers'}
            {debouncedSearch && ` matching “${debouncedSearch}”`}
          </p>
        )}
      </div>

      {list.loading && !list.data ? (
        <Loading label="Loading trainers…" />
      ) : list.error ? (
        <ErrorState message={list.error} onRetry={list.refetch} />
      ) : !list.data || list.data.data.length === 0 ? (
        <div className="rounded-xl border border-hairline bg-surface">
          <EmptyState
            title={debouncedSearch ? 'No trainers match that search' : 'No trainers yet'}
            description={
              debouncedSearch
                ? 'Try a different name, region, or specialty.'
                : 'Run `npm run seed:trainers` to create trainers and their rosters.'
            }
          />
        </div>
      ) : selectedId ? (
        <TrainerDashboard trainerId={selectedId} />
      ) : (
        // No selection yet — show the roster cards as a browsable index.
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {list.data.data.map((trainer) => (
            <button
              key={trainer.id}
              type="button"
              onClick={() => selectTrainer(String(trainer.id))}
              className="rounded-xl border border-hairline bg-surface p-5 text-left transition-colors hover:border-brand focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-ink">{trainer.name}</h3>
                  <p className="mt-0.5 text-xs text-muted">
                    {trainer.region ?? 'Unknown region'}
                    {trainer.specialty && ` · ${titleCase(trainer.specialty)} specialist`}
                  </p>
                </div>
                {trainer.specialty && <TypeBadge type={trainer.specialty} />}
              </div>

              {trainer.bio && <p className="mt-3 text-xs text-ink-2">{trainer.bio}</p>}

              <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-hairline pt-3 text-center">
                <div>
                  <dt className="text-[11px] text-muted">Roster</dt>
                  <dd className="text-sm font-semibold tabular-nums text-ink">
                    {trainer.rosterSize}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted">Active</dt>
                  <dd className="text-sm font-semibold tabular-nums text-ink">
                    {trainer.activeCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted">Avg BST</dt>
                  <dd className="text-sm font-semibold tabular-nums text-ink">
                    {trainer.avgBaseStatTotal}
                  </dd>
                </div>
              </dl>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const axisProps = {
  axisLine: false,
  tickLine: false,
  stroke: 'var(--color-muted)',
} as const;

const tooltipProps = {
  cursor: { fill: 'var(--color-plane)' },
  contentStyle: {
    borderRadius: 8,
    border: '1px solid var(--color-hairline)',
    backgroundColor: 'var(--color-surface)',
    fontSize: 12,
  },
} as const;

function TrainerDashboard({ trainerId }: { trainerId: string }) {
  const { data, loading, error, refetch } = useApi<TrainerDashboardResponse>(
    `/api/trainers/${trainerId}`,
  );

  if (loading && !data) return <Loading label="Loading roster…" />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data) return null;

  const { trainer, roster, summary, typeBreakdown, statAverages, notes, activity } = data;

  const typeData = typeBreakdown.map((row) => ({ ...row, type: titleCase(row.type) }));

  return (
    <div className="space-y-5">
      {/* ---- Trainer identity ---- */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-ink">{trainer.name}</h2>
            <p className="mt-0.5 text-sm text-muted">
              {trainer.region ?? 'Unknown region'}
              {trainer.specialty && ` · ${titleCase(trainer.specialty)} specialist`}
              {trainer.email && ` · ${trainer.email}`}
            </p>
            {trainer.bio && <p className="mt-2 max-w-2xl text-sm text-ink-2">{trainer.bio}</p>}
          </div>
          <Link
            to={`/lookup${toQueryString({ trainerId: trainer.id })}`}
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-plane"
          >
            Open roster in Lookup →
          </Link>
        </div>
      </Card>

      {/* ---- Roster stats ---- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Roster size" value={summary?.roster_size ?? 0} />
        <StatTile label="Active" value={summary?.active_count ?? 0} hint="excludes retired" />
        <StatTile label="Mean BST" value={summary?.avg_base_stat_total ?? 0} />
        <StatTile label="Best BST" value={summary?.max_base_stat_total ?? 0} />
        <StatTile label="Mean level" value={summary?.avg_level ?? 0} />
        <StatTile label="Types covered" value={summary?.distinct_types ?? 0} hint="of 18" />
      </div>

      {roster.length === 0 ? (
        <div className="rounded-xl border border-hairline bg-surface">
          <EmptyState
            title="This trainer has an empty roster"
            description="No Pokémon are assigned yet, so there are no stats to show."
          />
        </div>
      ) : (
        <>
          {/* ---- Roster table ---- */}
          <Card
            title="Roster"
            subtitle={`${roster.length} Pokémon — select any row to open its profile`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline text-xs text-muted">
                    <th scope="col" className="px-2 py-2 text-right font-medium">
                      #
                    </th>
                    <th scope="col" className="px-2 py-2 text-left font-medium">
                      Pokémon
                    </th>
                    <th scope="col" className="px-2 py-2 text-left font-medium">
                      Types
                    </th>
                    <th scope="col" className="px-2 py-2 text-left font-medium">
                      Status
                    </th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">
                      Level
                    </th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">
                      BST
                    </th>
                    <th scope="col" className="px-2 py-2 text-left font-medium">
                      CRM
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((member) => {
                    const meta = ROSTER_STATUS_META[member.status];
                    return (
                      <tr
                        key={member.id}
                        className="border-b border-hairline/70 last:border-0 hover:bg-plane"
                      >
                        <td className="px-2 py-2 text-right tabular-nums text-muted">
                          {dexNumber(member.pokemonId)}
                        </td>
                        <td className="px-2 py-2">
                          <Link
                            to={`/pokemon/${member.pokemonId}`}
                            className="flex items-center gap-2 font-medium text-ink hover:text-brand"
                          >
                            {member.spriteUrl && (
                              <img
                                src={member.spriteUrl}
                                alt=""
                                width={32}
                                height={32}
                                loading="lazy"
                                className="h-8 w-8 shrink-0"
                              />
                            )}
                            <span>
                              {member.nickname ?? member.displayName}
                              {member.nickname && (
                                <span className="ml-1.5 text-xs font-normal text-muted">
                                  ({member.displayName})
                                </span>
                              )}
                            </span>
                          </Link>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex gap-1">
                            <TypeBadge type={member.type1} />
                            {member.type2 && <TypeBadge type={member.type2} />}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <span
                            title={meta.hint}
                            className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.className}`}
                          >
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-ink">
                          {member.level ?? '—'}
                        </td>
                        <td className="px-2 py-2 text-right font-medium tabular-nums text-ink">
                          {member.baseStatTotal}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1.5 text-xs text-muted">
                            {member.noteCount > 0 && <span>✎ {member.noteCount}</span>}
                            {member.activityKinds.map((kind) => (
                              <span key={kind} title={ACTIVITY_META[kind].label}>
                                {ACTIVITY_META[kind].icon}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ---- Roster charts ---- */}
          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Type coverage" subtitle="Roster Pokémon per type, counting both typings">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={typeData} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
                    <CartesianGrid vertical={false} stroke="var(--color-hairline)" />
                    <XAxis dataKey="type" {...axisProps} angle={-35} textAnchor="end" height={58} />
                    <YAxis {...axisProps} allowDecimals={false} />
                    <Tooltip {...tooltipProps} />
                    <Bar dataKey="count" name="Pokémon" fill="var(--color-series-1)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Mean base stats" subtitle="Averaged across this roster">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statAverages} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
                    <CartesianGrid vertical={false} stroke="var(--color-hairline)" />
                    <XAxis dataKey="stat" {...axisProps} />
                    <YAxis {...axisProps} />
                    <Tooltip {...tooltipProps} />
                    <Bar dataKey="avg" name="Mean" fill="var(--color-series-1)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </>
      )}

      {/* ---- Note history across the roster ---- */}
      <Card
        title="Note history"
        subtitle="Notes on any Pokémon in this roster"
        actions={
          <Link to="/notes" className="text-xs font-medium text-brand hover:underline">
            All notes →
          </Link>
        }
      >
        {notes.length === 0 ? (
          <EmptyState
            title="No notes on this roster"
            description="Open a roster Pokémon's profile and add a note — it will show up here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs text-muted">
                  <th scope="col" className="px-2 py-2 text-left font-medium">
                    Pokémon
                  </th>
                  <th scope="col" className="px-2 py-2 text-left font-medium">
                    Note
                  </th>
                  <th scope="col" className="px-2 py-2 text-left font-medium">
                    Owner
                  </th>
                  <th scope="col" className="px-2 py-2 text-left font-medium">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody>
                {notes.map((note) => (
                  <tr key={note.id} className="border-b border-hairline/70 last:border-0 hover:bg-plane">
                    <td className="px-2 py-2 whitespace-nowrap">
                      <Link
                        to={`/pokemon/${note.pokemonId}`}
                        className="flex items-center gap-2 font-medium text-ink hover:text-brand"
                      >
                        {note.pokemonSpriteUrl && (
                          <img src={note.pokemonSpriteUrl} alt="" width={28} height={28} className="h-7 w-7" />
                        )}
                        {note.nickname ?? note.pokemonName}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-ink">{note.body}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-muted">{note.owner}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-muted">
                      {formatDate(note.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ---- Activity history across the roster ---- */}
      <Card
        title="Activity history"
        subtitle="Status flags on any Pokémon in this roster"
        actions={
          <Link to="/activity" className="text-xs font-medium text-brand hover:underline">
            All activity →
          </Link>
        }
      >
        {activity.length === 0 ? (
          <EmptyState
            title="No activity on this roster"
            description="Set a status flag on a roster Pokémon's profile and it will be logged here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs text-muted">
                  <th scope="col" className="px-2 py-2 text-left font-medium">
                    Pokémon
                  </th>
                  <th scope="col" className="px-2 py-2 text-left font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-2 py-2 text-left font-medium">
                    Owner
                  </th>
                  <th scope="col" className="px-2 py-2 text-left font-medium">
                    Set
                  </th>
                  <th scope="col" className="px-2 py-2 text-left font-medium">
                    Last updated
                  </th>
                </tr>
              </thead>
              <tbody>
                {activity.map((entry) => {
                  const meta = ACTIVITY_META[entry.kind];
                  return (
                    <tr key={entry.id} className="border-b border-hairline/70 last:border-0 hover:bg-plane">
                      <td className="px-2 py-2 whitespace-nowrap">
                        <Link
                          to={`/pokemon/${entry.pokemonId}`}
                          className="flex items-center gap-2 font-medium text-ink hover:text-brand"
                        >
                          {entry.pokemonSpriteUrl && (
                            <img src={entry.pokemonSpriteUrl} alt="" width={28} height={28} className="h-7 w-7" />
                          )}
                          {entry.nickname ?? entry.pokemonName}
                        </Link>
                      </td>
                      <td className="px-2 py-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand-strong">
                          <span aria-hidden="true">{meta.icon}</span>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-muted">{entry.owner}</td>
                      <td className="px-2 py-2 whitespace-nowrap text-muted">
                        {formatDate(entry.createdAt)}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-muted">
                        {formatDate(entry.updatedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
