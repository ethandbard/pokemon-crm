import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, toQueryString } from '../lib/api';
import { useApi } from '../lib/useApi';
import type {
  AttentionItem,
  AttentionReasonCode,
  AttentionResponse,
  RosterAlert,
  RosterAlertCode,
} from '../lib/types';
import { Card, EmptyState, ErrorState, Loading } from './ui';
import { dexNumber } from '../lib/format';
import { MovesetEditor } from './MovesetEditor';
import { useToast } from './Toast';
import { useCurrentUser } from '../lib/useCurrentUser';

/**
 * Reason presentation. Colour is *not* the only channel — each reason ships an
 * icon and its full label, so the queue stays readable without relying on hue.
 */
const REASON_META: Record<AttentionReasonCode, { icon: string; short: string; tone: string }> = {
  moveset_missing: {
    icon: '⌀',
    short: 'No moves',
    tone: 'border-status-critical/40 bg-status-critical/10 text-status-critical',
  },
  moveset_incomplete: {
    icon: '◑',
    short: 'Partial moveset',
    tone: 'border-status-warning/60 bg-status-warning/10 text-ink-2',
  },
  never_reviewed: {
    icon: '○',
    short: 'Never reviewed',
    tone: 'border-status-serious/50 bg-status-serious/10 text-ink-2',
  },
  stale_review: {
    icon: '◔',
    short: 'Stale',
    tone: 'border-hairline bg-plane text-ink-2',
  },
};

const ALERT_META: Record<RosterAlertCode, { icon: string; tone: string }> = {
  roster_incomplete: { icon: '◱', tone: 'text-status-warning' },
  unanswered_weakness: { icon: '⚠', tone: 'text-status-critical' },
};

/** Highest score in the queue drives the bar scale, so ranking reads visually. */
function scoreWidth(score: number, max: number): string {
  if (max <= 0) return '0%';
  return `${Math.max(6, Math.round((score / max) * 100))}%`;
}

