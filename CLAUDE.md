# Pokémon CRM — architecture & conventions

A CRM-style sandbox for looking up Pokémon, tracking notes, and viewing
performance stats. Modelled on the patterns used in student-advising tools:
a searchable record list, a per-record profile with notes and status flags, a
cross-record note feed, an analytics dashboard, and an embedded BI view.

**Keep this file current.** When you add a route, table, page, or convention,
update the matching section here in the same change.

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | Vite 6 + React 18 + TypeScript + Tailwind CSS v4 |
| Charts | Recharts 2 |
| Backend | Node + Express 4 (ESM, TypeScript via `tsx`) |
| Database | PostgreSQL (local for dev; Azure Database for PostgreSQL in production) |
| ORM / migrations | Drizzle ORM + drizzle-kit |
| Validation | Zod (every request query/body is parsed before use) |

npm workspaces: `server` and `client`, driven from the repo root.

---

## Folder structure

```
pokemon-crm/
├── .env                      # real credentials — git-ignored
├── .env.example              # committed template (local + Azure notes)
├── CLAUDE.md                 # this file
├── package.json              # workspace root; dev/build/seed scripts
├── server/
│   ├── drizzle/              # generated SQL migrations (committed)
│   ├── drizzle.config.ts     # drizzle-kit config (standalone — see note below)
│   └── src/
│       ├── index.ts          # Express app, route mounting, shutdown
│       ├── env.ts            # dotenv loading + typed env access
│       ├── constants.ts      # DEFAULT_OWNER, types, generation buckets
│       ├── http.ts           # HttpError, asyncHandler, error middleware
│       ├── db/
│       │   ├── schema.ts     # Drizzle table definitions (source of truth)
│       │   ├── client.ts     # pg Pool + drizzle instance
│       │   └── migrate.ts    # applies drizzle/ migrations
│       ├── routes/
│       │   ├── pokemon.ts    # list/search/filter, filter options, detail
│       │   ├── notes.ts      # cross-Pokémon feed + full CRUD
│       │   ├── activity.ts   # status flag toggle + feed
│       │   └── stats.ts      # dashboard aggregations
│       └── scripts/
│           └── seed.ts       # one-time PokeAPI import (idempotent)
└── client/
    ├── vite.config.ts        # React + Tailwind plugins, /api dev proxy
    └── src/
        ├── main.tsx          # React root + BrowserRouter
        ├── App.tsx           # sidebar layout + routes
        ├── index.css         # Tailwind import + design tokens (@theme)
        ├── components/
        │   ├── Sidebar.tsx   # icon rail navigation
        │   ├── PageHeader.tsx
        │   ├── NoteEditor.tsx# NoteComposer + NoteActions (edit/delete)
        │   └── ui.tsx        # Card, Loading, EmptyState, ErrorState, …
        ├── lib/
        │   ├── api.ts        # fetch wrapper, ApiError, toQueryString
        │   ├── useApi.ts     # useApi (fetch + loading/error), useDebounced
        │   ├── types.ts      # hand-written API response shapes
        │   └── format.ts     # type colors, unit + date formatting
        └── pages/
            ├── Lookup.tsx    # searchable/filterable/sortable table
            ├── Profile.tsx   # detail + notes + status flags
            ├── Dashboard.tsx # EDA charts
            ├── Notes.tsx     # cross-Pokémon note feed
            └── Tableau.tsx   # embedded Tableau Public workbook
```

---

## Data model

Defined in `server/src/db/schema.ts`; migrations live in `server/drizzle/`.

### `pokemon`
Reference data, written **only** by the seed script. `id` is the National Pokédex
number (stable and unique, so it doubles as the primary key and lets notes and
activity survive a re-seed).

Notable columns:
- `type1` / `type2` — types are two columns rather than an array so filtering and
  the dashboard's type breakdown stay plain, indexable SQL.
- `base_stat_total` — denormalised sum of the six base stats, because it's sorted
  and bucketed constantly.
- `height` is decimetres and `weight` is hectograms, exactly as PokeAPI reports
  them. Convert at the display edge (`formatHeight` / `formatWeight`).

### `notes`
`pokemon_id` FK (cascade delete), `owner`, `body`, `created_at`, `updated_at`.

