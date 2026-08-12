# Pokémon CRM — architecture & conventions

A CRM-style sandbox for looking up Pokémon, tracking notes, and viewing
performance stats. Modelled on the patterns used in student-advising tools:
a searchable record list, a per-record profile with notes and status flags, a
cross-record note feed, an analytics dashboard, and an embedded BI view.

**Keep this file current.** When you add a route, table, page, or convention,
update the matching section here in the same change.

The agreed backlog lives in [TODO.md](TODO.md).

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
        │   ├── Sidebar.tsx   # icon rail navigation (logo links home)
        │   ├── PageHeader.tsx
        │   ├── NoteEditor.tsx# NoteComposer + NoteActions (edit/delete)
        │   ├── PokemonQuickSearch.tsx # compact lookup table, used on Profile
        │   ├── Modal.tsx     # native <dialog> wrapper + form field helpers
        │   ├── TrainerForm.tsx        # create/edit a trainer
        │   ├── RosterEditor.tsx       # add / edit / transfer roster entries
        │   ├── EvolutionProgress.tsx  # stage bar + full chain view
        │   └── ui.tsx        # Card, Loading, EmptyState, ErrorState, …
        ├── lib/
        │   ├── api.ts        # fetch wrapper, ApiError, toQueryString
        │   ├── useApi.ts     # useApi (fetch + loading/error), useDebounced
        │   ├── types.ts      # hand-written API response shapes
        │   └── format.ts     # type colors, unit + date formatting
        └── pages/
            ├── Home.tsx      # landing page: counters + links to every page
            ├── Trainers.tsx  # trainer selector + roster dashboard
            ├── Lookup.tsx    # searchable/filterable/sortable table
            ├── Profile.tsx   # detail + notes + activity log + quick search
            ├── Dashboard.tsx # EDA charts
            ├── Notes.tsx     # cross-Pokémon note feed
            ├── Activity.tsx  # cross-Pokémon status-flag table
            └── Tableau.tsx   # embedded Tableau Public workbook