export function AttentionQueue({
  trainerId,
  limit = 8,
  title = 'Needs attention',
  showTrainer = false,
}: {
  /** Omit for the workspace-wide queue. */
  trainerId?: number;
  limit?: number;
  title?: string;
  /** Show which trainer each item belongs to — on for the workspace view. */
  showTrainer?: boolean;
}) {
  const { scope } = useCurrentUser();
  const path = useMemo(
    () => `/api/attention${toQueryString({ trainerId, limit, scope })}`,
    [trainerId, limit, scope],
  );
  const { data, loading, error, refetch } = useApi<AttentionResponse>(path);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editingMoveset, setEditingMoveset] = useState<AttentionItem | null>(null);

  const maxScore = data?.data[0]?.score ?? 0;

  // One block per trainer: the workspace view otherwise repeats "Brock
  // Harrison:" down seven consecutive rows.
  const alertGroups = useMemo(() => {
    const groups = new Map<number, { trainerId: number; trainerName: string; alerts: RosterAlert[] }>();
    for (const alert of data?.alerts ?? []) {
      const group =
        groups.get(alert.trainerId) ??
        { trainerId: alert.trainerId, trainerName: alert.trainerName, alerts: [] };
      group.alerts.push(alert);
      groups.set(alert.trainerId, group);
    }
    return [...groups.values()];
  }, [data?.alerts]);

  return (
    <Card
      title={title}
      subtitle={
        data
          ? `${data.flagged} of ${data.scanned} active roster ${data.scanned === 1 ? 'member' : 'members'} have an open signal`
          : 'Ranked by how much attention each roster member needs'
      }
      actions={
        data && data.flagged > limit ? (
          <span className="text-xs text-muted">
            showing top {Math.min(limit, data.data.length)}
          </span>
        ) : undefined
      }
    >
      {loading && !data ? (
        <Loading rows={4} label="Scoring roster…" />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : !data ? null : (
        <>
          {/*
            Roster-level problems sit above the member list: "this team has no
            answer to Ground" is not any one member's fault, and fixing it may
            mean adding a Pokémon rather than editing one.
          */}
          {alertGroups.length > 0 && (
            <div className="mb-4 space-y-2">
              {alertGroups.map((group) => (
                <div
                  key={group.trainerId}
                  className="rounded-lg border border-hairline bg-plane/50 p-2.5"
                >
                  {/*
                    The trainer is named once per group rather than repeated on
                    every row, and it is the entry point: these problems are
                    fixed on the roster, not on any Pokémon's profile.
                  */}
                  <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    {showTrainer ? (
                      <Link
                        to={`/trainers${toQueryString({ trainerId: group.trainerId })}`}
                        className="text-sm font-semibold text-ink hover:text-brand"
                      >
                        {group.trainerName}
                      </Link>
                    ) : (
                      <span className="text-xs font-medium uppercase tracking-wide text-muted">
                        Roster alerts
                      </span>
                    )}
                    <span className="flex gap-3 text-xs">
                      <Link
                        to={`/team${toQueryString({ trainerId: group.trainerId })}`}
                        className="font-medium text-brand hover:underline"
                      >
                        Team analysis →
                      </Link>
                      {showTrainer && (
                        <Link
                          to={`/trainers${toQueryString({ trainerId: group.trainerId })}`}
                          className="font-medium text-brand hover:underline"
                        >
                          Roster →
                        </Link>
                      )}
                    </span>
                  </div>

                  <ul className="space-y-1">
                    {group.alerts.map((alert) => (
                      <li
                        key={`${alert.code}-${alert.label}`}
                        className="flex items-start gap-2 text-xs"
                      >
                        <span aria-hidden="true" className={`mt-0.5 ${ALERT_META[alert.code].tone}`}>
                          {ALERT_META[alert.code].icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="text-ink">{alert.label}</span>
                          <span className="block text-muted">{alert.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {data.alertsTotal > data.alerts.length && (
                <p className="text-xs text-muted">
                  Showing {data.alerts.length} of {data.alertsTotal} roster alerts — open a trainer
                  to see all of theirs.
                </p>
              )}
            </div>
          )}

          {data.data.length === 0 ? (
            <EmptyState
              title="No member needs attention"
              description={
                data.scanned === 0
                  ? 'There are no active roster members to score yet.'
                  : 'Every active roster member has a full moveset and a recent review.'
              }
            />
          ) : (
            <ol className="space-y-2">
              {data.data.map((item, index) => (
                <AttentionRow
                  key={item.rosterId}
                  item={item}
                  rank={index + 1}
                  maxScore={maxScore}
                  showTrainer={showTrainer}
                  open={expanded === item.rosterId}
                  onToggle={() => setExpanded(expanded === item.rosterId ? null : item.rosterId)}
                  onSetMoves={() => setEditingMoveset(item)}
                  onChanged={refetch}
                />
              ))}
            </ol>
          )}

          {/*
            Every threshold here is a rule over recorded facts. The old note
            explained an assumed EXP-per-day training rate, which was the one
            number in this card that was invented rather than observed.
          */}
          <p className="mt-4 border-t border-hairline pt-3 text-xs text-muted">
            Reviews go stale after {data.model.staleAfterDays} days · a full party is{' '}
            {data.model.fullRosterSize} · a weakness is raised once it hits{' '}
            {data.model.sharedWeaknessMembers} members with no super-effective reply.
          </p>
        </>
      )}

      {/* Editing happens here rather than by navigating away, so the queue is
          still on screen — and re-ranks — once the moveset is saved. */}
      {editingMoveset && (
        <MovesetEditor
          open
          rosterId={editingMoveset.rosterId}
          pokemonId={editingMoveset.pokemonId}
          memberName={editingMoveset.nickname ?? editingMoveset.displayName}
          onClose={() => setEditingMoveset(null)}
          onSaved={() => {
            setEditingMoveset(null);
            refetch();
          }}
        />
      )}
    </Card>
  );
}

function AttentionRow({
  item,
  rank,
  maxScore,
  showTrainer,
  open,
  onToggle,
  onSetMoves,
  onChanged,
}: {
  item: AttentionItem;
  rank: number;
  maxScore: number;
  showTrainer: boolean;
  open: boolean;
  onToggle: () => void;
  onSetMoves: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const name = item.nickname ?? item.displayName;

  const needsMoves = item.reasons.some(
    (reason) => reason.code === 'moveset_missing' || reason.code === 'moveset_incomplete',
  );

  /**
   * Re-posting `reviewed` bumps its timestamp rather than clearing the flag
   * (see CLAUDE.md § activity), so this clears both review signals in one
   * click and the row drops out of the queue on refetch.
   */
  async function markReviewed() {
    setBusy(true);
    try {
      await api.post('/api/activity/toggle', { pokemonId: item.pokemonId, kind: 'reviewed' });
      toast(`Marked ${name} reviewed`, { tone: 'success' });
      onChanged();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not mark reviewed', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  /*
   * No Flag action here on purpose. `flagged` stopped being an attention
   * signal when the model was reworked, so a Flag button in a ranking widget
   * would write a row and leave the ranking untouched — an action that looks
   * like it did nothing. Flags still live on the Profile and Activity page.
   * If `flagged` ever becomes a signal again, this is where it belongs.
   */

  return (
    <li className="rounded-lg border border-hairline">
      <div className="flex items-center gap-3 p-2.5">
        <span className="w-4 shrink-0 text-right text-xs tabular-nums text-muted">{rank}</span>

        <Link
          to={`/pokemon/${item.pokemonId}`}
          className="flex min-w-0 flex-1 items-center gap-2.5 hover:text-brand"
        >
          {item.spriteUrl && (
            <img src={item.spriteUrl} alt="" width={32} height={32} className="h-8 w-8 shrink-0" />
          )}
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">
              {name}
              {item.nickname && (
                <span className="ml-1.5 text-xs font-normal text-muted">({item.displayName})</span>
              )}
            </span>
            <span className="block text-xs text-muted">
              {dexNumber(item.pokemonId)}
              {item.level !== null && ` · Lv ${item.level}`}
              {showTrainer && ` · ${item.trainerName}`}
            </span>
          </span>
        </Link>

        {/* Reason chips: icon + text, never colour alone. */}
        <span className="hidden shrink-0 gap-1 md:flex">
          {item.reasons.map((reason) => (
            <span
              key={reason.code}
              title={reason.label}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${REASON_META[reason.code].tone}`}
            >
              <span aria-hidden="true">{REASON_META[reason.code].icon}</span>
              {REASON_META[reason.code].short}
            </span>
          ))}
        </span>

        <span className="flex w-24 shrink-0 items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-hairline" aria-hidden="true">
            <span
              className="block h-full rounded-full bg-brand"
              style={{ width: scoreWidth(item.score, maxScore) }}
            />
          </span>
          <span className="w-8 text-right text-xs font-semibold tabular-nums text-ink">
            {item.score}
          </span>
        </span>

        {/*
          The fix for the row's biggest signal, inline. Clicking the Pokémon
          goes to its profile, which is not attached to a roster and cannot
          edit a moveset — so the action the queue is asking for has to be
          here, not one navigation away from where it isn't.
        */}
        <button
          type="button"
          onClick={needsMoves ? onSetMoves : markReviewed}
          disabled={busy}
          className="shrink-0 rounded-md border border-hairline px-2 py-1 text-xs font-medium text-ink hover:border-brand hover:text-brand disabled:opacity-50"
        >
          {needsMoves ? 'Set moves' : 'Mark reviewed'}
        </button>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="shrink-0 rounded-md px-1.5 py-1 text-xs text-muted hover:bg-plane hover:text-ink"
        >
          {open ? 'Hide' : 'Why?'}
        </button>
      </div>

      {open && (
        <div className="border-t border-hairline bg-plane/60 px-3 py-2.5">
          <ul className="space-y-1">
            {item.reasons.map((reason) => (
              <li key={reason.code} className="flex items-start gap-2 text-xs">
                <span aria-hidden="true" className="mt-0.5 text-muted">
                  {REASON_META[reason.code].icon}
                </span>
                <span className="flex-1 text-ink-2">{reason.label}</span>
                <span className="tabular-nums text-muted">+{reason.points}</span>
              </li>
            ))}
          </ul>

          {/* Every action this row supports, named. */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-hairline pt-2.5">
            <button
              type="button"
              onClick={onSetMoves}
              disabled={busy}
              className={actionClass}
            >
              Set moves ({item.movesetSize}/4)
            </button>
            <button type="button" onClick={markReviewed} disabled={busy} className={actionClass}>
              Mark reviewed
            </button>
            <Link to={`/pokemon/${item.pokemonId}`} className={actionClass}>
              Pokémon page
            </Link>
            <Link
              to={`/trainers${toQueryString({ trainerId: item.trainerId })}`}
              className={actionClass}
            >
              {showTrainer ? `${item.trainerName}'s roster` : 'Roster'}
            </Link>
          </div>
        </div>
      )}
    </li>
  );
}

/** Shared look for the row's action cluster — buttons and links must match. */
const actionClass =
  'rounded-md border border-hairline bg-surface px-2 py-1 text-xs text-ink-2 hover:border-brand hover:text-brand disabled:opacity-50';
