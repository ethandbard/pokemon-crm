import { useMemo, useState } from 'react';
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
import { toQueryString } from '../lib/api';
import type { DashboardResponse, FilterOptions } from '../lib/types';
import {
  Button,
  Card,
  DamageClassBadge,
  EmptyState,
  ErrorState,
  Loading,
  Select,
  StatTile,
  TypeBadge,
} from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { ACTIVITY_META, slugLabel, titleCase } from '../lib/format';
import { PAGE_CONTAINER } from '../lib/page';
import { SERIES_1, SERIES_2, axisProps, tooltipProps } from '../lib/charts';

/** BST bands offered as a coarse "how strong" filter. */
const BST_BANDS = [
  { value: '', label: 'Any base stat total' },
  { value: '0-399', label: 'Under 400' },
  { value: '400-499', label: '400–499' },
  { value: '500-599', label: '500–599' },
  { value: '600-1200', label: '600+' },
] as const;

export function DashboardPage() {
  /*
   * Filter state lives here and goes to the API, not to the charts: every
   * aggregation is recomputed server-side over the filtered set, so a filtered
   * histogram is a histogram OF the selection rather than the whole dex with
   * bars hidden.
   */
  const [type, setType] = useState('');
  const [generation, setGeneration] = useState('');
  const [legendary, setLegendary] = useState('');
  const [region, setRegion] = useState('');
  const [habitat, setHabitat] = useState('');
  const [eggGroup, setEggGroup] = useState('');
  const [bstBand, setBstBand] = useState('');

  const [minBaseStatTotal, maxBaseStatTotal] = bstBand ? bstBand.split('-') : ['', ''];

  const path = useMemo(
    () =>
      `/api/stats/dashboard${toQueryString({
        type,
        generation,
        legendary,
        region,
        habitat,
        eggGroup,
        minBaseStatTotal,
        maxBaseStatTotal,
      })}`,
    [type, generation, legendary, region, habitat, eggGroup, minBaseStatTotal, maxBaseStatTotal],
  );

  const { data, loading, error, refetch } = useApi<DashboardResponse>(path);
  const filters = useApi<FilterOptions>('/api/pokemon/filters');

  const hasFilters = Boolean(type || generation || legendary || region || habitat || eggGroup || bstBand);

  function clearFilters() {
    setType('');
    setGeneration('');
    setLegendary('');
    setRegion('');
    setHabitat('');
    setEggGroup('');
    setBstBand('');
  }

  const coverageData = useMemo(
    () => data?.moveCoverage.map((row) => ({ ...row, type: titleCase(row.type) })) ?? [],
    [data],
  );

  /** Types nothing in the current selection can attack with. */
  const coverageGaps = useMemo(
    () => data?.moveCoverage.filter((row) => row.species === 0) ?? [],
    [data],
  );

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

  /** Species with a habitat at all — the chart's coverage, stated in its subtitle. */
  const habitatTotal = useMemo(
    () => data?.habitatBreakdown.reduce((sum, row) => sum + row.count, 0) ?? 0,
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

  /* Rendered above every branch below, so the controls stay put whether the
     current selection has data, no matches, or is still loading. */
  const filterBar = (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type">
        <option value="">All types</option>
        {filters.data?.types.map((t) => (
          <option key={t} value={t}>
            {titleCase(t)}
          </option>
        ))}
      </Select>

      <Select
        value={generation}
        onChange={(e) => setGeneration(e.target.value)}
        aria-label="Filter by generation"
      >
        <option value="">All generations</option>
        {filters.data?.generations.map((g) => (
          <option key={g} value={g}>
            Generation {g}
          </option>
        ))}
      </Select>

      <Select
        value={region}
        onChange={(e) => setRegion(e.target.value)}
        aria-label="Filter by region"
      >
        <option value="">All regions</option>
        {filters.data?.regions.map((r) => (
          <option key={r} value={r}>
            {r} dex
          </option>
        ))}
      </Select>

      <Select
        value={eggGroup}
        onChange={(e) => setEggGroup(e.target.value)}
        aria-label="Filter by egg group"
      >
        <option value="">Any egg group</option>
        {filters.data?.eggGroups.map((g) => (
          <option key={g} value={g}>
            {slugLabel(g)}
          </option>
        ))}
      </Select>

      <Select
        value={habitat}
        onChange={(e) => setHabitat(e.target.value)}
        aria-label="Filter by habitat"
        title="PokeAPI records habitat for generations 1–3 only"
      >
        <option value="">Any habitat</option>
        {filters.data?.habitats.map((h) => (
          <option key={h} value={h}>
            {slugLabel(h)}
          </option>
        ))}
      </Select>

      <Select
        value={bstBand}
        onChange={(e) => setBstBand(e.target.value)}
        aria-label="Filter by base stat total"
      >
        {BST_BANDS.map((band) => (
          <option key={band.value} value={band.value}>
            {band.label}
          </option>
        ))}
      </Select>

      <Select
        value={legendary}
        onChange={(e) => setLegendary(e.target.value)}
        aria-label="Filter by legendary status"
      >
        <option value="">Legendary or not</option>
        <option value="true">Legendary only</option>
        <option value="false">Exclude legendaries</option>
      </Select>

      {hasFilters && <Button onClick={clearFilters}>Clear filters</Button>}

      {/* Says how much of the dataset every figure below covers — without it a
          filtered chart is indistinguishable from a dex-wide one. */}
      {data && (
        <span className="ml-auto text-xs text-muted">
          {data.scope.isFiltered ? (
            <>
              Scoped to{' '}
              <span className="font-medium text-ink">
                {data.scope.filtered.toLocaleString()}
              </span>{' '}
              of {data.scope.total.toLocaleString()} species
            </>
          ) : (
            `All ${data.scope.total.toLocaleString()} species`
          )}
        </span>
      )}
    </div>
  );

  if (loading && !data) {
    return (
      <div className={PAGE_CONTAINER}>
        <Loading label="Crunching the dataset…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={PAGE_CONTAINER}>
        <ErrorState message={error} onRetry={refetch} />
      </div>
    );
  }

  if (!data?.summary || data.summary.total === 0) {
    return (
      <div className={PAGE_CONTAINER}>
        <PageHeader title="Performance Dashboard" />
        {filterBar}
        <div className="rounded-xl border border-hairline bg-surface">
          {/* Two different emptinesses: an unseeded database and a filter that
              matches nothing are fixed by completely different actions. */}
          {hasFilters ? (
            <EmptyState
              title="No species match those filters"
              description="Every chart on this page is computed over the filtered set, so there is nothing to plot."
              action={<Button onClick={clearFilters}>Clear filters</Button>}
            />
          ) : (
            <EmptyState
              title="No data to analyse yet"
              description="The pokemon table is empty. Run `npm run seed` to import the Pokédex from PokeAPI, then reload."
            />
          )}
        </div>
      </div>
    );
  }

  const { summary, crm } = data;

  return (
    <div className={PAGE_CONTAINER}>
      <PageHeader
        title="Performance Dashboard"
        description={
          data.scope.isFiltered
            ? `Exploratory analysis across ${summary.total.toLocaleString()} of ${data.scope.total.toLocaleString()} seeded Pokémon.`
            : `Exploratory analysis across all ${summary.total.toLocaleString()} seeded Pokémon.`
        }
      />

      {filterBar}

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

        {/* ---- Species dimensions, from the PokeAPI species endpoint ---- */}
        <Card
          title="EV yield by stat"
          subtitle="How many species train each effort value — a species can train more than one"
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.evYieldBreakdown}
                margin={{ top: 8, right: 8, bottom: 4, left: -12 }}
              >
                <CartesianGrid vertical={false} stroke="var(--color-hairline)" />
                <XAxis dataKey="stat" {...axisProps} />
                <YAxis {...axisProps} />
                <Tooltip {...tooltipProps} />
                <Bar
                  isAnimationActive={false}
                  dataKey="count"
                  name="Species"
                  fill={SERIES_1}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card
          title="Egg groups"
          subtitle="Species per breeding group — a species in two groups counts under both"
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.eggGroupBreakdown}
                margin={{ top: 8, right: 8, bottom: 4, left: -12 }}
              >
                <CartesianGrid vertical={false} stroke="var(--color-hairline)" />
                <XAxis
                  dataKey="egg_group"
                  {...axisProps}
                  angle={-35}
                  textAnchor="end"
                  height={60}
                  tickFormatter={slugLabel}
                />
                <YAxis {...axisProps} />
                <Tooltip {...tooltipProps} labelFormatter={slugLabel} />
                <Bar
                  isAnimationActive={false}
                  dataKey="count"
                  name="Species"
                  fill={SERIES_1}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/*
          Habitat covers only generations 1–3 — PokeAPI assigns none beyond
          them. The subtitle says so rather than letting the chart read as a
          claim about the whole dex.
        */}
        <Card
          title="Habitat"
          subtitle={`Species per habitat — generations 1–3 only (${habitatTotal.toLocaleString()} of ${(data.summary?.total ?? 0).toLocaleString()} species classified)`}
          className="lg:col-span-2"
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.habitatBreakdown}
                margin={{ top: 8, right: 8, bottom: 4, left: -12 }}
              >
                <CartesianGrid vertical={false} stroke="var(--color-hairline)" />
                <XAxis dataKey="habitat" {...axisProps} tickFormatter={slugLabel} />
                <YAxis {...axisProps} />
                <Tooltip {...tooltipProps} labelFormatter={slugLabel} />
                <Bar
                  isAnimationActive={false}
                  dataKey="count"
                  name="Species"
                  fill={SERIES_1}
                  radius={[4, 4, 0, 0]}
                />
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

        {/* ---- Movepools: the join table, aggregated ---- */}
        <Card
          title="Movepool coverage"
          subtitle="Species that can attack with each type — status moves excluded, all 18 types shown"
          className="lg:col-span-2"
          actions={
            <Link to="/moves" className="text-xs font-medium text-brand hover:underline">
              Browse moves →
            </Link>
          }
        >
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={coverageData} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
                <CartesianGrid vertical={false} stroke="var(--color-hairline)" />
                <XAxis dataKey="type" {...axisProps} angle={-35} textAnchor="end" height={60} />
                <YAxis {...axisProps} />
                <Tooltip {...tooltipProps} />
                <Bar
                  isAnimationActive={false}
                  dataKey="species"
                  name="Species"
                  fill={SERIES_1}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {coverageGaps.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-hairline pt-3 text-xs">
              <span className="font-medium text-status-critical">
                <span aria-hidden="true">▲ </span>
                No species in this selection attacks with:
              </span>
              {coverageGaps.map((gap) => (
                <TypeBadge key={gap.type} type={gap.type} />
              ))}
            </div>
          )}
        </Card>

        <Card
          title="Moves by damage class"
          subtitle="Distinct moves this selection can learn, and their mean power"
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.moveClassBreakdown.map((row) => ({
                  ...row,
                  label: titleCase(row.damage_class),
                }))}
                margin={{ top: 8, right: 8, bottom: 4, left: -12 }}
              >
                <CartesianGrid vertical={false} stroke="var(--color-hairline)" />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} />
                <Tooltip {...tooltipProps} />
                <Bar
                  isAnimationActive={false}
                  dataKey="moves"
                  name="Moves"
                  fill={SERIES_1}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Mean power belongs beside the counts but not on the same axis —
              two measures on different scales are never one chart. */}
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-hairline pt-3 text-xs text-muted">
            {data.moveClassBreakdown.map((row) => (
              <li key={row.damage_class}>
                {titleCase(row.damage_class)} mean power:{' '}
                <span className="text-ink">{row.avg_power ?? '—'}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Movepool size" subtitle="Distinct moves learnable per species">
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              label="Distinct moves"
              value={(data.movepool?.distinct_moves ?? 0).toLocaleString()}
              hint="across this selection"
            />
            <StatTile label="Median movepool" value={data.movepool?.median_movepool ?? 0} />
            <StatTile label="Mean movepool" value={data.movepool?.avg_movepool ?? 0} />
            <StatTile
              label="Range"
              value={`${data.movepool?.min_movepool ?? 0}–${data.movepool?.max_movepool ?? 0}`}
            />
          </div>
          <ul className="mt-4 space-y-1.5 border-t border-hairline pt-3 text-xs text-muted">
            {[
              ['Learned by levelling', data.movepool?.level_up_rows],
              ['Taught by TM', data.movepool?.machine_rows],
              ['Inherited (egg)', data.movepool?.egg_rows],
              ['Move tutor', data.movepool?.tutor_rows],
            ].map(([label, value]) => (
              <li key={String(label)} className="flex justify-between gap-4">
                <span>{label}</span>
                <span className="tabular-nums text-ink">{(value ?? 0).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title="Most widely learned moves"
          subtitle="Counted within the current selection, not dex-wide"
          className="lg:col-span-2"
        >
          {data.topMoves.length === 0 ? (
            <EmptyState title="No movepool data" />
          ) : (
            <ol className="grid gap-1.5 sm:grid-cols-2">
              {data.topMoves.map((move, index) => (
                <li key={move.id}>
                  <Link
                    to={`/moves/${move.id}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-plane"
                  >
                    <span className="w-5 text-right text-xs tabular-nums text-muted">
                      {index + 1}
                    </span>
                    <span className="flex-1 truncate text-sm text-ink">{move.display_name}</span>
                    <TypeBadge type={move.type} />
                    <DamageClassBadge damageClass={move.damage_class} />
                    <span className="w-12 text-right text-sm font-medium tabular-nums text-ink">
                      {move.learners.toLocaleString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
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
