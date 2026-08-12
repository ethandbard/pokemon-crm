import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useApi } from '../lib/useApi';
import { api, toQueryString } from '../lib/api';
import type { ActivityKind, PokemonProfileResponse } from '../lib/types';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Loading,
  StatTile,
  TypeBadge,
} from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { NoteActions, NoteComposer } from '../components/NoteEditor';
import { PokemonQuickSearch } from '../components/PokemonQuickSearch';
import {
  ACTIVITY_META,
  ROSTER_STATUS_META,
  dexNumber,
  formatDate,
  formatHeight,
  formatWeight,
  titleCase,
} from '../lib/format';

const ACTIVITY_ORDER: ActivityKind[] = ['caught', 'favorite', 'wishlist', 'flagged', 'reviewed'];

/** The six base stats, in the order the games present them. */
const STAT_FIELDS = [
  { key: 'hp', label: 'HP' },
  { key: 'attack', label: 'Attack' },
  { key: 'defense', label: 'Defense' },
  { key: 'specialAttack', label: 'Sp. Atk' },
  { key: 'specialDefense', label: 'Sp. Def' },
  { key: 'speed', label: 'Speed' },
] as const;

export function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useApi<PokemonProfileResponse>(`/api/pokemon/${id}`);
  const [togglingKind, setTogglingKind] = useState<ActivityKind | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-[1200px] px-8 py-7">
        <Loading label="Loading profile…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[1200px] px-8 py-7">
        <ErrorState message={error} onRetry={refetch} />
      </div>
    );
  }

  if (!data) return null;

  const { pokemon, notes, activity, neighbours, ranking, trainers } = data;
  const activeKinds = new Set(activity.map((a) => a.kind));
  const lastReviewed = activity.find((a) => a.kind === 'reviewed')?.updatedAt ?? null;

  const statData = STAT_FIELDS.map((field) => ({
    label: field.label,
    value: pokemon[field.key],
  }));

  async function toggleActivity(kind: ActivityKind) {
    setTogglingKind(kind);
    setActivityError(null);
    try {
      await api.post('/api/activity/toggle', { pokemonId: pokemon.id, kind });
      refetch();
    } catch (err) {
      setActivityError(err instanceof Error ? err.message : 'Could not update the status');
    } finally {
      setTogglingKind(null);
    }
  }

  /** Removes a single log entry, which also clears the matching status flag. */
  async function removeActivity(activityId: number, label: string) {
    if (!window.confirm(`Remove the "${label}" entry from ${pokemon.displayName}'s log?`)) return;
    setRemovingId(activityId);
    setActivityError(null);
    try {
      await api.delete(`/api/activity/${activityId}`);
      refetch();
    } catch (err) {
      setActivityError(err instanceof Error ? err.message : 'Could not remove the entry');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] px-8 py-7">
      <PageHeader
        title={pokemon.displayName}
        description={`${dexNumber(pokemon.id)} · Generation ${pokemon.generation}`}
        actions={
          <div className="flex gap-2">
            <Button
              onClick={() => navigate(`/pokemon/${neighbours.previous?.id}`)}
              disabled={!neighbours.previous}
            >
              ← {neighbours.previous?.displayName ?? 'Start'}
            </Button>
            <Button
              onClick={() => navigate(`/pokemon/${neighbours.next?.id}`)}
              disabled={!neighbours.next}
            >
              {neighbours.next?.displayName ?? 'End'} →
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        {/* ---- Left rail: identity, vitals, status flags ---- */}
        <div className="space-y-5">
          <Card>
            <div className="flex flex-col items-center gap-3">
              {pokemon.artworkUrl ? (
                <img
                  src={pokemon.artworkUrl}
                  alt={pokemon.displayName}
                  className="h-44 w-44 object-contain"
                />
              ) : (
                <div className="flex h-44 w-44 items-center justify-center rounded-lg bg-plane text-sm text-muted">
                  No artwork
                </div>
              )}
              <div className="flex gap-1.5">
                <TypeBadge type={pokemon.type1} />
                {pokemon.type2 && <TypeBadge type={pokemon.type2} />}
              </div>
              {(pokemon.isLegendary || pokemon.isMythical) && (
                <p className="text-xs font-semibold tracking-wide text-ink-2">
                  {pokemon.isLegendary ? 'LEGENDARY' : 'MYTHICAL'}
                </p>
              )}
            </div>

            <dl className="mt-5 space-y-2 border-t border-hairline pt-4 text-sm">
              {[
                ['Height', formatHeight(pokemon.height)],
                ['Weight', formatWeight(pokemon.weight)],
                ['Base experience', pokemon.baseExperience ?? '—'],
                ['Capture rate', pokemon.captureRate ?? '—'],
                ['Colour', pokemon.color ? titleCase(pokemon.color) : '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-muted">{label}</dt>
                  <dd className="tabular-nums text-ink">{value}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Abilities</dt>
                <dd className="text-right text-ink">
                  {pokemon.abilities.length
                    ? pokemon.abilities.map((a) => titleCase(a.replace(/-/g, ' '))).join(', ')
                    : '—'}
                </dd>
              </div>
            </dl>
          </Card>

          <Card title="Status" subtitle="Advising-style flags for this Pokémon">
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_ORDER.map((kind) => {
                const active = activeKinds.has(kind);
                const meta = ACTIVITY_META[kind];
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => toggleActivity(kind)}
                    disabled={togglingKind !== null}
                    title={meta.hint}
                    aria-pressed={active}
                    className={[
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                      active
                        ? 'border-brand bg-brand/10 text-brand-strong'
                        : 'border-hairline bg-surface text-muted hover:text-ink',
                    ].join(' ')}
                  >
                    <span aria-hidden="true">{meta.icon}</span>
                    {meta.label}
                  </button>
                );
              })}
            </div>
            {lastReviewed && (
              <p className="mt-3 text-xs text-muted">Last reviewed {formatDate(lastReviewed)}</p>
            )}
          </Card>

          <Card
            title="Activity log"
            subtitle={`${activity.length} ${activity.length === 1 ? 'entry' : 'entries'} for this Pokémon`}
            actions={
              activity.length > 0 ? (
                <Link
                  to={`/activity${toQueryString({ pokemonId: pokemon.id })}`}
                  className="text-xs font-medium text-brand hover:underline"
                >
                  View all →
                </Link>
              ) : undefined
            }
          >
            {activityError && (
              <p className="mb-3 text-xs text-status-critical">
                <span aria-hidden="true">▲ </span>
                {activityError}
              </p>
            )}

            {activity.length === 0 ? (
              <EmptyState
                title="No activity yet"
                description="Set a status above and it will be logged here with a timestamp."
              />
            ) : (
              <ol className="space-y-2">
                {/* Newest first — the log reads as a history. */}
                {[...activity]
                  .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                  .map((entry) => {
                    const meta = ACTIVITY_META[entry.kind];
                    const reSet = entry.updatedAt !== entry.createdAt;
                    return (
                      <li
                        key={entry.id}
                        className="flex items-start gap-2.5 rounded-lg border border-hairline p-2.5"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[11px] text-brand-strong"
                        >
                          {meta.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-ink">{meta.label}</p>
                          <p className="mt-0.5 text-xs text-muted">
                            {reSet ? 'Updated' : 'Set'} {formatDate(entry.updatedAt)}
                          </p>
                          {reSet && (
                            <p className="text-xs text-muted">
                              First set {formatDate(entry.createdAt)}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeActivity(entry.id, meta.label)}
                          disabled={removingId === entry.id}
                          className="shrink-0 text-xs text-muted hover:text-status-critical disabled:opacity-50"
                        >
                          {removingId === entry.id ? 'Removing…' : 'Remove'}
                        </button>
                      </li>
                    );
                  })}
              </ol>
            )}
          </Card>

          <Card
            title="On rosters"
            subtitle={
              trainers.length === 0
                ? 'Not on any trainer roster'
                : `Carried by ${trainers.length} ${trainers.length === 1 ? 'trainer' : 'trainers'}`
            }
          >
            {trainers.length === 0 ? (
              <EmptyState
                title="Not on a roster"
                description="No trainer currently carries this Pokémon."
              />
            ) : (
              <ul className="space-y-2">
                {trainers.map((entry) => {
                  const meta = ROSTER_STATUS_META[entry.status];
                  return (
                    <li key={entry.rosterId}>
                      <Link
                        to={`/trainers${toQueryString({ trainerId: entry.trainerId })}`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-hairline p-2.5 hover:border-brand hover:bg-plane"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium text-ink">
                            {entry.trainerName}
                          </span>
                          <span className="block text-xs text-muted">
                            {entry.region ?? 'Unknown region'}
                            {entry.nickname && ` · “${entry.nickname}”`}
                            {entry.level && ` · Lv ${entry.level}`}
                          </span>
                        </span>
                        <span
                          title={meta.hint}
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.className}`}
                        >
                          {meta.label}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Find a Pokémon" subtitle="Search without leaving this page">
            <PokemonQuickSearch currentId={pokemon.id} />
          </Card>
        </div>

        {/* ---- Right column: stats, then notes ---- */}
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Base stat total" value={pokemon.baseStatTotal} />
            <StatTile
              label="Dataset percentile"
              value={ranking.baseStatTotalPercentile !== null ? `${ranking.baseStatTotalPercentile}th` : '—'}
              hint={`of ${ranking.total.toLocaleString()}`}
            />
            <StatTile label="Notes" value={notes.length} />
            <StatTile label="Status flags" value={activity.length} />
          </div>

          <Card title="Base stats" subtitle="Values as reported by PokeAPI">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statData} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
                  <CartesianGrid horizontal={false} stroke="var(--color-hairline)" />
                  <XAxis type="number" domain={[0, 255]} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={64}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--color-plane)' }}
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid var(--color-hairline)',
                      fontSize: 12,
                    }}
                  />
                  {/* Single series — no legend needed; the card title names it. */}
                  <Bar dataKey="value" name="Base stat" radius={[0, 4, 4, 0]} barSize={16}>
                    {statData.map((entry) => (
                      <Cell key={entry.label} fill="var(--color-brand)" />
                    ))}
                    <LabelList
                      dataKey="value"
                      position="right"
                      style={{ fill: 'var(--color-ink-2)', fontSize: 12 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Notes" subtitle={`${notes.length} on this Pokémon`}>
            <NoteComposer pokemonId={pokemon.id} onSaved={refetch} />

            <div className="mt-5 border-t border-hairline pt-4">
              {notes.length === 0 ? (
                <EmptyState
                  title="No notes yet"
                  description="Notes you add here also appear on the cross-Pokémon Notes page."
                />
              ) : (
                <ul className="space-y-3">
                  {notes.map((note) => (
                    <li key={note.id} className="rounded-lg border border-hairline p-3.5">
                      <p className="whitespace-pre-wrap text-sm text-ink">{note.body}</p>
                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-muted">
                          {note.owner} · {formatDate(note.createdAt)}
                          {note.updatedAt !== note.createdAt && ' · edited'}
                        </p>
                        <NoteActions noteId={note.id} body={note.body} onChanged={refetch} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <p className="text-xs text-muted">
            Looking for another Pokémon?{' '}
            <Link to="/lookup" className="text-brand hover:underline">
              Back to lookup
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
