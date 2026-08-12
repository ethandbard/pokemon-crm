import { NavLink } from 'react-router-dom';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  end?: boolean;
}

/* Inline 20px stroke icons — keeps the app dependency-free of an icon package. */
const icon = (path: React.ReactNode) => (
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

const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    label: 'Pokémon Lookup',
    end: true,
    icon: icon(
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </>,
    ),
  },
  {
    to: '/pokemon/25',
    label: 'Pokémon Profile',
    icon: icon(
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
      </>,
    ),
  },
  {
    to: '/dashboard',
    label: 'Performance Dashboard',
    icon: icon(
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
    label: 'Notes',
    icon: icon(
      <>
        <path d="M5 3.5h14v17l-3-2-2 2-2-2-2 2-3-2z" />
        <path d="M9 8h6M9 12h6" />
      </>,
    ),
  },
  {
    to: '/tableau',
    label: 'Tableau Dashboard',
    icon: icon(
      <>
        <rect x="3" y="3.5" width="18" height="17" rx="2" />
        <path d="M3 9.5h18" />
        <path d="M11 9.5v11" />
      </>,
    ),
  },
];

export function Sidebar() {
  return (
    <nav
      aria-label="Primary"
      className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-hairline bg-surface py-4"
    >
      <div
        className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-series-1 text-sm font-bold text-white"
        title="Pokémon CRM"
      >
        P
      </div>

      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          title={item.label}
          className={({ isActive }) =>
            [
              'group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
              isActive ? 'bg-series-1/10 text-series-1' : 'text-muted hover:bg-plane hover:text-ink',
            ].join(' ')
          }
        >
          {item.icon}
          <span className="sr-only">{item.label}</span>
          {/* Icon-only rails need a label on hover to stay usable. */}
          <span className="pointer-events-none absolute left-full z-20 ml-2 hidden whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-white group-hover:block">
            {item.label}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}