`owner` exists **before** auth deliberately: rows written today stay meaningful
once real users arrive. Everything is currently written under `DEFAULT_OWNER`
(`server/src/constants.ts`). Adding auth means replacing that constant with the
session user in the route handlers — no migration.

### `activity`
Advising-style status flags: `caught`, `favorite`, `wishlist`, `flagged`,
`reviewed` (a Postgres enum, `activity_kind`).

One row per `(pokemon_id, owner, kind)`, enforced by a unique index. The API
**toggles** rows rather than storing a boolean column per flag, so adding a new
flag is an enum migration and nothing else.

`reviewed` is the one non-toggle: re-posting it bumps `updated_at` instead of
clearing the flag, which is what makes "last reviewed" meaningful.

---

## API

All routes are under `/api`. Responses are JSON; errors are
`{ error: string, details?: […] }` with a matching status code.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness + DB round trip |
| GET | `/api/pokemon` | List — `search`, `type`, `generation`, `legendary`, `activity`, `minBaseStatTotal`, `maxBaseStatTotal`, `sort`, `direction`, `page`, `pageSize` |
| GET | `/api/pokemon/filters` | Distinct types/generations/flags for dropdowns |
| GET | `/api/pokemon/:id` | Profile + its notes, activity, dex neighbours, BST percentile |
| GET | `/api/notes` | Cross-Pokémon feed — `search`, `pokemonId`, `owner`, `sort`, `direction`, pagination |
| POST | `/api/notes` | Create |
| PATCH | `/api/notes/:id` | Update body |
| DELETE | `/api/notes/:id` | Delete |
| GET | `/api/activity` | Recent status changes — `kind`, `limit` |
| POST | `/api/activity/toggle` | Toggle a flag on/off |
| DELETE | `/api/activity/:id` | Remove one flag row |
| GET | `/api/stats/dashboard` | Every dashboard aggregation in one round trip — `bucketSize` |

### Conventions

- **Parameterised queries only.** Never build SQL by string concatenation or
  template interpolation of user input. Use the Drizzle query builder, or
  Drizzle's `` sql`` `` tag — its `${}` holes become bound parameters, not text.
- **Column names are never taken from user input.** `sort` is validated against a
  `SORTABLE` allow-list in each route that maps a public key to a real column.
- **Validate at the edge.** Every `req.query` / `req.body` goes through a Zod
  schema at the top of the handler. `ZodError` is turned into a 400 by the error
  middleware in `http.ts`.
- **Wrap async handlers** in `asyncHandler` so rejections reach the error
  middleware instead of becoming unhandled rejections.
- **Throw `HttpError`** (via `notFound` / `badRequest`) for expected failures.
- List endpoints return `{ data, pagination: { page, pageSize, total, totalPages } }`.
- Every list ordering has a **tiebreaker** (`id`) so pagination is stable.

---

## Frontend conventions

