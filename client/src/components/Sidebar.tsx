import { NavLink } from 'react-router-dom';
import { UserSwitcher } from './UserSwitcher';

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
    to: '/lookup',
    label: 'Pokémon Lookup',
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
    to: '/moves',
    label: 'Moves',
    icon: icon(
      <>
        <path d="M13 3 5 13h6l-2 8 8-10h-6z" />
      </>,
    ),
  },
  {
    to: '/trainers',
    label: 'Trainers',
    icon: icon(
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 19a6 6 0 0 1 12 0" />
        <path d="M16 5.5a3 3 0 0 1 0 5.8" />
        <path d="M17.5 19a6 6 0 0 0-1.6-4.1" />
      </>,
    ),
  },
  {
    // Sits next to Trainers: it answers a question about one roster, where the
    // Performance Dashboard below explores the whole dex.
    to: '/team',
    label: 'Team Dashboard',
    icon: icon(
      <>
        <path d="M12 3l7.5 4v5c0 4.2-3 7.6-7.5 9-4.5-1.4-7.5-4.8-7.5-9V7z" />
        <path d="m9 12 2 2 4-4" />
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
    to: '/activity',
    label: 'Activity',
    icon: icon(
      <>
        <path d="M3 12h4l2.5-6 4 13 2.5-7H21" />
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
  {
    // Last in the rail: workspace plumbing, not day-to-day work.
    to: '/admin',
    label: 'Admin',
    icon: icon(
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
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
      {/* The logo is the link home — see the Home page for the landing view. */}
      <NavLink
        to="/"
        end
        title="Pokémon CRM — home"
        className="group relative mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-brand font-mono text-sm font-bold text-white transition-colors hover:bg-brand-strong"
      >
        P
        {/* A small pulsing lens light, like a Pokédex's power indicator. */}
        <span
          aria-hidden="true"
          className="dex-dot absolute -right-0.5 -top-0.5 ring-2 ring-surface"
        />
        <span className="sr-only">Pokémon CRM home</span>
        <span className="pointer-events-none absolute left-full z-20 ml-2 hidden whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-normal text-white group-hover:block">
          Pokémon CRM — home
        </span>
      </NavLink>

      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          title={item.label}
          className={({ isActive }) =>
            [
              'group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
              isActive ? 'bg-brand/10 text-brand' : 'text-muted hover:bg-plane hover:text-brand',
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

      {/* Pinned to the foot of the rail — who you are writing as is always visible. */}
      <UserSwitcher />
    </nav>
  );
}
