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
import { api, toQueryString } from '../lib/api';
import { useApi, useDebounced, usePageClamp } from '../lib/useApi';
import { useCurrentUser } from '../lib/useCurrentUser';
import type {
  RosterMember,
  TrainerAnalysis,
  TrainerDashboardResponse,
  TrainerListItem,
} from '../lib/types';
import { MovesetEditor } from '../components/MovesetEditor';
import { BuildEditor } from '../components/BuildEditor';
import { TrainerForm } from '../components/TrainerForm';
import { AddRosterMember, EditRosterMember } from '../components/RosterEditor';
import { EvolutionProgress } from '../components/EvolutionProgress';
import { AttentionQueue } from '../components/AttentionQueue';
import { RosterBoard } from '../components/RosterBoard';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Loading,
  Paginator,
  StatTile,
  TextInput,
  TypeBadge,
} from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import {
  ACTIVITY_META,
  ROSTER_STATUS_META,
  dexNumber,
  effectivenessLabel,
  formatDate,
  natureEffectLabel,
  titleCase,
} from '../lib/format';
import { PAGE_CONTAINER } from '../lib/page';
import { axisProps, tooltipProps } from '../lib/charts';

export function TrainersPage() {
  // The selected trainer lives in the URL so a dashboard can be linked to
  // directly (the Profile page's trainer chips do exactly that).
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('trainerId');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const { scope } = useCurrentUser();

  const listPath = useMemo(
    () => `/api/trainers${toQueryString({ search: debouncedSearch, scope })}`,
    [debouncedSearch, scope],
  );
  const list = useApi<{ data: TrainerListItem[] }>(listPath);
  const [creating, setCreating] = useState(false);

  function selectTrainer(id: string) {
    if (id) setSearchParams({ trainerId: id });
    else setSearchParams({});
  }

  return (
    <div className={PAGE_CONTAINER}>
      <PageHeader
        title="Trainers"
        description="Each trainer carries a roster of Pokémon — the advising analogue of an advisor's caseload. Pick a trainer to open their dashboard."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            + New trainer
          </Button>
        }
      />

      <TrainerForm
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(saved) => {
          setCreating(false);
          list.refetch();
          selectTrainer(String(saved.id));
        }}
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
                : 'Create one above, or run `npm run seed:trainers` for a starting set.'
            }
          />
        </div>
      ) : selectedId ? (
        <TrainerDashboard
          trainerId={selectedId}
          allTrainers={list.data.data}
          onTrainerChanged={list.refetch}
          onTrainerDeleted={() => {
            list.refetch();
            selectTrainer('');
          }}
        />
      ) : (
        // No selection yet — show the roster cards as a browsable index.
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {list.data.data.map((trainer) => (
            <button
              key={trainer.id}
              type="button"
              onClick={() => selectTrainer(String(trainer.id))}
              className="flex h-full flex-col rounded-xl border border-hairline bg-surface p-5 text-left transition-colors hover:border-brand focus:outline-none focus:ring-2 focus:ring-brand"
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

              {/* `mt-auto` pins the stats to the card's foot. Grid rows stretch
                  cards to a common height, so without it the figures sit
                  wherever each bio happens to end and never line up across a
                  row — trainers with no bio float theirs a line higher. */}
              <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-hairline pt-3 text-center">
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

/**
 * Team analysis from **equipped** movesets — the card that answers "does this
 * team actually work".
 *
 * Three questions in the order a trainer asks them: is the team set up at all
 * (readiness), what will beat it (threats), and what can it not answer
 * (offensive gaps). Threats lead because a shared weakness with no
 * super-effective reply is the thing that loses a match.
 */
function RosterAnalysis({ analysis }: { analysis: TrainerAnalysis }) {
  const { readiness, threats, offense, gaps } = analysis;
  const unset = readiness.withoutMoveset + readiness.withPartialMoveset;

  return (
    <Card
      title="Team analysis"
      subtitle="Computed from the moves each member actually carries, not everything it could learn"
    >
      {readiness.activeMembers === 0 ? (
        <EmptyState
          title="No active roster"
          description="Add Pokémon to this trainer's roster to see how the team holds up."
        />
      ) : (
        <div className="space-y-5">
          {/* Readiness first: every figure below is only as true as the
              movesets behind it, so an incomplete team says so up front. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Active members" value={readiness.activeMembers} />
            <StatTile label="Full movesets" value={`${readiness.withFullMoveset}/${readiness.activeMembers}`} />
            <StatTile label="Types answered" value={`${18 - gaps.length}/18`} hint="super-effectively" />
            <StatTile label="Open threats" value={threats.length} />
          </div>

          {unset > 0 && (
            <p className="rounded-md border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-xs text-ink">
              {unset} of {readiness.activeMembers} members {unset === 1 ? 'has' : 'have'} an
              incomplete moveset. Coverage below counts only the moves that are set, so it will
              understate this team until they are filled in.
            </p>
          )}

          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
              Threats — hits two or more members hard, with no super-effective reply
            </h3>
            {threats.length === 0 ? (
              <p className="text-sm text-muted">
                No shared weakness goes unanswered. Every type that hits several members hard has
                a super-effective reply somewhere on the team.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {threats.map((threat) => (
                  <li key={threat.type} className="flex flex-wrap items-center gap-2 text-sm">
                    <TypeBadge type={threat.type} />
                    <span className="text-ink">hits {threat.weakCount}</span>
                    <span className="text-muted">{threat.weakMembers.join(', ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
              Attacking coverage
            </h3>
            <ul className="flex flex-wrap gap-1.5">
              {offense.map((entry) => {
                const superEffective = entry.bestMultiplier > 100;
                const noAnswer = entry.bestMultiplier === 0;
                return (
                  <li
                    key={entry.type}
                    className={`flex items-center gap-1 rounded-md border px-1.5 py-1 ${
                      superEffective
                        ? 'border-status-good/40 bg-status-good/10'
                        : noAnswer
                          ? 'border-status-critical/40 bg-status-critical/10'
                          : 'border-hairline'
                    }`}
                    title={
                      superEffective
                        ? `${entry.members.join(', ')} hit this for ${effectivenessLabel(entry.bestMultiplier)}`
                        : noAnswer
                          ? 'Nothing on this team can damage this type'
                          : 'No super-effective answer — neutral damage at best'
                    }
                  >
                    <TypeBadge type={entry.type} />
                    <span className="text-[11px] tabular-nums text-muted">
                      {effectivenessLabel(entry.bestMultiplier)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
}

function TrainerDashboard({
  trainerId,
  allTrainers,
  onTrainerChanged,
  onTrainerDeleted,
}: {
  trainerId: string;
  allTrainers: TrainerListItem[];
  onTrainerChanged: () => void;
  onTrainerDeleted: () => void;
}) {
  // The two histories page independently, so reading further back through the
  // notes doesn't move the activity card underneath it.
  const [notesPage, setNotesPage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);

  const { data, loading, error, refetch } = useApi<TrainerDashboardResponse>(
    `/api/trainers/${trainerId}${toQueryString({ notesPage, activityPage, historyPageSize: 10 })}`,
  );
  usePageClamp(data?.notesPagination, setNotesPage);
  usePageClamp(data?.activityPagination, setActivityPage);

  // Team analysis is its own request: the dashboard payload above already runs
  // 15+ queries, and saving a moveset refetches this without re-paging the
  // note and activity histories underneath it.
  const { data: analysis, refetch: refetchAnalysis } = useApi<TrainerAnalysis>(
    `/api/trainers/${trainerId}/analysis`,
  );

  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingMember, setEditingMember] = useState<RosterMember | null>(null);
  const [editingMoveset, setEditingMoveset] = useState<RosterMember | null>(null);
  const [editingBuild, setEditingBuild] = useState<RosterMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rosterView, setRosterView] = useState<'table' | 'board'>('table');
  // The two history tables show raw `owner` emails otherwise.
  const { labelFor, email: actingEmail } = useCurrentUser();

  if (loading && !data) return <Loading label="Loading roster…" />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data) return null;

  const {
    trainer,
    roster,
    summary,
    typeBreakdown,
    statAverages,
    moveCoverage,
    movepool,
    notes,
    activity,
  } = data;

  /*
   * Ownership is a convention enforced by the API (403 on a foreign trainer),
   * so the UI mirrors it rather than duplicating it: every write control below
   * is disabled when this trainer belongs to someone else.
   */
  const isMine = trainer.owner === actingEmail;

  const typeData = typeBreakdown.map((row) => ({ ...row, type: titleCase(row.type) }));
  const eligible = roster.filter((m) => m.milestoneEligible);
  const coverageData = moveCoverage.map((row) => ({ ...row, type: titleCase(row.type) }));
  // The zeroes are the finding — types nothing on the active roster can hit.
  const coverageGaps = moveCoverage.filter((row) => row.members === 0);

  async function deleteTrainer() {
    if (
      !window.confirm(
        `Delete ${trainer.name}? Their ${roster.length} roster ${roster.length === 1 ? 'entry' : 'entries'} will be removed too. Notes and status flags on those Pokémon are kept.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await api.delete(`/api/trainers/${trainer.id}`);
      onTrainerDeleted();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete the trainer');
      setBusy(false);
    }
  }

  async function removeMember(member: RosterMember) {
    const label = member.nickname ?? member.displayName;
    if (!window.confirm(`Remove ${label} from ${trainer.name}'s roster?`)) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.delete(`/api/roster/${member.id}`);
      refetch();
      onTrainerChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not remove the roster entry');
    } finally {
      setBusy(false);
    }
  }

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
            {!isMine && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-hairline bg-plane px-2 py-1 text-xs text-muted">
                Managed by {labelFor(trainer.owner)} — read only. Switch to them to make changes.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/lookup${toQueryString({ trainerId: trainer.id })}`}
              className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-plane"
            >
              Open roster in Lookup →
            </Link>
            {/*
              Under "All trainers" you can open someone else's roster. Every
              write would 403, so the controls are disabled and say why rather
              than failing on click.
            */}
            <Button onClick={() => setEditing(true)} disabled={busy || !isMine}>
              Edit
            </Button>
            <Button variant="danger" onClick={deleteTrainer} disabled={busy || !isMine}>
              Delete
            </Button>
          </div>
        </div>
        {actionError && (
          <p className="mt-3 text-sm text-status-critical">
            <span aria-hidden="true">▲ </span>
            {actionError}
          </p>
        )}
      </Card>

      {editing && (
        <TrainerForm
          open
          trainer={trainer}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            refetch();
            onTrainerChanged();
          }}
        />
      )}

      <AddRosterMember
        open={adding}
        trainerId={trainer.id}
        trainerName={trainer.name}
        existingIds={roster.map((m) => m.pokemonId)}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false);
          refetch();
          onTrainerChanged();
        }}
      />

      <EditRosterMember
        member={editingMember}
        trainers={allTrainers}
        currentTrainerId={trainer.id}
        onClose={() => setEditingMember(null)}
        onSaved={() => {
          setEditingMember(null);
          refetch();
          onTrainerChanged();
        }}
      />

      {editingMoveset && (
        <MovesetEditor
          open
          rosterId={editingMoveset.id}
          pokemonId={editingMoveset.pokemonId}
          memberName={editingMoveset.nickname ?? editingMoveset.displayName}
          onClose={() => setEditingMoveset(null)}
          onSaved={() => {
            setEditingMoveset(null);
            refetch();
            refetchAnalysis();
          }}
        />
      )}

      {editingBuild && (
        <BuildEditor
          open
          rosterId={editingBuild.id}
          memberName={editingBuild.nickname ?? editingBuild.displayName}
          onClose={() => setEditingBuild(null)}
          onSaved={() => {
            setEditingBuild(null);
            // The dashboard carries the ability and nature columns; the
            // analysis endpoint does not read either, so it is left alone.
            refetch();
          }}
        />
      )}

      {/*
        Roster size counts everyone; every other tile is computed over the
        ACTIVE roster, which is why they carry the "active roster" hint.
      */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <StatTile label="Roster size" value={summary?.roster_size ?? 0} hint="incl. retired" />
        <StatTile label="Active" value={summary?.active_count ?? 0} hint="excl. retired" />
        <StatTile label="Mean BST" value={summary?.avg_base_stat_total ?? 0} hint="active roster" />
        <StatTile label="Best BST" value={summary?.max_base_stat_total ?? 0} hint="active roster" />
        <StatTile label="Mean level" value={summary?.avg_level ?? 0} hint="active roster" />
        <StatTile label="Types covered" value={summary?.distinct_types ?? 0} hint="of 18, active" />
        <StatTile
          label="Ready to evolve"
          value={summary?.milestone_eligible ?? 0}
          hint="milestone met"
        />
      </div>

      {/* ---- Early alert: the "what should I do this week" list ---- */}
      <AttentionQueue trainerId={trainer.id} limit={6} />

      {/* ---- The advising hook: who has met a milestone and needs signing off ---- */}
      {eligible.length > 0 && (
        <Card
          title="Ready to evolve"
          subtitle="These roster members have met the level requirement for their next stage"
        >
          <ul className="flex flex-wrap gap-2">
            {eligible.map((member) => (
              <li key={member.id}>
                <Link
                  to={`/pokemon/${member.pokemonId}`}
                  className="flex items-center gap-2 rounded-lg border border-brand bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand-strong hover:bg-brand/15"
                >
                  {member.spriteUrl && (
                    <img src={member.spriteUrl} alt="" width={24} height={24} className="h-6 w-6" />
                  )}
                  {member.nickname ?? member.displayName}
                  {/* The requirement in words. `evolution_condition` covers
                      the non-level triggers too, where the bare level read as
                      "(needs undefined)". */}
                  <span
                    className="font-normal text-ink-2"
                    title={member.nextEvolution?.evolution_condition ?? undefined}
                  >
                    Lv {member.level} → {member.nextEvolution?.display_name}
                    {member.nextEvolution?.evolution_min_level != null
                      ? ` (needs ${member.nextEvolution.evolution_min_level})`
                      : member.nextEvolution?.evolution_condition
                        ? ` (${member.nextEvolution.evolution_condition})`
                        : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {roster.length === 0 ? (
        <div className="rounded-xl border border-hairline bg-surface">
          <EmptyState
            title="This trainer has an empty roster"
            description="No Pokémon are assigned yet, so there are no stats to show."
            action={
              <Button variant="primary" onClick={() => setAdding(true)} disabled={!isMine}>
                + Add the first Pokémon
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {/* ---- Roster table ---- */}
          <Card
            title="Roster"
            subtitle={
              rosterView === 'board'
                ? `${roster.length} Pokémon — drag a card between columns to change its status`
                : `${roster.length} Pokémon — select any row to open its profile`
            }
            actions={
              <div className="flex items-center gap-2">
                <div className="flex rounded-md border border-hairline p-0.5" role="group" aria-label="Roster view">
                  {(['table', 'board'] as const).map((view) => (
                    <button
                      key={view}
                      type="button"
                      onClick={() => setRosterView(view)}
                      aria-pressed={rosterView === view}
                      className={`rounded px-2.5 py-1 text-xs font-medium capitalize ${
                        rosterView === view ? 'bg-brand/10 text-brand-strong' : 'text-muted hover:text-ink'
                      }`}
                    >
                      {view}
                    </button>
                  ))}
                </div>
                <Button variant="primary" onClick={() => setAdding(true)} disabled={busy || !isMine}>
                  + Add Pokémon
                </Button>
              </div>
            }
          >
            {rosterView === 'board' ? (
              <RosterBoard
                roster={roster}
                onChanged={() => {
                  refetch();
                  onTrainerChanged();
                }}
                onEditMoveset={setEditingMoveset}
                onEditBuild={setEditingBuild}
              />
            ) : (
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
                    <th scope="col" className="px-2 py-2 text-right font-medium">
                      Moveset
                    </th>
                    <th scope="col" className="px-2 py-2 text-left font-medium">
                      Build
                    </th>
                    <th scope="col" className="px-2 py-2 text-left font-medium">
                      Progress
                    </th>
                    <th scope="col" className="px-2 py-2 text-left font-medium">
                      CRM
                    </th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">
                      <span className="sr-only">Actions</span>
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
                        {/* The equipped moveset leads; the learnable movepool
                            is the secondary figure. A member that *can* learn
                            131 moves but carries none contributes nothing to
                            the team, and the old column said the opposite. */}
                        <td className="px-2 py-2 text-right tabular-nums">
                          <button
                            type="button"
                            onClick={() => setEditingMoveset(member)}
                            disabled={busy || !isMine}
                            className={`font-medium hover:text-brand disabled:opacity-50 ${
                              member.movesetSize === 0 ? 'text-status-critical' : 'text-ink'
                            }`}
                            title={
                              member.movesetSize === 0
                                ? 'No moves set — set a moveset'
                                : 'Edit this moveset'
                            }
                          >
                            {member.movesetSize}/4
                          </button>
                          <span className="block text-[11px] text-muted">
                            {member.movesetSize === 0
                              ? `${member.moveCount} learnable`
                              : `${member.movesetCoverage} type${member.movesetCoverage === 1 ? '' : 's'}`}
                          </span>
                        </td>
                        {/*
                          Ability leads and the nature is the secondary line —
                          the ability is the one with a legality rule and real
                          battle effect. Neither is `text-status-critical` when
                          unset: an empty moveset makes every team figure wrong,
                          an unset nature makes nothing wrong.
                        */}
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => setEditingBuild(member)}
                            disabled={busy || !isMine}
                            className="text-left font-medium text-ink hover:text-brand disabled:opacity-50"
                            title={member.ability ? 'Edit ability and nature' : 'Set an ability and nature'}
                          >
                            {member.abilityName ?? <span className="text-muted">Not set</span>}
                          </button>
                          <span className="block text-[11px] text-muted">
                            {member.nature
                              ? `${member.natureName} · ${natureEffectLabel(
                                  member.natureIncreasedStat,
                                  member.natureDecreasedStat,
                                )}`
                              : 'No nature'}
                          </span>
                          <span className="block text-[11px] text-muted">
                            {member.heldItemName ?? 'No item'}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <EvolutionProgress
                            stage={member.evolutionStage}
                            chainLength={member.chainLength}
                            eligible={member.milestoneEligible}
                          />
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
                        <td className="px-2 py-2 text-right whitespace-nowrap">
                          {/* Named alongside Edit and Remove rather than left
                              to the Moveset number, which reads as a status
                              and only looks clickable on hover. */}
                          <button
                            type="button"
                            onClick={() => setEditingMoveset(member)}
                            disabled={busy || !isMine}
                            aria-label={`Edit moveset for ${member.nickname ?? member.displayName}`}
                            className="text-xs text-muted hover:text-brand disabled:opacity-50"
                          >
                            Moves
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingMember(member)}
                            disabled={busy || !isMine}
                            className="ml-3 text-xs text-muted hover:text-brand disabled:opacity-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => removeMember(member)}
                            disabled={busy || !isMine}
                            className="ml-3 text-xs text-muted hover:text-status-critical disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
          </Card>

          {analysis && <RosterAnalysis analysis={analysis} />}

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
                    <Bar isAnimationActive={false} dataKey="count" name="Pokémon" fill="var(--color-series-1)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/*
              POTENTIAL, not equipped — this counts the whole learnable
              movepool, so a member that can learn 131 moves reads as covering
              14 types whether or not it carries any of them. The team analysis
              card above is the one that answers "does this team work"; this is
              the ceiling it could reach if every moveset were rebuilt.
            */}
            <Card
              title="Movepool coverage (potential)"
              subtitle="Types the active roster could attack with if movesets were rebuilt — the whole learnable movepool, status moves excluded"
              className="lg:col-span-2"
              actions={
                <Link
                  to={`/moves${toQueryString({ trainerId: trainer.id })}`}
                  className="text-xs font-medium text-brand hover:underline"
                >
                  Moves this roster can learn →
                </Link>
              }
            >
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={coverageData} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
                    <CartesianGrid vertical={false} stroke="var(--color-hairline)" />
                    <XAxis dataKey="type" {...axisProps} angle={-35} textAnchor="end" height={58} />
                    <YAxis {...axisProps} allowDecimals={false} />
                    <Tooltip {...tooltipProps} />
                    <Bar
                      isAnimationActive={false}
                      dataKey="members"
                      name="Members"
                      fill="var(--color-series-1)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline pt-3 text-xs">
                <span className="text-muted">
                  {movepool?.types_covered ?? 0} of 18 types covered ·{' '}
                  {(movepool?.distinct_moves ?? 0).toLocaleString()} distinct moves ·{' '}
                  {movepool?.avg_movepool ?? 0} moves per member on average
                </span>
                {coverageGaps.length > 0 && (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-status-critical">
                      <span aria-hidden="true">▲ </span>No answer to:
                    </span>
                    {coverageGaps.map((gap) => (
                      <TypeBadge key={gap.type} type={gap.type} />
                    ))}
                  </span>
                )}
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
                    <Bar isAnimationActive={false} dataKey="avg" name="Mean" fill="var(--color-series-1)" radius={[4, 4, 0, 0]} />
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
        subtitle={
          data.notesPagination.total > 0
            ? `${data.notesPagination.total.toLocaleString()} ${data.notesPagination.total === 1 ? 'note' : 'notes'} on Pokémon in this roster`
            : 'Notes on any Pokémon in this roster'
        }
        className="overflow-hidden"
        actions={
          <Link
            to={`/notes${toQueryString({ trainerId: trainer.id })}`}
            className="text-xs font-medium text-brand hover:underline"
          >
            All notes for this roster →
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
                    <td className="px-2 py-2 whitespace-nowrap text-muted" title={note.owner}>
                      {labelFor(note.owner)}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap text-muted">
                      {formatDate(note.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* This card used to show a bare `limit 50` with no total, so a
                busy roster truncated silently. */}
            <div className="-mx-5 -mb-5 mt-2">
              <Paginator
                pagination={data.notesPagination}
                onChange={setNotesPage}
                label="note"
                compact
              />
            </div>
          </div>
        )}
      </Card>

      {/* ---- Activity history across the roster ---- */}
      <Card
        title="Activity history"
        subtitle={
          data.activityPagination.total > 0
            ? `${data.activityPagination.total.toLocaleString()} status ${data.activityPagination.total === 1 ? 'flag' : 'flags'} on Pokémon in this roster`
            : 'Status flags on any Pokémon in this roster'
        }
        className="overflow-hidden"
        actions={
          <Link
            to={`/activity${toQueryString({ trainerId: trainer.id })}`}
            className="text-xs font-medium text-brand hover:underline"
          >
            All activity for this roster →
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
                      <td className="px-2 py-2 whitespace-nowrap text-muted" title={entry.owner}>
                        {labelFor(entry.owner)}
                      </td>
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

            <div className="-mx-5 -mb-5 mt-2">
              <Paginator
                pagination={data.activityPagination}
                onChange={setActivityPage}
                label="flag"
                compact
              />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