- **Data fetching** goes through `useApi(path)`, which returns
  `{ data, loading, error, refetch }` and discards stale responses (fast typing
  can't leave an earlier result on screen). Mutations call `api.post/patch/delete`
  then `refetch()`.
- **Search inputs are debounced** with `useDebounced` (300ms).
- **Build request URLs with `toQueryString`**, which drops empty values so the URL
  doesn't collect `?type=&generation=`.
- **Every list surface handles four states**: loading (skeleton rows), error
  (with retry), empty (distinguishing "no data yet" from "no matches"), and
  loaded. Use `Loading`, `ErrorState`, `EmptyState` from `components/ui.tsx`.
- **API paths are relative** (`/api/...`). Vite proxies them to
  `localhost:4000` in dev, so the browser stays on one origin and CORS never
  enters the picture locally.
- **Response types are hand-written** in `lib/types.ts` rather than shared from
  the server, keeping the client decoupled from Drizzle's inferred types. If you
  change a route's response shape, update the matching interface.

### Design tokens

Defined once in `client/src/index.css` under Tailwind v4's `@theme`, which
generates the utilities (`bg-surface`, `text-muted`, `border-hairline`,
`text-series-1`, …). Add new colors there, not as arbitrary hex in components.

### Charting

Charts follow a fixed set of rules — match them when adding one:

- **Single-series charts** use `--color-series-1` and carry **no legend**; the
  card title names the measure. Multi-series charts always have a legend.
- **Never a second y-axis.** Two measures on different scales become two charts —
  this is why "Pokémon per generation" and "Mean BST by generation" are separate
  cards rather than one dual-axis chart.
- Series colors come from the validated categorical palette
  (`--color-series-1..4`), assigned in fixed order, never cycled.
- Marks are thin with 4px rounded data-ends; grid and axes are recessive
  (`--color-hairline`, no axis lines, no tick lines); every chart has a tooltip.
- **The Pokémon type colors in `lib/format.ts` are for badges only, never chart
  series.** They're a domain convention players recognise, and 18 categories is
  well past what any palette can keep distinguishable.

### The Tableau embed (`pages/Tableau.tsx`)

Embeds the Tableau Public workbook `shared/K7RTFZCTW`. Points worth knowing
before touching it:

- **It does not use Tableau's share snippet.** That snippet loads the legacy
  `viz_v1.js`, which works by scanning the document for
  `<object class="tableauViz">` and replacing it — which fights React for
  ownership of the DOM and double-runs under StrictMode. This uses the current
  **Embedding API v3** (`tableau.embedding.3.latest.min.js`) and a
  `<tableau-viz>` custom element pointed at the same viz.
- **The element is created imperatively**, not in JSX, so React never owns it
  and teardown is unambiguous. That also avoids declaring a custom element in
  JSX's `IntrinsicElements`.
- **The API script is loaded once** and cached in a module-level promise, so
  navigating away and back doesn't refetch it. A rejection is *not* cached, so
  the retry button can try the network again.
- **The viz is pinned to its authored 1600 × 927** and the card scrolls
  horizontally. Tableau does **not** scale a fixed-size dashboard down to fit —
  given a narrower frame it renders at native size behind its own internal
  scrollbars, which is unreadable. Below a 500px container the workbook switches
  to its phone layout, which is much taller (`PHONE_HEIGHT`). If you swap in a
  different workbook, update those constants to match its published size.
- This page is **not backed by the CRM database** — it's an external view, and
  the card subtitle says so.

---

## Local development

```bash
npm install
cp .env.example .env      # then edit
npm run db:migrate        # create tables
npm run seed              # import from PokeAPI (~2 min for all 1,025)
npm run dev               # API on :4000, web on :5173
```

Other scripts: `npm run db:generate` (new migration from schema changes),
`npm run db:push` (dev-only direct sync), `npm run db:studio`,
`npm run typecheck`, `npm run build`.

### Gotchas

- **`drizzle.config.ts` deliberately doesn't import `src/env.ts`.** drizzle-kit
  bundles its config as CJS, which can't load the ESM-only `env.ts`
  (`import.meta.url`). The config reads the same `.env` directly instead. If you
  add an env var both need, add it in both places.
- **npm ≥ 11 blocks install scripts by default.** esbuild (used by tsx, vite, and
  drizzle-kit) needs its postinstall to fetch a platform binary. The approvals
  live in the root `package.json` under `allowScripts`; after adding a dependency
  that pulls a new esbuild version, run `npm approve-scripts esbuild`.
- **The seed is safe to re-run** — it upserts on primary key, so notes and
  activity are untouched. Re-run it after changing how a column is derived.
- The current local Postgres uses `trust` auth on localhost, so `.env` has no
  password. Azure will need `PGSSL=true` and `sslmode=require`.

---

## Deploying against Azure Postgres

Set `DATABASE_URL` to the Azure connection string (with `?sslmode=require`) and
`PGSSL=true`. `db/client.ts` then connects with
`ssl: { rejectUnauthorized: false }`, because Azure's managed Postgres presents a
chain that isn't in Node's default trust store. Run `npm run db:migrate` against
the Azure database before the first deploy, then `npm run seed` once.

In production the client is a static bundle (`client/dist`); serve it behind a
proxy that forwards `/api` to the Express server, mirroring the Vite dev proxy.

---

## Not yet built

- **No auth.** Every write is attributed to `DEFAULT_OWNER`. The `owner` columns
  and their indexes are already in place for it.
- **No dark mode.** The app commits to the light surface; the tokens are
  centralised in `index.css`, so adding one is a scoped change.
- **No automated tests.** Verification so far has been manual (endpoint smoke
  tests plus driving each page in a browser).
- The client bundle is a single ~600 kB chunk (Recharts dominates); route-level
  `React.lazy` would be the first fix if that matters.
