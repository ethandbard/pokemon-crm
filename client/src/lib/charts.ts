/**
 * Shared Recharts styling — the chrome every chart in the app wears.
 *
 * Charting conventions (see CLAUDE.md § Charting):
 *  - Single-series charts use SERIES_1 and carry no legend; the card title
 *    names the measure.
 *  - Multi-series charts get a legend, and never a second y-axis: two measures
 *    on different scales become two charts.
 *  - Grid and axes are recessive; marks are thin with rounded data-ends.
 *  - Every chart sets `isAnimationActive={false}` so headless screenshots are
 *    deterministic.
 *
 * These live here rather than per-page because they were already duplicated
 * verbatim across two pages before a third arrived. Change the look here.
 */

/** Categorical palette, assigned in fixed order and never cycled. */
export const SERIES_1 = 'var(--color-series-1)';
export const SERIES_2 = 'var(--color-series-2)';
export const SERIES_3 = 'var(--color-series-3)';
export const SERIES_4 = 'var(--color-series-4)';

export const axisProps = {
  axisLine: false,
  tickLine: false,
  stroke: 'var(--color-muted)',
} as const;

export const tooltipProps = {
  cursor: { fill: 'var(--color-plane)' },
  contentStyle: {
    borderRadius: 8,
    border: '1px solid var(--color-hairline)',
    backgroundColor: 'var(--color-surface)',
    fontSize: 12,
  },
} as const;

/** Rounded data-ends for a vertical bar. */
export const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];
