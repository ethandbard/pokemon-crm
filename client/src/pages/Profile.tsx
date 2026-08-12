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
import { api } from '../lib/api';
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
import {
  ACTIVITY_META,
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

  const { pokemon, notes, activity, neighbours, ranking } = data;
  const activeKinds = new Set(activity.map((a) => a.kind));
  const lastReviewed = activity.find((a) => a.kind === 'reviewed')?.updatedAt ?? null;

  const statData = STAT_FIELDS.map((field) => ({
    label: field.label,
    value: pokemon[field.key],
  }));

  async function toggleActivity(kind: ActivityKind) {
    setTogglingKind(kind);
    try {
      await api.post('/api/activity/toggle', { pokemonId: pokemon.id, kind });
      refetch();
    } finally {
      setTogglingKind(null);
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
                        ? 'border-series-1 bg-series-1/10 text-series-1'
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
                      <Cell key={entry.label} fill="var(--color-series-1)" />
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
            <Link to="/" className="text-series-1 hover:underline">
              Back to lookup
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
