# Pokémon CRM

A CRM-style tool for looking up Pokémon, tracking notes, and viewing performance
stats — a personal learning sandbox modelled after the patterns used in student
advising tools.

- **Home** — landing page with live workspace counters and links into every section
- **Trainers** — pick a trainer to open a dashboard of their roster, stats, and note/activity history
- **Pokémon Lookup** — searchable, filterable, sortable table of all 1,025 Pokémon (filterable by trainer)
- **Pokémon Profile** — base-stat chart, notes, an interactive activity log, and a quick-search to jump between Pokémon
- **Performance Dashboard** — EDA charts across the dataset (distributions, type and generation breakdowns, correlations)
- **Notes** — cross-Pokémon note feed, sortable and filterable
- **Activity** — every status flag as one interactive, filterable table
- **Tableau Dashboard** — an embedded Tableau Public workbook alongside the in-app analytics

Vite + React + TypeScript + Tailwind on the front, Express + Drizzle + PostgreSQL
behind it, Recharts for the visualisations.

## Getting started

There is no container — this is a local dev setup. Start to finish it's about
ten minutes, most of which is the Pokédex import.

### 1. Prerequisites

| Need | Version | Notes |
|---|---|---|
| Node.js | 20 or newer | Ships with npm 10+ |
| PostgreSQL | 14 or newer | Any local server; the app creates its own database |

Installing PostgreSQL, if you don't already have it:

```bash
# macOS
brew install postgresql@16 && brew services start postgresql@16

# Debian / Ubuntu
sudo apt install postgresql && sudo systemctl start postgresql

# Windows
winget install PostgreSQL.PostgreSQL.16
```

The Windows and Linux installers ask you to set a password for the `postgres`
user — keep it, you'll need it in step 3. Homebrew instead creates a
passwordless account named after your macOS user.

### 2. Install dependencies

```bash
git clone https://github.com/ethandbard/pokemon-crm.git
cd pokemon-crm
npm install
```

### 3. Configure the database connection

```bash
cp .env.example .env
```

Edit `.env` so `DATABASE_URL` matches the server you just installed — the
template assumes `postgres:postgres@localhost:5432`, which is almost certainly
not your password:

```
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/pokemon_crm
```

On Homebrew, where there's no password, it's usually
`postgres://YOUR_MAC_USERNAME@localhost:5432/pokemon_crm`.

Leave `PGSSL=false` for local development. Everything else in the file has a
working default.

### 4. Create and populate the database

```bash
npm run setup
```

That runs four steps in order, and each is safe to re-run on its own:

| Step | Script | What it does |
|---|---|---|
| 1 | `npm run db:create` | Creates the `pokemon_crm` database if it isn't there |
| 2 | `npm run db:migrate` | Applies the migrations in `server/drizzle/` |
| 3 | `npm run seed` | Imports the Pokédex from [PokeAPI](https://pokeapi.co) |
| 4 | `npm run seed:trainers` | Creates the demo trainers, rosters, and review history |

**Step 3 is the slow one** — roughly 2,600 requests to PokeAPI for 1,025
Pokémon, their species records, 541 evolution chains, and 6 growth-rate curves.
Expect 3–5 minutes. For a fast run, set `SEED_LIMIT=151` in `.env` first
(Gen 1 only) — `seed:trainers` will then skip the roster entries whose Pokémon
weren't imported and tell you which.

Nothing about the data is checked into the repo: the seed scripts *are* the
data collection, and they fetch everything live.

### 5. Run it

```bash
npm run dev
```

The app is at http://localhost:5173 and the API at http://localhost:4000.

### Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `database "pokemon_crm" does not exist` | `db:migrate` ran before `db:create`. Run `npm run setup`, or just `npm run db:create`. |
| `ECONNREFUSED` on any db script | PostgreSQL isn't running, or the host/port in `.env` is wrong. |
| `password authentication failed` | The password in `DATABASE_URL` doesn't match the one set during install. |
| `Cannot find module '@esbuild/...'` after install | npm 11 blocks package install scripts. The approvals are committed in `package.json`; if your npm still skips them, run `npm approve-scripts esbuild && npm rebuild esbuild`. |
| Seed fails partway | It's idempotent — just run `npm run seed` again. It upserts, so notes and rosters survive. |
| Port 4000 or 5173 already in use | Change `PORT` in `.env`; the Vite port is in `client/vite.config.ts`. |

## Scripts

| Command | Does |
|---|---|
| `npm run setup` | Create, migrate, and populate the database in one go |
| `npm run dev` | API + web dev servers together |
| `npm run build` | Typecheck and build both workspaces |
| `npm run typecheck` | Typecheck only |
| `npm run db:create` | Create the database if it doesn't exist (idempotent) |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:generate` | Generate a migration from schema changes |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run seed` | Import Pokémon from PokeAPI (idempotent) |
| `npm run seed:trainers` | Create trainers and rosters (idempotent; run after `seed`) |

## Where the data comes from

Everything is fetched at seed time from [PokeAPI](https://pokeapi.co) — no
dataset is vendored into the repo.

| Script | Endpoints | Populates |
|---|---|---|
| `server/src/scripts/seed.ts` | `/pokemon`, `/pokemon-species`, `/evolution-chain`, `/growth-rate` | `pokemon`, `growth_rates` |
| `server/src/scripts/seed-trainers.ts` | none — fixtures defined in the file | `trainers`, `roster`, plus a demo review history in `activity` |

The trainers, rosters, levels, and roster tenure are invented demo fixtures, not
Pokémon canon. They exist so the needs-attention queue has something real to
rank; see [TODO.md](TODO.md) for why the tenure and review history have to be
seeded rather than left empty.

## Documentation

[CLAUDE.md](CLAUDE.md) covers the architecture, folder structure, data model,
API surface, and coding conventions.
