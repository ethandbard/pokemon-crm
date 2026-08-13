import { useEffect, useState } from 'react';
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
import { Movepool } from '../components/Movepool';
import { PokemonQuickSearch } from '../components/PokemonQuickSearch';
import { EvolutionChain } from '../components/EvolutionProgress';
import { useToast } from '../components/Toast';
import {
  ACTIVITY_META,
  ROSTER_STATUS_META,
  dexNumber,
  formatDate,
  formatGenderRate,
  formatHeight,
  formatWeight,
  slugLabel,
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

/** EV yield, in the same order as the base stats above. */
const EV_FIELDS = [
  { key: 'evHp', label: 'HP' },
  { key: 'evAttack', label: 'Attack' },
  { key: 'evDefense', label: 'Defense' },
  { key: 'evSpecialAttack', label: 'Sp. Atk' },
  { key: 'evSpecialDefense', label: 'Sp. Def' },
  { key: 'evSpeed', label: 'Speed' },
] as const;

export function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useApi<PokemonProfileResponse>(`/api/pokemon/${id}`);
  const [togglingKind, setTogglingKind] = useState<ActivityKind | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  /** Pending flag states, applied over the server's until the refetch lands. */
  const [optimisticKinds, setOptimisticKinds] = useState<Partial<Record<ActivityKind, boolean>>>({});
  const [showShiny, setShowShiny] = useState(false);
  const { toast, confirmable } = useToast();

  // Once fresh data arrives the optimistic layer has served its purpose.
  useEffect(() => {
    setOptimisticKinds({});
  }, [data]);

  // Navigating between Pokémon keeps the component mounted, so the shiny
  // toggle has to be reset explicitly or it carries over to the next species.
  useEffect(() => {
    setShowShiny(false);
  }, [id]);

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

  const { pokemon, notes, activity, neighbours, ranking, trainers, evolution, moveSummary } = data;
  // Server truth, overlaid with any in-flight optimistic toggles.
  const activeKinds = new Set(activity.map((a) => a.kind));
  for (const [kind, isActive] of Object.entries(optimisticKinds)) {
    if (isActive) activeKinds.add(kind as ActivityKind);
    else activeKinds.delete(kind as ActivityKind);
  }
  const lastReviewed = activity.find((a) => a.kind === 'reviewed')?.updatedAt ?? null;

  const statData = STAT_FIELDS.map((field) => ({
    label: field.label,
    value: pokemon[field.key],
  }));

  // EV yield is mostly zeros — a species trains one or two stats. Only the
  // non-zero ones are worth showing.
  const evYield = EV_FIELDS.map((field) => ({
    label: field.label,
    value: pokemon[field.key],
  })).filter((entry) => entry.value > 0);

  const artwork =
    (showShiny ? pokemon.shinyArtworkUrl : pokemon.artworkUrl) ?? pokemon.artworkUrl;

  /**
   * Plays the cry. Built on demand rather than kept as a mounted `<audio>`:
   * there's one per profile, it's never controlled after starting, and a
   * persistent element would need resetting on every navigation.
   */
  function playCry() {
    if (!pokemon.cryUrl) return;
    const audio = new Audio(pokemon.cryUrl);
    audio.volume = 0.4;
    // Browsers reject playback that isn't user-initiated; this one always is,
    // but a rejected promise here must not surface as an unhandled rejection.
    void audio.play().catch(() => toast('Could not play the cry', { tone: 'error' }));
  }

  /**
   * Optimistic: the chip flips immediately and only rolls back if the request
   * fails. `reviewed` is never "off", so its optimistic state is always on.
   */
  async function toggleActivity(kind: ActivityKind) {
    const wasActive = activeKinds.has(kind);
    const willBeActive = kind === 'reviewed' ? true : !wasActive;

    setOptimisticKinds((current) => ({ ...current, [kind]: willBeActive }));
    setTogglingKind(kind);
    setActivityError(null);

    try {
      await api.post('/api/activity/toggle', { pokemonId: pokemon.id, kind });
      refetch();
    } catch (err) {
      // Roll back to whatever the server last told us.
      setOptimisticKinds((current) => {
        const next = { ...current };
        delete next[kind];
        return next;
      });
      const message = err instanceof Error ? err.message : 'Could not update the status';
      setActivityError(message);
      toast(message, { tone: 'error' });
    } finally {
      setTogglingKind(null);
    }
  }

  /**
   * Removes a log entry. No confirm dialog — the toast offers Undo, which
   * re-toggles the flag back on.
   */
  async function removeActivity(activityId: number, kind: ActivityKind, label: string) {
    setRemovingId(activityId);
    setActivityError(null);
    await confirmable({
      message: `Removed “${label}” from ${pokemon.displayName}`,
      perform: () => api.delete(`/api/activity/${activityId}`),
      undo: () => api.post('/api/activity/toggle', { pokemonId: pokemon.id, kind }),
      onSettled: refetch,
      onError: setActivityError,
    });
    setRemovingId(null);
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
              {artwork ? (
                <img
                  src={artwork}
                  alt={`${pokemon.displayName}${showShiny ? ' (shiny)' : ''}`}
                  className="h-44 w-44 object-contain"
                />
              ) : (
                <div className="flex h-44 w-44 items-center justify-center rounded-lg bg-plane text-sm text-muted">
                  No artwork
                </div>
              )}

              {/* Shiny toggle and cry — only rendered when the seed actually
                  captured those URLs, so an older row degrades quietly. */}
              {(pokemon.shinyArtworkUrl || pokemon.cryUrl) && (
                <div className="flex items-center gap-2">
                  {pokemon.shinyArtworkUrl && (
                    <button
                      type="button"
                      onClick={() => setShowShiny((shiny) => !shiny)}
                      aria-pressed={showShiny}
                      className={[
                        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                        showShiny
                          ? 'border-brand bg-brand/10 text-brand-strong'
                          : 'border-hairline bg-surface text-muted hover:text-ink',
                      ].join(' ')}
                    >
                      <span aria-hidden="true">✦</span> Shiny
                    </button>
                  )}
                  {pokemon.cryUrl && (
                    <button
                      type="button"
                      onClick={playCry}
                      title="Play this Pokémon's cry"
                      className="rounded-full border border-hairline bg-surface px-3 py-1 text-xs font-medium text-muted hover:text-ink"
                    >
                      <span aria-hidden="true">♪</span> Cry
                    </button>
                  )}
                </div>
              )}

              <div className="flex gap-1.5">
                <TypeBadge type={pokemon.type1} />
                {pokemon.type2 && <TypeBadge type={pokemon.type2} />}
              </div>
              {(pokemon.isLegendary || pokemon.isMythical || pokemon.isBaby) && (
                <p className="text-xs font-semibold tracking-wide text-ink-2">
                  {pokemon.isLegendary ? 'LEGENDARY' : pokemon.isMythical ? 'MYTHICAL' : 'BABY'}
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
                ['Shape', pokemon.shape ? slugLabel(pokemon.shape) : '—'],
                // Habitat exists only for generations 1–3 in PokeAPI, so this
                // reads "—" for most of the dex. That's the source data, not a
                // seeding gap.
                ['Habitat', pokemon.habitat ? slugLabel(pokemon.habitat) : '—'],
                ['Growth rate', pokemon.growthRate ? slugLabel(pokemon.growthRate) : '—'],
                ['Gender ratio', formatGenderRate(pokemon.genderRate)],
                ['Base friendship', pokemon.baseHappiness ?? '—'],
                [
                  'Egg cycles',
                  pokemon.hatchCounter !== null ? `${pokemon.hatchCounter}` : '—',
                ],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-muted">{label}</dt>
                  <dd className="text-right tabular-nums text-ink">{value}</dd>
                </div>
              ))}

              <div className="flex justify-between gap-4">
                <dt className="text-muted">Egg groups</dt>
                <dd className="text-right text-ink">
                  {pokemon.eggGroups.length ? pokemon.eggGroups.map(slugLabel).join(', ') : '—'}
                </dd>
              </div>

              <div className="flex justify-between gap-4">
                <dt className="text-muted">Abilities</dt>
                <dd className="text-right text-ink">
                  {pokemon.abilities.length ? pokemon.abilities.map(slugLabel).join(', ') : '—'}
                  {/* The hidden ability is called out rather than folded into
                      the list — it isn't obtainable the same way, and the flag
                      can't be recovered without a re-seed. */}
                  {pokemon.hiddenAbility && (
                    <span className="mt-1 block text-xs text-muted">
                      {slugLabel(pokemon.hiddenAbility)}{' '}
                      <span className="rounded-full border border-hairline px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                        Hidden
                      </span>
                    </span>
                  )}
                </dd>
              </div>

              {pokemon.heldItems.length > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Held items</dt>
                  <dd className="text-right text-ink">
                    {pokemon.heldItems.map(slugLabel).join(', ')}
                  </dd>
                </div>
              )}
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
                          onClick={() => removeActivity(entry.id, entry.kind, meta.label)}
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
          {/* The Pokédex blurb — the only descriptive prose in the dataset.
              The version is credited because entries differ per game and this
              is one game's wording, not a neutral description. */}
          {pokemon.flavorText && (
            <Card
              title={pokemon.genus ?? 'Pokédex entry'}
              subtitle={
                // Just the game's name — prefixing "Pokémon" turns
                // `legends-arceus` into "Pokémon Legends arceus".
                pokemon.flavorTextVersion
                  ? `Pokédex entry from ${slugLabel(pokemon.flavorTextVersion)}`
                  : 'Pokédex entry'
              }
            >
              <p className="text-sm leading-relaxed text-ink">{pokemon.flavorText}</p>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Base stat total" value={pokemon.baseStatTotal} />
            <StatTile
              label="Dataset percentile"
              value={ranking.baseStatTotalPercentile !== null ? `${ranking.baseStatTotalPercentile}th` : '—'}
              hint={`of ${ranking.total.toLocaleString()}`}
            />
            <StatTile
              label="Movepool"
              value={moveSummary?.total ?? 0}
              hint={`${moveSummary?.coverage_types.length ?? 0} of 18 types covered`}
            />
            <StatTile label="Notes" value={notes.length} />
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
                  <Bar isAnimationActive={false} dataKey="value" name="Base stat" radius={[0, 4, 4, 0]} barSize={16}>
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

          {evYield.length > 0 && (
            <Card
              title="EV yield"
              subtitle="What defeating this Pokémon trains — the advising analogue of what a placement teaches"
            >
              <div className="flex flex-wrap gap-2">
                {evYield.map((entry) => (
                  <span
                    key={entry.label}
                    className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-plane px-3 py-1 text-xs text-ink"
                  >
                    {entry.label}
                    <span className="font-semibold tabular-nums text-brand-strong">
                      +{entry.value}
                    </span>
                  </span>
                ))}
              </div>
            </Card>
          )}

          <Card
            title="Evolution line"
            subtitle={
              evolution.chainLength > 1
                ? `Stage ${evolution.stage} of ${evolution.chainLength}${evolution.isFullyEvolved ? ' — fully evolved' : ''}`
                : 'Single-stage species'
            }
          >
            <EvolutionChain chain={evolution.chain} currentId={pokemon.id} />

            {/* How this species itself was reached. Worth stating plainly:
                for the third of the dex with no level requirement, this is the
                only place the actual requirement appears as words. */}
            {pokemon.evolutionCondition && (
              <p className="mt-4 border-t border-hairline pt-3 text-xs text-muted">
                Reached from its previous stage by:{' '}
                <span className="text-ink">{pokemon.evolutionCondition}</span>
                {pokemon.evolutionRequirements && pokemon.evolutionRequirements.length > 1 && (
                  <>
                    {' '}
                    (
                    {pokemon.evolutionRequirements.length} routes)
                  </>
                )}
              </p>
            )}
          </Card>

          {/* The coursework half of the record: what this species can learn,
              how each move is earned, and what it can attack with. */}
          <Movepool
            pokemonId={pokemon.id}
            moves={data.moves}
            summary={moveSummary}
            type1={pokemon.type1}
            type2={pokemon.type2}
          />

          {(pokemon.varieties.length > 0 || pokemon.regionalDexNumbers) && (
            <Card
              title="Forms & regional dex"
              subtitle="Alternate forms, and where this species appears in regional Pokédexes"
            >
              {pokemon.varieties.length > 0 && (
                <div className="mb-4">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Alternate forms
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {pokemon.varieties.map((variety) => (
                      <span
                        key={variety}
                        className="rounded-full border border-hairline bg-plane px-2.5 py-1 text-xs text-ink"
                      >
                        {slugLabel(variety)}
                      </span>
                    ))}
                  </div>
                  {/* These aren't rows in the database — only the default form
                      is seeded — so they're labels, not links. */}
                  <p className="mt-1.5 text-[11px] text-muted">
                    Names only; alternate forms are not imported as records.
                  </p>
                </div>
              )}

              {pokemon.regionalDexNumbers && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Regional Pokédex numbers
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(pokemon.regionalDexNumbers)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([dex, number]) => (
                        <span
                          key={dex}
                          className="rounded-full border border-hairline px-2.5 py-1 text-xs text-muted"
                        >
                          {slugLabel(dex)}{' '}
                          <span className="tabular-nums text-ink">#{number}</span>
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </Card>
          )}

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
