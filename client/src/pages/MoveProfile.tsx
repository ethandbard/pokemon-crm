import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
import { useApi, usePageClamp } from '../lib/useApi';
import type { MoveDetailResponse } from '../lib/types';
import {
  Card,
  DamageClassBadge,
  EmptyState,
  ErrorState,
  Loading,
  Paginator,
  Select,
  StatTile,
  TypeBadge,
} from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { dexNumber, learnMethodLabel, movePower, moveStat, slugLabel, titleCase } from '../lib/format';

const axisProps = {
  axisLine: false,
  tickLine: false,
  stroke: 'var(--color-muted)',
} as const;

export function MoveProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [learnMethod, setLearnMethod] = useState('');
  const [page, setPage] = useState(1);

  const { data, loading, error, refetch } = useApi<MoveDetailResponse>(
    `/api/moves/${id}${toQueryString({ learnMethod, page, pageSize: 25 })}`,
  );
  usePageClamp(data?.pagination, setPage);

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-[1200px] px-8 py-7">
        <Loading label="Loading move…" />
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

  const { move, learners, methodBreakdown, typeBreakdown, trainers } = data;
  const typeData = typeBreakdown.slice(0, 10).map((row) => ({ ...row, type: titleCase(row.type) }));

  return (
    <div className="mx-auto max-w-[1200px] px-8 py-7">
      <PageHeader
        title={move.displayName}
        description={`${titleCase(move.type)} · ${titleCase(move.damageClass)}${
          move.generation ? ` · introduced in generation ${move.generation}` : ''
        }`}
        actions={
          <Link
            to={`/lookup${toQueryString({ moveId: move.id })}`}
            className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-plane"
          >
            Open learners in Lookup →
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {/* Nulls read "—", never 0: a status move has no power and a move with
            no accuracy cannot miss. */}
        <StatTile label="Power" value={movePower(move.power)} />
        <StatTile label="Accuracy" value={move.accuracy === null ? 'Never misses' : `${move.accuracy}%`} />
        <StatTile label="PP" value={moveStat(move.pp)} />
        <StatTile
          label="Priority"
          value={move.priority > 0 ? `+${move.priority}` : String(move.priority)}
          hint="turn order"
        />
        <StatTile label="Learned by" value={move.learnedByCount.toLocaleString()} hint="species" />
        <StatTile
          label="Trainers"
          value={trainers.length}
          hint="with an active learner"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <div className="space-y-5">
          <Card title="Effect" subtitle={move.target ? `Targets: ${slugLabel(move.target)}` : undefined}>
            <div className="mb-3 flex flex-wrap gap-1.5">
              <TypeBadge type={move.type} />
              <DamageClassBadge damageClass={move.damageClass} />
            </div>
            <p className="text-sm leading-relaxed text-ink">
              {move.effect ?? 'No effect text recorded for this move.'}
            </p>
            {move.flavorText && (
              <p className="mt-3 border-t border-hairline pt-3 text-xs text-muted">
                {move.flavorText}
              </p>
            )}

            <dl className="mt-4 space-y-2 border-t border-hairline pt-4 text-sm">
              {[
                [
                  'Status effect',
                  move.ailment && move.ailment !== 'none'
                    ? `${slugLabel(move.ailment)}${move.ailmentChance ? ` (${move.ailmentChance}%)` : ''}`
                    : '—',
                ],
                ['Effect chance', move.effectChance !== null ? `${move.effectChance}%` : '—'],
                ['Crit rate bonus', move.critRate ? `+${move.critRate}` : '—'],
                // One column, two directions: positive drains the target,
                // negative is recoil taken by the user.
                [
                  'Drain / recoil',
                  move.drain ? (move.drain > 0 ? `Heals ${move.drain}%` : `Recoil ${Math.abs(move.drain)}%`) : '—',
                ],
                ['Healing', move.healing ? `${move.healing}%` : '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-muted">{label}</dt>
                  <dd className="text-right text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card title="How it's learned" subtitle="Routes into this move across the dex">
            {methodBreakdown.length === 0 ? (
              <EmptyState title="Nothing learns this move" />
            ) : (
              <ul className="space-y-2">
                {methodBreakdown.map((row) => (
                  <li
                    key={row.learn_method}
                    className="flex items-center justify-between gap-3 rounded-lg border border-hairline p-2.5"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-ink">
                        {learnMethodLabel(row.learn_method)}
                      </span>
                      {row.avg_level !== null && (
                        <span className="block text-xs text-muted">
                          mean level {row.avg_level}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                      {row.count.toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* The CRM half — which caseloads this move is actually available on.
              Active roster only, matching every other roster figure. */}
          <Card
            title="On rosters"
            subtitle={
              trainers.length === 0
                ? 'No active roster member learns this'
                : 'Trainers with an active roster member that learns this'
            }
          >
            {trainers.length === 0 ? (
              <EmptyState
                title="Not on any roster"
                description="No trainer currently carries a Pokémon that can learn this move."
              />
            ) : (
              <ul className="space-y-2">
                {trainers.map((row) => (
                  <li key={row.trainer_id}>
                    <Link
                      to={`/trainers${toQueryString({ trainerId: row.trainer_id })}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-hairline p-2.5 hover:border-brand hover:bg-plane"
                    >
                      <span className="truncate text-xs font-medium text-ink">
                        {row.trainer_name}
                      </span>
                      <span className="shrink-0 text-xs text-muted">
                        {row.learners} of {row.active_roster} active
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card
            title="Types that learn it"
            subtitle="Species per type — dual-typed species count under both"
          >
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={typeData} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
                  <CartesianGrid vertical={false} stroke="var(--color-hairline)" />
                  <XAxis dataKey="type" {...axisProps} angle={-35} textAnchor="end" height={58} />
                  <YAxis {...axisProps} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: 'var(--color-plane)' }}
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid var(--color-hairline)',
                      backgroundColor: 'var(--color-surface)',
                      fontSize: 12,
                    }}
                  />
                  {/* Single series — no legend; the card title names the measure. */}
                  <Bar
                    isAnimationActive={false}
                    dataKey="count"
                    name="Species"
                    fill="var(--color-series-1)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card
            title="Who learns it"
            subtitle="Level-up entries first, in level order"
            actions={
              <Select
                value={learnMethod}
                onChange={(e) => {
                  setLearnMethod(e.target.value);
                  setPage(1);
                }}
                aria-label="Filter learners by learn method"
              >
                <option value="">All methods</option>
                {methodBreakdown.map((row) => (
                  <option key={row.learn_method} value={row.learn_method}>
                    {learnMethodLabel(row.learn_method)} ({row.count})
                  </option>
                ))}
              </Select>
            }
            className="overflow-hidden"
          >
            {learners.length === 0 ? (
              <EmptyState
                title="No species match"
                description="No Pokémon learns this move by that method."
              />
            ) : (
              <div className="-mx-5 -mb-5">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-y border-hairline text-xs text-muted">
                        <th scope="col" className="px-3 py-2 text-right font-medium">
                          #
                        </th>
                        <th scope="col" className="px-3 py-2 text-left font-medium">
                          Pokémon
                        </th>
                        <th scope="col" className="px-3 py-2 text-left font-medium">
                          Types
                        </th>
                        <th scope="col" className="px-3 py-2 text-left font-medium">
                          Method
                        </th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">
                          Level
                        </th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">
                          BST
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {learners.map((learner) => (
                        <tr
                          key={`${learner.pokemonId}-${learner.learnMethod}`}
                          className="border-b border-hairline/70 last:border-0 hover:bg-plane"
                        >
                          <td className="px-3 py-2 text-right tabular-nums text-muted">
                            {dexNumber(learner.pokemonId)}
                          </td>
                          <td className="px-3 py-2">
                            <Link
                              to={`/pokemon/${learner.pokemonId}`}
                              className="flex items-center gap-2 font-medium text-ink hover:text-brand"
                            >
                              {learner.spriteUrl && (
                                <img
                                  src={learner.spriteUrl}
                                  alt=""
                                  width={28}
                                  height={28}
                                  loading="lazy"
                                  className="h-7 w-7 shrink-0"
                                />
                              )}
                              {learner.displayName}
                              {/* Same-type attack bonus — the move matches one
                                  of its own types, so it hits harder. */}
                              {learner.isStab && (
                                <span
                                  title="Same-type attack bonus"
                                  className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand-strong"
                                >
                                  STAB
                                </span>
                              )}
                            </Link>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              <TypeBadge type={learner.type1} />
                              {learner.type2 && <TypeBadge type={learner.type2} />}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted">
                            {learnMethodLabel(learner.learnMethod)}
                            {learner.versionGroup && (
                              <span className="block text-[11px]">
                                {slugLabel(learner.versionGroup)}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {learner.levelLearnedAt > 0 ? learner.levelLearnedAt : '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted">
                            {learner.baseStatTotal}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Paginator
                  pagination={data.pagination}
                  onChange={setPage}
                  label="species"
                  labelPlural="species"
                  compact
                />
              </div>
            )}
          </Card>

          <p className="text-xs text-muted">
            <Link to="/moves" className="text-brand hover:underline">
              ← Back to all moves
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
