import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toQueryString } from '../lib/api';
import { useApi } from '../lib/useApi';
import type { AttentionItem, AttentionReasonCode, AttentionResponse } from '../lib/types';
import { Card, EmptyState, ErrorState, Loading } from './ui';
import { dexNumber } from '../lib/format';

/**
 * Reason presentation. Colour is *not* the only channel — each reason ships an
 * icon and its full label, so the queue stays readable without relying on hue.
 */
const REASON_META: Record<AttentionReasonCode, { icon: string; short: string; tone: string }> = {
  never_reviewed: {
    icon: '○',
    short: 'Never reviewed',
    tone: 'border-status-critical/40 bg-status-critical/10 text-status-critical',
  },
  stale_review: {
    icon: '◔',
    short: 'Stale',
    tone: 'border-status-serious/50 bg-status-serious/10 text-ink-2',
  },
  flagged: {
    icon: '▲',
    short: 'Flagged',
    tone: 'border-brand/40 bg-brand/10 text-brand-strong',
  },
  milestone_overdue: {
    icon: '★',
    short: 'Milestone',
    tone: 'border-status-good/40 bg-status-good/10 text-ink-2',
  },
  behind_pace: {
    icon: '↓',
    short: 'Behind pace',
    tone: 'border-status-warning/60 bg-status-warning/10 text-ink-2',
  },
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
  const path = useMemo(
    () => `/api/attention${toQueryString({ trainerId, limit })}`,
    [trainerId, limit],
  );
  const { data, loading, error, refetch } = useApi<AttentionResponse>(path);
  const [expanded, setExpanded] = useState<number | null>(null);

  const maxScore = data?.data[0]?.score ?? 0;

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
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          title="Nothing needs attention"
          description={
            data && data.scanned === 0
              ? 'There are no active roster members to score yet.'
              : 'Every active roster member has been reviewed recently, is on pace, and has no open flags.'
          }
        />
      ) : (
        <>
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
              />
            ))}
          </ol>

          {/*
            The pace signal rests on an assumed training rate. Saying so keeps
            the score honest rather than letting it read as measured fact.
          */}
          <p className="mt-4 border-t border-hairline pt-3 text-xs text-muted">
            Stale after {data.model.staleAfterDays} days · pace assumes{' '}
            {data.model.expPerDay.toLocaleString()} EXP/day against each species&rsquo; real growth
            curve, tolerating {data.model.behindPaceTolerance} levels.
          </p>
        </>
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
}: {
  item: AttentionItem;
  rank: number;
  maxScore: number;
  showTrainer: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const name = item.nickname ?? item.displayName;

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
        <ul className="space-y-1 border-t border-hairline bg-plane/60 px-3 py-2.5">
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
      )}
    </li>
  );
}
