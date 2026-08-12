import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { useApi } from '../lib/useApi';
import type { DashboardResponse } from '../lib/types';
import { Card, EmptyState, ErrorState, Loading, StatTile } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { ACTIVITY_META, titleCase } from '../lib/format';

/*
 * Charting conventions (see CLAUDE.md § Charting):
 *  - Single-series charts use --color-series-1 and carry no legend; the card
 *    title names the measure.
 *  - Multi-series charts get a legend, and never a second y-axis: two measures
 *    on different scales become two charts.
 *  - Grid and axes are recessive; marks are thin with rounded data-ends.
 */
const SERIES_1 = 'var(--color-series-1)';
const SERIES_2 = 'var(--color-series-2)';

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

export function DashboardPage() {
  const { data, loading, error, refetch } = useApi<DashboardResponse>('/api/stats/dashboard');

  const histogram = useMemo(
    () =>
      data?.statDistribution.map((bucket) => ({
        label: `${bucket.bucket_start}`,
        range: `${bucket.bucket_start}–${bucket.bucket_end}`,
        count: bucket.count,
      })) ?? [],
    [data],
  );

  const typeData = useMemo(
    () => data?.typeBreakdown.map((row) => ({ ...row, type: titleCase(row.type) })) ?? [],
    [data],
  );

  const statSpread = useMemo(
    () =>
      data?.statAverages.map((row) => ({
        stat: row.stat,
        Average: row.avg,
        Median: row.median,
      })) ?? [],
    [data],
  );

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-[1400px] px-8 py-7">
        <Loading label="Crunching the dataset…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[1400px] px-8 py-7">
        <ErrorState message={error} onRetry={refetch} />
      </div>
    );
  }

  if (!data?.summary || data.summary.total === 0) {
    return (
      <div className="mx-auto max-w-[1400px] px-8 py-7">
        <PageHeader title="Performance Dashboard" />
        <div className="rounded-xl border border-hairline bg-surface">
          <EmptyState
            title="No data to analyse yet"
            description="The pokemon table is empty. Run `npm run seed` to import the Pokédex from PokeAPI, then reload."
          />
        </div>
      </div>
    );
  }

  const { summary, crm } = data;

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-7">
      <PageHeader
        title="Performance Dashboard"
        description={`Exploratory analysis across all ${summary.total.toLocaleString()} seeded Pokémon.`}
      />

      {/* ---- Headline figures ---- */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Pokémon" value={summary.total.toLocaleString()} />
        <StatTile label="Mean BST" value={summary.avg_base_stat_total} hint="base stat total" />
        <StatTile label="Median BST" value={summary.median_base_stat_total} />
        <StatTile
          label="BST range"
          value={`${summary.min_base_stat_total}–${summary.max_base_stat_total}`}
        />
        <StatTile label="Legendary" value={summary.legendary} />
        <StatTile label="Mythical" value={summary.mythical} />
      </div>

      {/* ---- CRM activity: sits directly under the headline tiles ---- */}
      <Card
        title="CRM activity"
        subtitle="Notes and status flags recorded in this workspace"
        className="mb-5"
        actions={
          <Link to="/activity" className="text-xs font-medium text-brand hover:underline">
            View activity table →
          </Link>
        }
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          <StatTile label="Notes" value={crm?.note_count ?? 0} />
          <StatTile label="Pokémon with notes" value={crm?.pokemon_with_notes ?? 0} />
          {(Object.keys(ACTIVITY_META) as (keyof typeof ACTIVITY_META)[]).map((kind) => (
            <StatTile
              key={kind}
              label={ACTIVITY_META[kind].label}
              value={crm?.activity_counts?.[kind] ?? 0}
            />
          ))}
        </div>
        {(crm?.note_count ?? 0) === 0 && (
          <p className="mt-4 text-sm text-muted">
            No CRM activity yet — open a{' '}
            <Link to="/lookup" className="text-brand hover:underline">
              Pokémon profile
            </Link>{' '}
            to add a note or set a status flag.
          </p>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ---- Distribution ---- */}
        <Card
          title="Base stat total distribution"
          subtitle="Count of Pokémon per 50-point band"
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histogram} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
                <CartesianGrid vertical={false} stroke="var(--color-hairline)" />
                <XAxis dataKey="label" {...axisProps} interval={1} />
                <YAxis {...axisProps} />
                <Tooltip
                  {...tooltipProps}
                  labelFormatter={(_label, payload) => payload?.[0]?.payload?.range ?? ''}
                />
                <Bar isAnimationActive={false} dataKey="count" name="Pokémon" fill={SERIES_1} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* ---- Stat averages: two series, so a legend is present ---- */}
        <Card title="Stat averages" subtitle="Mean and median for each of the six base stats">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              {/* barGap of 2 gives the required surface gap between paired bars. */}
              <BarChart data={statSpread} barGap={2} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
                <CartesianGrid vertical={false} stroke="var(--color-hairline)" />
                <XAxis dataKey="stat" {...axisProps} />
                <YAxis {...axisProps} />
                <Tooltip {...tooltipProps} />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: 'var(--color-ink-2)' }}
                  iconType="circle"
                  iconSize={8}
                />
                <Bar isAnimationActive={false} dataKey="Average" fill={SERIES_1} radius={[4, 4, 0, 0]} />
                <Bar isAnimationActive={false} dataKey="Median" fill={SERIES_2} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* ---- Type breakdown ---- */}
        <Card
          title="Type breakdown"
          subtitle="Pokémon per type — dual-typed Pokémon count under both of their types"
          className="lg:col-span-2"
        >
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={typeData} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
                <CartesianGrid vertical={false} stroke="var(--color-hairline)" />
                <XAxis dataKey="type" {...axisProps} angle={-35} textAnchor="end" height={60} />
                <YAxis {...axisProps} />
                <Tooltip {...tooltipProps} />
                <Bar isAnimationActive={false} dataKey="count" name="Pokémon" fill={SERIES_1} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* ---- Generation: two measures on different scales => two charts ---- */}
        <Card title="Pokémon per generation" subtitle="Count of species introduced">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.generationBreakdown}
                margin={{ top: 8, right: 8, bottom: 4, left: -12 }}
              >
                <CartesianGrid vertical={false} stroke="var(--color-hairline)" />
                <XAxis dataKey="generation" {...axisProps} tickFormatter={(g) => `Gen ${g}`} />
                <YAxis {...axisProps} />
                <Tooltip {...tooltipProps} labelFormatter={(g) => `Generation ${g}`} />
                <Bar isAnimationActive={false} dataKey="count" name="Pokémon" fill={SERIES_1} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Mean base stat total by generation" subtitle="Power creep, measured">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data.generationBreakdown}
                margin={{ top: 8, right: 12, bottom: 4, left: -12 }}
              >
                <CartesianGrid vertical={false} stroke="var(--color-hairline)" />
                <XAxis dataKey="generation" {...axisProps} tickFormatter={(g) => `Gen ${g}`} />
                <YAxis {...axisProps} domain={['dataMin - 20', 'dataMax + 20']} />
                <Tooltip {...tooltipProps} cursor={{ stroke: 'var(--color-baseline)' }} labelFormatter={(g) => `Generation ${g}`} />
                <Line isAnimationActive={false}
                  type="monotone"
                  dataKey="avg_base_stat_total"
                  name="Mean BST"
                  stroke={SERIES_1}
                  strokeWidth={2}
                  dot={{ r: 4, fill: SERIES_1, strokeWidth: 0 }}
                  activeDot={{ r: 6, stroke: 'var(--color-surface)', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* ---- Attack vs Speed ---- */}
        <Card
          title="Attack vs. Speed"
          subtitle="One point per odd-numbered Pokédex entry (a stable 50% sample)"
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
                <CartesianGrid stroke="var(--color-hairline)" />
                <XAxis type="number" dataKey="attack" name="Attack" {...axisProps} />
                <YAxis type="number" dataKey="speed" name="Speed" {...axisProps} />
                <ZAxis range={[36, 36]} />
                <Tooltip
                  {...tooltipProps}
                  cursor={{ strokeDasharray: '3 3', stroke: 'var(--color-baseline)' }}
                  formatter={(value: number, name: string) => [value, name]}
                  labelFormatter={() => ''}
                />
                <Scatter isAnimationActive={false}
                  data={data.scatter}
                  name="Pokémon"
                  fill={SERIES_1}
                  fillOpacity={0.45}
                  stroke="var(--color-surface)"
                  strokeWidth={1}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* ---- Top 10 ---- */}
        <Card title="Strongest by base stat total" subtitle="Top 10 across the dataset">
          {data.topPokemon.length === 0 ? (
            <EmptyState title="Nothing to rank" />
          ) : (
            <ol className="space-y-1.5">
              {data.topPokemon.map((entry, index) => (
                <li key={entry.id}>
                  <Link
                    to={`/pokemon/${entry.id}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-plane"
                  >
                    <span className="w-5 text-right text-xs tabular-nums text-muted">
                      {index + 1}
                    </span>
                    {entry.spriteUrl && (
                      <img src={entry.spriteUrl} alt="" width={32} height={32} className="h-8 w-8" />
                    )}
                    <span className="flex-1 truncate text-sm text-ink">{entry.displayName}</span>
                    {/* Bar as a proportional rule, scaled to the leader. */}
                    <span
                      className="h-2 rounded-full bg-series-1"
                      style={{
                        width: `${(entry.baseStatTotal / data.topPokemon[0]!.baseStatTotal) * 88}px`,
                      }}
                      aria-hidden="true"
                    />
                    <span className="w-10 text-right text-sm font-medium tabular-nums text-ink">
                      {entry.baseStatTotal}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Card>

      </div>
    </div>
  );
}