```

### Routes

| Path | Page |
|---|---|
| `/` | Home (landing) — the sidebar logo links here |
| `/lookup` | Pokémon Lookup — reads `?search=` and `?trainerId=` to pre-fill filters |
| `/trainers` | Trainers — `?trainerId=` selects a trainer and opens their dashboard |
| `/pokemon/:id` | Pokémon Profile |
| `/dashboard` | Performance Dashboard |
| `/notes` | Notes |
| `/activity` | Activity — reads `?pokemonId=` to scope to one Pokémon |
| `/tableau` | Tableau Dashboard |

Anything unmatched redirects to `/`. **`/` is the landing page, not the
lookup** — link to `/lookup` when you mean the table.

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
- **Evolution columns model "degree progress".** A chain is a programme of
  study: `evolution_stage` is how far along a species sits, `chain_length` is
  how many stages the programme has, and `evolution_min_level` is the level
  needed to reach *this* stage from its predecessor. `evolves_from_id` walks
  backwards; find the next stage by querying rows whose `evolves_from_id` is
  this row's id. Branching chains (Eevee → 8 options) are why "next stage" is a
  list, not a single value, and why `chain_length` is the depth of the deepest
  branch. Non-level triggers (stones, trade, friendship) leave
  `evolution_min_level` null and put the reason in `evolution_trigger` — code
  that assumes a level exists will be wrong for roughly a third of the dex.

### `notes`
`pokemon_id` FK (cascade delete), `owner`, `body`, `created_at`, `updated_at`.

`owner` exists **before** auth deliberately: rows written today stay meaningful
once real users arrive. Everything is currently written under `DEFAULT_OWNER`
(`server/src/constants.ts`). Adding auth means replacing that constant with the
session user in the route handlers — no migration.

### `trainers` and `roster`

The advising analogy: a **trainer is the advisor**, their **roster is the
caseload**, and each **Pokémon is a student**.

`trainers` holds identity (name, region, specialty, email, bio). `roster` is the
join table — one row per `(trainer_id, pokemon_id)`, enforced by a unique index,
carrying `nickname`, `level`, and a `roster_status` enum
(`starter` / `active` / `reserve` / `retired`). `retired` keeps a Pokémon in the
history without counting toward the working roster, mirroring an inactive
advisee.

A Pokémon can appear on **many** trainers' rosters (Charizard is on both Ash's
and Lance's), so the relation is genuinely many-to-many — don't assume a Pokémon
has one trainer.

**Roster stats are computed over the ACTIVE roster.** On the trainer dashboard
only `roster_size` counts everyone; mean BST, best BST, mean level, legendary
count, type coverage, and the type chart all filter `status <> 'retired'`.
Mixing the two is a bug that already shipped once — a "5 active" tile sat beside
a mean that included a retired member. If you add a metric there, filter it the
same way and label it "active roster".

Notes and activity are **not** attached to trainers. A trainer's "history" is
derived: the notes and status flags on the Pokémon currently in their roster,
joined through `roster`. That keeps a single source of truth per Pokémon and
means adding a Pokémon to a roster brings its history along. If you ever need
notes written *about a trainer* rather than about their Pokémon, that's a new
column or table — don't overload the existing ones.

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
| GET | `/api/pokemon` | List — `search`, `type`, `generation`, `legendary`, `activity`, `trainerId`, `minBaseStatTotal`, `maxBaseStatTotal`, `sort`, `direction`, `page`, `pageSize` |
| GET | `/api/pokemon/filters` | Distinct types/generations/flags/trainers for dropdowns |
| GET | `/api/pokemon/:id` | Profile + its notes, activity, trainers carrying it, dex neighbours, BST percentile |
| GET | `/api/trainers` | All trainers with roster size and mean BST — `search` (name, region, specialty). Unpaginated: it backs a select control |
| GET | `/api/trainers/:id` | Trainer dashboard — roster (with evolution progress), summary stats, type breakdown, stat averages, and the note/activity history for the roster |
| POST | `/api/trainers` | Create a trainer |
| PATCH | `/api/trainers/:id` | Update a trainer |
| DELETE | `/api/trainers/:id` | Delete a trainer; cascades to their roster rows |
| POST | `/api/trainers/:id/roster` | Add a Pokémon to that trainer's roster |
| PATCH | `/api/roster/:id` | Update nickname/level/status, or move the entry to another trainer |
| DELETE | `/api/roster/:id` | Remove a roster entry |
| GET | `/api/notes` | Cross-Pokémon feed — `search`, `pokemonId`, `owner`, `sort`, `direction`, pagination |
| POST | `/api/notes` | Create |
| PATCH | `/api/notes/:id` | Update body |
| DELETE | `/api/notes/:id` | Delete |
| GET | `/api/activity` | Status flags joined to their Pokémon — `search`, `kind`, `owner`, `pokemonId`, `sort`, `direction`, pagination. Also returns `owners`, `kinds`, and unfiltered `kindCounts` |
| POST | `/api/activity/toggle` | Toggle a flag on/off |
| DELETE | `/api/activity/:id` | Remove one flag row |
| GET | `/api/stats/dashboard` | Every dashboard aggregation in one round trip — `bucketSize` |

### Conventions

- **Parameterised queries only.** Never build SQL by string concatenation or
  template interpolation of user input. Use the Drizzle query builder, or
  Drizzle's `` sql`` `` tag — its `${}` holes become bound parameters, not text.
- **Correlated subqueries: alias the inner tables and qualify the outer
  reference as `` ${table}.column ``.** This has already caused one silent bug.

  Drizzle renders a column reference like `` ${pokemon.id} `` as a **bare
  `"id"`**, not `"pokemon"."id"`. Inside a subquery, Postgres resolves a bare
  name against the *innermost* scope first, so this:

  ```ts
  // WRONG — "pokemon_id" and "id" both resolve to `notes`,
  // so this counts notes where notes.pokemon_id = notes.id (always ~0).
  sql`(select count(*)::int from ${notes} where ${notes.pokemonId} = ${pokemon.id})`
  ```

  silently returned 0 for every row rather than erroring. Write it as:

  ```ts
  // RIGHT — inner table aliased, outer reference qualified.
  sql`(select count(*)::int from ${notes} n where n.pokemon_id = ${pokemon}.id)`
  ```

  `` ${notes} `` renders the table name, so `` ${notes} n `` aliases it and
  `` ${pokemon}.id `` renders `"pokemon".id`. When the subquery joins two tables
  the bare form escalates from wrong to a hard `column reference "id" is
  ambiguous` error — which is how this was finally caught. If you add a
  correlated subquery, verify its count against `psql` rather than trusting that
  it ran.
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
`text-brand`, …). Add new colors there, not as arbitrary hex in components.

**Two colour systems, deliberately kept apart:**

- **`--color-brand` (`#d92d20`) is the app's accent** — sidebar icons, the logo,
  primary buttons, focus rings, links, and the Profile's base-stat bars.
  `--color-brand-strong` (`#b42318`) is the darker step for hover and small
  text. Measured 4.71:1 as a mark on the chart surface and 4.83:1 with white
  text on it, so it passes AA in both directions; brand-strong is 6.40:1.
  It is deliberately **not** `#d03b3b` — that step is reserved for
  status-critical, and a brand accent must never read as an error state.
