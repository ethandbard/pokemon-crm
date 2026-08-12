import { Link } from 'react-router-dom';
import { useApi } from '../lib/useApi';
import type { DashboardResponse } from '../lib/types';
import { Card, ErrorState, Loading, StatTile } from '../components/ui';

interface Destination {
  to: string;
  title: string;
  description: string;
  /** The specific things you can do there — the "more detailed links" part. */
  bullets: string[];
  icon: React.ReactNode;
}

const iconWrap = (path: React.ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5"
    aria-hidden="true"
  >
    {path}
  </svg>
);

const DESTINATIONS: Destination[] = [
  {
    to: '/lookup',
    title: 'Pokémon Lookup',
    description: 'The full National Pokédex as a searchable, filterable table.',
    bullets: [
      'Search by name, filter by type, generation, or status flag',
      'Sort by any base stat or by base stat total',
      'Note counts and status icons shown inline per row',
    ],
    icon: iconWrap(
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </>,
    ),
  },
  {
    to: '/pokemon/25',
    title: 'Pokémon Profile',
    description: 'Everything on record for a single Pokémon.',
    bullets: [
      'Base stats charted against the 255-point ceiling',
      'Quick-search to jump straight to another Pokémon',
      'Notes and an interactive activity log for that Pokémon',
    ],
    icon: iconWrap(
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
      </>,
    ),
  },
  {
    to: '/trainers',
    title: 'Trainers',
    description: 'Trainers and the rosters of Pokémon they carry.',
    bullets: [
      'Search or select a trainer to open their dashboard',
      'Roster table with levels, status, and links to each profile',
      'Type coverage, mean stats, and note/activity history per roster',
    ],
    icon: iconWrap(
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 19a6 6 0 0 1 12 0" />
        <path d="M16 5.5a3 3 0 0 1 0 5.8" />
        <path d="M17.5 19a6 6 0 0 0-1.6-4.1" />
      </>,
    ),
  },
  {
    to: '/dashboard',
    title: 'Performance Dashboard',
    description: 'Exploratory analysis across the whole dataset.',
    bullets: [
      'Base stat total distribution and per-stat averages',
      'Type and generation breakdowns',
      'Attack vs. Speed correlation and the top 10 by BST',
    ],
    icon: iconWrap(
      <>
        <path d="M4 20V10" />
        <path d="M10 20V4" />
        <path d="M16 20v-7" />
        <path d="M22 20H2" />
      </>,
    ),
  },
  {
    to: '/notes',
    title: 'Notes',
    description: 'Every note you have written, across every Pokémon.',
    bullets: [
      'Full-text search across note bodies',
      'Filter by owner, sort by date or Pokémon',
      'Edit and delete inline without leaving the page',
    ],
    icon: iconWrap(
      <>
        <path d="M5 3.5h14v17l-3-2-2 2-2-2-2 2-3-2z" />
        <path d="M9 8h6M9 12h6" />
      </>,
    ),
  },
  {
    to: '/activity',
    title: 'Activity',
    description: 'Status flags across the collection as one interactive table.',
    bullets: [
      'Filter by flag kind, owner, or Pokémon name',
      'Sort by when a flag was set or last touched',
      'Remove a flag directly from the table',
    ],
    icon: iconWrap(<path d="M3 12h4l2.5-6 4 13 2.5-7H21" />),
  },
  {
    to: '/tableau',
    title: 'Tableau Dashboard',
    description: 'A published Tableau Public workbook, embedded in the app.',
    bullets: [
      'Type matchup matrix and average stats by type',
      'Side-by-side comparison of two Pokémon',
      'Served by Tableau Public — not backed by the CRM database',
    ],
    icon: iconWrap(
      <>
        <rect x="3" y="3.5" width="18" height="17" rx="2" />
        <path d="M3 9.5h18" />
        <path d="M11 9.5v11" />
      </>,
    ),
  },
];

export function HomePage() {
  // Reuses the dashboard aggregation rather than adding an endpoint just for
  // the landing page's counters.
  const { data, loading, error, refetch } = useApi<DashboardResponse>('/api/stats/dashboard');

  const activityTotal = data?.crm
    ? Object.values(data.crm.activity_counts).reduce((sum, n) => sum + (n ?? 0), 0)
    : 0;

  return (
    <div className="mx-auto max-w-[1200px] px-8 py-10">
      <header className="mb-8">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-lg font-bold text-white">
          P
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Pokémon CRM</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-2">
          A CRM-style workspace for the National Pokédex — look up any Pokémon, keep notes and
          status flags against it, and analyse the dataset as a whole. Built as a learning sandbox
          on the same patterns as a student-advising tool.
        </p>
      </header>

      {/* ---- Live counters ---- */}
      <section className="mb-9" aria-label="Workspace at a glance">
        <h2 className="mb-3 text-sm font-semibold text-ink">At a glance</h2>
        {loading && !data ? (
          <Loading label="Loading workspace totals…" />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Pokémon seeded" value={(data?.summary?.total ?? 0).toLocaleString()} />
            <StatTile label="Notes written" value={data?.crm?.note_count ?? 0} />
            <StatTile label="Status flags set" value={activityTotal} />
            <StatTile
              label="Pokémon with notes"
              value={data?.crm?.pokemon_with_notes ?? 0}
              hint="tracked records"
            />
          </div>
        )}
      </section>

      {/* ---- Where to go ---- */}
      <section aria-label="Pages">
        <h2 className="mb-3 text-sm font-semibold text-ink">Where to go</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {DESTINATIONS.map((destination) => (
            <Link
              key={destination.to}
              to={destination.to}
              className="group flex flex-col rounded-xl border border-hairline bg-surface p-5 transition-colors hover:border-brand focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
                {destination.icon}
              </span>
              <h3 className="text-sm font-semibold text-ink group-hover:text-brand">
                {destination.title}
              </h3>
              <p className="mt-1 text-sm text-muted">{destination.description}</p>
              <ul className="mt-3 space-y-1.5 border-t border-hairline pt-3">
                {destination.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-2 text-xs text-ink-2">
                    <span aria-hidden="true" className="text-brand">
                      ›
                    </span>
                    {bullet}
                  </li>
                ))}
              </ul>
              <span className="mt-4 text-xs font-medium text-brand">
                Open {destination.title} →
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ---- First-run guidance ---- */}
      {!loading && !error && (data?.summary?.total ?? 0) === 0 && (
        <Card title="No data yet" className="mt-8">
          <p className="text-sm text-muted">
            The <code className="rounded bg-plane px-1 py-0.5">pokemon</code> table is empty. Run{' '}
            <code className="rounded bg-plane px-1 py-0.5">npm run seed</code> to import the Pokédex
            from PokeAPI, then reload this page.
          </p>
        </Card>
      )}
    </div>
  );
}
