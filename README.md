# Pokémon CRM

A CRM-style tool for looking up Pokémon, tracking notes, and viewing performance
stats — a personal learning sandbox modelled after the patterns used in student
advising tools.

- **Pokémon Lookup** — searchable, filterable, sortable table of all 1,025 Pokémon
- **Pokémon Profile** — full detail view with base-stat chart, notes, and status flags
- **Performance Dashboard** — EDA charts across the dataset (distributions, type and generation breakdowns, correlations)
- **Notes** — cross-Pokémon note feed, sortable and filterable
- **Tableau Dashboard** — an embedded Tableau Public workbook alongside the in-app analytics

Vite + React + TypeScript + Tailwind on the front, Express + Drizzle + PostgreSQL
behind it, Recharts for the visualisations.

## Getting started

Requires Node 20+ and a PostgreSQL database.

```bash
npm install
```

Copy the environment template and fill it in:

```bash
cp .env.example .env
```

Create the database (if it doesn't exist), then create the tables:

```bash
npm run db:migrate
```

Import the Pokédex from [PokeAPI](https://pokeapi.co) — a one-time step that
takes a couple of minutes for the full 1,025. Set `SEED_LIMIT=151` in `.env` for
a fast Gen-1-only run.

```bash
npm run seed
```

Start both servers:

```bash
npm run dev
```

The app is at http://localhost:5173 and the API at http://localhost:4000.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | API + web dev servers together |
| `npm run build` | Typecheck and build both workspaces |
| `npm run typecheck` | Typecheck only |
| `npm run seed` | Import Pokémon from PokeAPI (idempotent) |
| `npm run db:generate` | Generate a migration from schema changes |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:studio` | Open Drizzle Studio |

## Documentation

[CLAUDE.md](CLAUDE.md) covers the architecture, folder structure, data model,
API surface, and coding conventions.
