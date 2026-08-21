# Pokémon CRM

[![CI](https://github.com/ethandbard/pokemon-crm/actions/workflows/ci.yml/badge.svg)](https://github.com/ethandbard/pokemon-crm/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A CRM-style tool for looking up Pokémon, tracking notes, and viewing performance
stats, modelled on student-advising tools.

- **Home** — workspace counters and links into every section
- **Trainers** — per-trainer dashboard of roster, stats, and note/activity history
- **Pokémon Lookup** — searchable, filterable, sortable table of all 1,025 Pokémon
- **Pokémon Profile** — base-stat chart, movepool, notes, activity log, quick search
- **Moves** — the move catalogue, who learns each move, and how
- **Performance Dashboard** — EDA charts across the dataset, filterable by type,
  generation, region, egg group, habitat and base stat total
- **Notes** — cross-Pokémon note feed
- **Activity** — every status flag as one filterable table
- **Tableau Dashboard** — embedded Tableau Public workbook

Vite + React + TypeScript + Tailwind on the front, Express + Drizzle + PostgreSQL
behind it, Recharts for the visualisations.

## Getting started

Local dev setup, no container. Roughly ten minutes, most of it the Pokédex
import.

### 1. Prerequisites

| Need | Version | Notes |
|---|---|---|
| Node.js | 20 or newer | Ships with npm 10+ |
| PostgreSQL | 14 or newer | Any local server; the app creates its own database |

```bash
# macOS
brew install postgresql@16 && brew services start postgresql@16

# Debian / Ubuntu
sudo apt install postgresql && sudo systemctl start postgresql

# Windows
winget install PostgreSQL.PostgreSQL.16
```

The Windows and Linux installers set a password for the `postgres` user — you
need it in step 3. Homebrew creates a passwordless account named after your
macOS user.

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

Edit `DATABASE_URL` to match your server:

```
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/pokemon_crm
```

On Homebrew: `postgres://YOUR_MAC_USERNAME@localhost:5432/pokemon_crm`.

Leave `PGSSL=false` for local development. Everything else has a working
default.

### 4. Create and populate the database

```bash
npm run setup
```

Four steps in order, each safe to re-run on its own:

| Step | Script | What it does |
|---|---|---|
| 1 | `npm run db:create` | Creates the `pokemon_crm` database if it isn't there |
| 2 | `npm run db:migrate` | Applies the migrations in `server/drizzle/` |
| 3 | `npm run seed` | Imports the Pokédex from [PokeAPI](https://pokeapi.co) |
| 4 | `npm run seed:trainers` | Creates the demo users, trainers, rosters, and review history |

Step 3 takes 5–8 minutes — roughly 3,500 requests for 1,025 Pokémon, their
species records, 541 evolution chains, 6 growth-rate curves, 797 moves, and 33
version groups. For a fast run, set `SEED_LIMIT=151` in `.env` first;
`seed:trainers` will then skip roster entries whose Pokémon weren't imported and
report which. `SEED_MOVES=false` skips the moves import, which is the slowest
part; the Moves pages then show their empty states.

No data is checked into the repo; the seed scripts fetch everything live.

### 5. Run it

```bash
npm run dev
```

Web at http://localhost:5173, API at http://localhost:4000.

## Production

Production is a Docker Compose stack on the VPS, published at
[pokemon-crm.ethandbard.com](https://pokemon-crm.ethandbard.com). The compose
file runs the app and Postgres 16, joins the shared `edge` network, and
publishes no host port. `config.env` is gitignored.

`git push` does not deploy. Copy `HEAD` to `/opt/pokemon-crm` through the
private `deploy-pipeline` skill, then rebuild.

### Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `database "pokemon_crm" does not exist` | `db:migrate` ran before `db:create`. Run `npm run setup`, or just `npm run db:create`. |
| `ECONNREFUSED` on any db script | PostgreSQL isn't running, or the host/port in `.env` is wrong. |
| `password authentication failed` | The password in `DATABASE_URL` doesn't match the one set during install. |
| `Cannot find module '@esbuild/...'` after install | npm 11 blocks package install scripts. Run `npm approve-scripts esbuild && npm rebuild esbuild`. |
| Seed fails partway | Re-run `npm run seed`; it upserts, so notes and rosters survive. |
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
| `npm run seed:users` | Create the demo users behind the "acting as" switcher (idempotent) |

## Where the data comes from

Everything is fetched at seed time from [PokeAPI](https://pokeapi.co).

| Script | Endpoints | Populates |
|---|---|---|
| `server/src/scripts/seed.ts` | `/pokemon`, `/pokemon-species`, `/evolution-chain`, `/growth-rate`, `/move`, `/version-group` | `pokemon`, `growth_rates`, `moves`, `pokemon_moves` |
| `server/src/scripts/seed-trainers.ts` | none — fixtures defined in the file | `trainers`, `roster`, demo review history in `activity` |

Trainers, rosters, levels, and roster tenure are invented demo fixtures, not
Pokémon canon.

## Documentation

[CLAUDE.md](CLAUDE.md) covers architecture, folder structure, data model, API
surface, and conventions. [TODO.md](TODO.md) is the backlog. Keep both — and this
file — to facts and rules; no rationale essays.

## Credits and attribution

### PokéAPI

All Pokémon data comes from **[PokéAPI](https://pokeapi.co)**, used under their
[fair use policy](https://pokeapi.co/docs/v2). PokéAPI is free and
community-run; if you fork this, keep the caching behaviour:

- The seed is a one-time import. Once seeded, the app reads only from your own
  Postgres database.
- `SEED_CONCURRENCY` defaults to 8, and failures retry with exponential backoff.
- Evolution chains, growth curves and moves are each fetched once, not once per
  Pokémon — movepools themselves come free inside the `/pokemon` responses.

Sprites and official artwork are served from PokéAPI's sprite repository at
display time, not copied into this repo.

### Pokémon

Pokémon and Pokémon character names are trademarks of Nintendo, Creatures Inc.,
and GAME FREAK Inc. This is an unofficial, non-commercial fan project, not
affiliated with or endorsed by any of them. No game assets are redistributed
here.

### Embedded dashboard

The Tableau page embeds a workbook published to
[Tableau Public](https://public.tableau.com); it is served by Tableau and is not
backed by this app's database.

## License

[MIT](LICENSE). The licence covers the code in this repository, not Pokémon data
or intellectual property; see the attribution above.
