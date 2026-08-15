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
import { useApi } from '../lib/useApi';
import { toQueryString } from '../lib/api';
import type { TrainerAnalysis, TrainerListItem } from '../lib/types';
import { Card, EmptyState, ErrorState, Loading, StatTile, TypeBadge } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { effectivenessLabel, titleCase } from '../lib/format';
import { PAGE_CONTAINER } from '../lib/page';
import { BAR_RADIUS, SERIES_1, axisProps, tooltipProps } from '../lib/charts';

/**
 * The team-leader dashboard: is this trainer's roster any good, and what beats
 * it.
 *
 * Distinct from `/dashboard`, which explores the whole Pokédex. Everything here
 * is one trainer's **active** roster, computed from the moves its members
 * actually carry — see CLAUDE.md § Roster analysis for why equipped and
 * learnable are not interchangeable.
 */
export function TeamPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('trainerId');

  // Unpaginated by design — it backs a select control. Same call the Trainers
  // page makes, so it is warm in the cache when arriving from there.
  const list = useApi<{ data: TrainerListItem[] }>('/api/trainers');

  return (
    <div className={PAGE_CONTAINER}>
      <PageHeader
        title="Team Dashboard"
        description="How one trainer's active roster holds up: what it can answer, what beats it, and whether it is set up at all."
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="team-trainer" className="mb-1 block text-xs font-medium text-muted">
            Trainer
          </label>
          <select
            id="team-trainer"
            value={selectedId ?? ''}
            onChange={(e) =>
              e.target.value ? setSearchParams({ trainerId: e.target.value }) : setSearchParams({})
            }
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

        {selectedId && (
          <Link
            to={`/trainers${toQueryString({ trainerId: selectedId })}`}
            className="pb-1.5 text-xs font-medium text-brand hover:underline"
          >
            Edit this roster →
          </Link>
        )}
      </div>

      {selectedId ? (
        <TeamAnalysis trainerId={selectedId} />
      ) : (
        <EmptyState
          title="Choose a trainer"
          description="Pick a trainer above to see how their team performs."
        />
      )}
    </div>
  );
}

function TeamAnalysis({ trainerId }: { trainerId: string }) {
  const { data, loading, error, refetch } = useApi<TrainerAnalysis>(
    `/api/trainers/${trainerId}/analysis`,
  );

  if (loading && !data) return <Loading label="Analysing team…" rows={4} />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!data) return null;

  const { readiness, threats, offense, defense, gaps } = data;

  if (readiness.activeMembers === 0) {
    return (
      <EmptyState
        title="No active roster"
        description="This trainer has nobody on their active roster, so there is no team to analyse. Retired members are excluded."
      />
    );
  }

  const unset = readiness.withoutMoveset + readiness.withPartialMoveset;

  // Both charts plot all 18 types, zeroes included: a type absent from a chart
  // reads as "not applicable", but a bar at zero reads as the gap it is.
  const offenseData = offense.map((entry) => ({
    type: titleCase(entry.type),
    members: entry.answeredBy,
  }));
  const defenseData = defense.map((entry) => ({
    type: titleCase(entry.type),
    members: entry.weakCount,
  }));

  return (
    <div className="space-y-5">
      {/* Readiness leads: every figure below is only as true as the movesets
          behind it, so an unfinished team says so before it is judged. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Active members" value={readiness.activeMembers} />
        <StatTile
          label="Full movesets"
          value={`${readiness.withFullMoveset}/${readiness.activeMembers}`}
          hint={unset > 0 ? `${unset} to finish` : 'all set'}
        />
        <StatTile
          label="Types answered"
          value={`${18 - gaps.length}/18`}
          hint="super-effectively"
        />
        <StatTile label="Open threats" value={threats.length} hint="unanswered weaknesses" />
      </div>

      {unset > 0 && (
        <p className="rounded-md border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-sm text-ink">
          {unset} of {readiness.activeMembers} members {unset === 1 ? 'has' : 'have'} an incomplete
          moveset, so this team is measured on less than it can field.{' '}
          <Link
            to={`/trainers${toQueryString({ trainerId })}`}
            className="font-medium text-brand hover:underline"
          >
            Set their moves →
          </Link>
        </p>
      )}

      <Card
        title="Open threats"
        subtitle="Types that hit two or more members hard and have no super-effective reply — either problem alone is survivable"
      >
        {threats.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing unanswered. Every type that hits several members hard has a super-effective
            reply somewhere on this team.
          </p>
        ) : (
          <ul className="space-y-2">
            {threats.map((threat) => (
              <li key={threat.type} className="flex flex-wrap items-center gap-2 text-sm">
                <TypeBadge type={threat.type} />
                <span className="font-medium text-ink">hits {threat.weakCount}</span>
                <span className="text-muted">{threat.weakMembers.join(', ')}</span>
                {threat.resistCount > 0 && (
                  <span className="text-xs text-muted">· {threat.resistCount} resist</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Attacking coverage"
          subtitle="Members with a super-effective answer to each type — a bar at zero is a gap"
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={offenseData} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
                <CartesianGrid vertical={false} stroke="var(--color-hairline)" />
                <XAxis dataKey="type" {...axisProps} angle={-35} textAnchor="end" height={58} />
                <YAxis {...axisProps} allowDecimals={false} />
                <Tooltip {...tooltipProps} />
                <Bar
                  isAnimationActive={false}
                  dataKey="members"
                  name="Members"
                  fill={SERIES_1}
                  radius={BAR_RADIUS}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card
          title="Defensive exposure"
          subtitle="Members taking 2× or worse from each attacking type"
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={defenseData} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
                <CartesianGrid vertical={false} stroke="var(--color-hairline)" />
                <XAxis dataKey="type" {...axisProps} angle={-35} textAnchor="end" height={58} />
                <YAxis {...axisProps} allowDecimals={false} />
                <Tooltip {...tooltipProps} />
                <Bar
                  isAnimationActive={false}
                  dataKey="members"
                  name="Members"
                  fill={SERIES_1}
                  radius={BAR_RADIUS}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card
        title="Coverage detail"
        subtitle="Best result this team achieves against each of the 18 types"
      >
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
                    ? `${entry.members.join(', ')} — ${effectivenessLabel(entry.bestMultiplier)}`
                    : noAnswer
                      ? 'Nothing on this team can damage this type'
                      : 'Neutral damage at best'
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
      </Card>

      <Card title="Members" subtitle="Moveset completeness across the active roster">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-muted">
                <th scope="col" className="px-2 py-2 font-medium">
                  Member
                </th>
                <th scope="col" className="px-2 py-2 text-right font-medium">
                  Moveset
                </th>
              </tr>
            </thead>
            <tbody>
              {readiness.members.map((member) => (
                <tr key={member.rosterId} className="border-b border-hairline last:border-0">
                  <td className="px-2 py-2 text-ink">
                    {member.nickname ?? member.displayName}
                    {member.nickname && (
                      <span className="ml-1.5 text-xs text-muted">({member.displayName})</span>
                    )}
                  </td>
                  <td
                    className={`px-2 py-2 text-right tabular-nums ${
                      member.movesetSize === 0 ? 'text-status-critical' : 'text-ink'
                    }`}
                  >
                    {member.movesetSize}/4
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