- **`--color-series-1..4` stay the validated categorical palette** and are used
  by the Performance Dashboard's analytical charts. Recolouring an analytical
  chart to the brand hue would make the accent look like a data encoding, so
  don't: chart series come from the series tokens, chrome comes from brand.

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
- The Profile's base-stat chart is the one chart on `--color-brand`: it's a
  single-series bar chart of one Pokémon's stats, not a comparison across the
  dataset, so it reads as page chrome rather than a data encoding.

### Status flags: two views of one table

`activity` is surfaced three ways, all backed by the same rows:

- **Profile → Status** — toggle buttons. Setting a flag inserts a row; unsetting
  deletes it (`reviewed` excepted, which bumps `updated_at`).
- **Profile → Activity log** — the same rows as a timestamped history, newest
  first, each removable. Removing a log entry *is* clearing the flag; there's no
  separate audit table, so don't present it as one.
- **Activity page** — every row across all Pokémon, filterable and sortable.

The Activity page's summary tiles use the API's **unfiltered** `kindCounts`, so
they stay put while you filter the table underneath them.

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
npm run seed:trainers     # create trainers + rosters (needs `seed` first)
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
- **A native `<dialog>` needs `m-auto` under Tailwind.** Dialogs centre
  themselves via `margin: auto`, and Tailwind's preflight resets margins to 0,
  which pins the modal to the top-left corner. `components/Modal.tsx` sets it;
  don't remove it.
- **Closed modals stay mounted.** Pages render `<Modal open={false}>` rather
  than unmounting, so `document.querySelector('dialog')` can return a *closed*
  dialog. Target `dialog[open]` when scripting against one.
- **npm ≥ 11 blocks install scripts by default.** esbuild (used by tsx, vite, and
  drizzle-kit) needs its postinstall to fetch a platform binary. The approvals
  live in the root `package.json` under `allowScripts`; after adding a dependency
  that pulls a new esbuild version, run `npm approve-scripts esbuild`.
- **Both seeds are safe to re-run** — `seed` upserts on primary key and
  `seed:trainers` upserts on trainer name and `(trainer, pokemon)`, so notes,
  activity, and rosters survive. `seed:trainers` **skips** roster entries whose
  Pokémon isn't seeded (rather than failing), so a `SEED_LIMIT=151` run will
  legitimately drop the Sinnoh rosters and say so.
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

See [TODO.md](TODO.md) for the scheduled backlog (needs-attention queue, then
the interactivity layer) and the full list of known gaps. The short version:
no auth (`owner` is one hardcoded constant), no tests, no dark mode
(deprioritised), a single ~640 kB JS chunk, and trainer history capped at 50
rows without pagination.
