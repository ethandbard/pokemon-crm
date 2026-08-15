# Pokémon CRM — architecture & conventions

A CRM-style sandbox for looking up Pokémon, tracking notes, and viewing
performance stats, modelled on student-advising tools.

**Keep this file current.** When you add a route, table, page, or convention,
update the matching section here in the same change.

**Keep documentation minimal.** This file, [README.md](README.md), and
[TODO.md](TODO.md) hold facts, rules, and constraints only — no rationale
essays, design-decision retrospectives, "this broke once" anecdotes, or
justifications for choices already made. State the rule, add at most one clause
of why if the rule is otherwise unfollowable, and stop.

The backlog lives in [TODO.md](TODO.md).

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
│   ├── drizzle.config.ts     # drizzle-kit config (standalone — see Gotchas)
│   └── src/
│       ├── index.ts          # Express app, route mounting, shutdown
│       ├── env.ts            # dotenv loading + typed env access
│       ├── constants.ts      # DEFAULT_OWNER, SEED_USERS, types, generations, ATTENTION
│       ├── owner.ts          # resolves who a write is attributed to
│       ├── attention.ts      # needs-attention scorer
│       ├── effectiveness.ts  # type chart cache + defensive matchups
│       ├── http.ts           # HttpError, asyncHandler, error middleware
│       ├── db/
│       │   ├── schema.ts     # Drizzle table definitions (source of truth)
│       │   ├── client.ts     # pg Pool + drizzle instance
│       │   └── migrate.ts    # applies drizzle/ migrations
│       ├── routes/
│       │   ├── pokemon.ts    # list/search/filter, filter options, detail
│       │   ├── moves.ts      # move catalogue, filter options, move detail
│       │   ├── trainers.ts   # trainer CRUD + dashboard
│       │   ├── roster.ts     # roster entry update/delete
│       │   ├── attention.ts  # needs-attention queue
│       │   ├── notes.ts      # cross-Pokémon feed + full CRUD
│       │   ├── activity.ts   # status flag toggle + feed
│       │   ├── stats.ts      # dashboard aggregations
│       │   └── users.ts      # the "acting as" directory
│       └── scripts/
│           ├── seed.ts       # one-time PokeAPI import (idempotent)
│           ├── pokeapi.ts    # shared PokeAPI client: fetchJson, concurrency cap
│           ├── seed-types.ts # the 18-request type effectiveness matrix
│           ├── seed-trainers.ts # demo trainers, rosters, review history
│           └── seed-users.ts # the demo user directory
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
        │   ├── Movepool.tsx   # movepool by learn method, sortable + filterable
        │   ├── AttentionQueue.tsx     # ranked early-alert list with reasons
        │   ├── CommandPalette.tsx     # ⌘K global jump-to
        │   ├── Toast.tsx     # ToastProvider, useToast, confirmable(), useHotkey
        │   ├── UserSwitcher.tsx # "acting as" control in the sidebar
        │   ├── BulkActionBar.tsx      # multi-select actions on Lookup
        │   ├── RosterBoard.tsx        # drag-and-drop roster status kanban
        │   ├── SavedViews.tsx         # named filter presets
        │   └── ui.tsx        # Card, Loading, EmptyState, ErrorState, …
        ├── lib/
        │   ├── api.ts        # fetch wrapper, ApiError, toQueryString
        │   ├── useApi.ts     # useApi (fetch + loading/error), useDebounced
        │   ├── useSavedViews.ts # localStorage-backed filter presets
        │   ├── useCurrentUser.tsx # the acting user + labelFor()
        │   ├── types.ts      # hand-written API response shapes
        │   ├── page.ts       # PAGE_CONTAINER — the shared page content column
        │   └── format.ts     # type colors, unit + date formatting
        └── pages/
            ├── Home.tsx      # landing page: counters + links to every page
            ├── Trainers.tsx  # trainer selector + roster dashboard
            ├── Lookup.tsx    # searchable/filterable/sortable table
            ├── Profile.tsx   # detail + movepool + notes + activity log
            ├── Moves.tsx     # move catalogue table
            ├── MoveProfile.tsx # one move: effect, learners, rosters
            ├── Dashboard.tsx # EDA charts (filterable)
            ├── Notes.tsx     # cross-Pokémon note feed
            ├── Activity.tsx  # cross-Pokémon status-flag table
            └── Tableau.tsx   # embedded Tableau Public workbook
```

### Routes

| Path | Page |
|---|---|
| `/` | Home (landing) — the sidebar logo links here |
| `/lookup` | Pokémon Lookup — reads `?search=`, `?trainerId=`, `?moveId=`, `?learnMethod=` to pre-fill filters |
| `/trainers` | Trainers — `?trainerId=` selects a trainer and opens their dashboard |
| `/pokemon/:id` | Pokémon Profile |
| `/moves` | Move catalogue — reads `?pokemonId=` and `?trainerId=` to scope |
| `/moves/:id` | Move detail — effect, learners, trainers who can field it |
| `/dashboard` | Performance Dashboard |
| `/notes` | Notes — reads `?trainerId=` to scope to one roster |
| `/activity` | Activity — reads `?trainerId=` to scope to one roster |
| `/tableau` | Tableau Dashboard |

Anything unmatched redirects to `/`. **`/` is the landing page, not the
lookup** — link to `/lookup` when you mean the table.

---

## Data model

Defined in `server/src/db/schema.ts`; migrations live in `server/drizzle/`.

### `pokemon`

Reference data, written **only** by the seed script. `id` is the National Pokédex
number, which is also the primary key, so notes and activity survive a re-seed.

Notable columns:

- `type1` / `type2` — two columns, not an array, to keep filtering indexable.
- `generation` comes from the species' `generation` field.
  `generationForDexNumber` in `constants.ts` is a fallback used only when the
  species fetch fails; it buckets any id in the 10000s as generation 9.
- `abilities` **excludes** the hidden ability, which is `hidden_ability`.
- EV yield is six columns (`ev_hp` … `ev_speed`) plus a denormalised
  `ev_yield_total`.
- `gender_rate` is **eighths female, -1 for genderless** (1 = 12.5% female).
  Render via `formatGenderRate`, never raw.
- `habitat` is **only populated for generations 1–3** (~386 of 1,025 rows);
  PokeAPI assigns none beyond Gen 3. Surfaces that filter or chart on it must
  say so.
- `flavor_text` is the Pokédex blurb, normalised from PokeAPI's hard-wrapped
  form. `flavor_text_version` records which game's entry was used.
- `varieties` holds **names only**; Mega, Gigantamax and regional forms are not
  imported as rows (see TODO.md).
- `regional_dex_numbers` is jsonb keyed by pokédex slug. `REGION_POKEDEXES` in
  `constants.ts` maps a region to its slugs (a region may have several) and
  backs the Lookup region filter.
- `base_stat_total` — denormalised sum of the six base stats.
- `height` is decimetres, `weight` is hectograms, as PokeAPI reports them.
  Convert at the display edge (`formatHeight` / `formatWeight`).
- Evolution columns: `evolution_stage` is the species' position in its chain,
  `chain_length` is the depth of the deepest branch, `evolution_min_level` is
  the level needed to reach this stage from its predecessor. `evolves_from_id`
  walks backwards; the next stage is the set of rows whose `evolves_from_id` is
  this row's id, so it is a list, not a single value.
- `evolution_min_level` is **null for 136 of the 484 evolved species** (stones,
  trade, friendship). Do not assume a level exists.
- `evolution_condition` is the requirement as a sentence ("Use a Thunder Stone")
  and is what the UI shows. `evolution_requirements` keeps the structured
  `evolution_details` it was flattened from, including every route where a
  species has more than one. `evolution_trigger` is the **raw trigger slug**
  (`use-item`, `trade`) — display sites read `evolution_condition` instead.

### `moves` and `pokemon_moves`

Curriculum analogy: a move is a **course**, `pokemon_moves` is the enrolment
record. Both are reference data, written only by the seed.

`moves` is keyed by PokeAPI's move id. `damage_class` is an enum
(`physical` / `special` / `status`); `pokemon_moves.learn_method` is plain text
because PokeAPI keeps adding methods (`level-up`, `machine`, `egg`, `tutor`,
`train`, plus one-game oddities).

- **`power`, `accuracy` and `pp` are nullable, and 0 is not null.** A status move
  has no power, a move that never misses has no accuracy. PokeAPI also reports
  `power: 0` for status moves and fixed-damage ones (Seismic Toss), meaning "no
  fixed base power" — render both through `movePower`, and exclude `power = 0`
  from any mean.
- `effect` has PokeAPI's `$effect_chance` placeholder already substituted.
- `learned_by_count` is a denormalised dex-wide count, recomputed by the seed.
  Anything counting learners **within a filtered scope** must count join rows
  instead; the column is not scoped.
- **`pokemon_moves` holds one row per (pokemon, move, learn method), not per
  version group.** PokeAPI reports a movepool per game; the seed keeps the most
  recent game's entry and records it in `version_group`.
- **Version group recency comes from the group's `order` field, not its id.**
  PokeAPI added the Japanese Gen-1 re-releases late, so `blue-japan` has id 29
  and order 2; ranking by id dates Gen-1 movepools to 1996.
- `level_learned_at` is 0 for every method except `level-up`. **Within
  `level-up`, 0 means "learned on evolution"**, not level zero.
- Movepool coverage = distinct types of **non-status** moves. A Grass-type
  status move gives no Grass coverage.

### `type_damage`

The type effectiveness matrix, from `/type/{name}` — 18 requests, written only
by the seed (`npm run seed:types` refreshes it without a full dex import).

- **The full 18 × 18 grid is stored (324 rows), not just the non-neutral pairs.**
  PokeAPI reports only the exceptions. Storing it that way makes every consumer
  coalesce a missing row to 1×, and a join that drops a pair then reads as an
  immunity rather than as a bug.
- **`multiplier` is hundredths** — 0, 50, 100, 200 — because dual types multiply
  (a 4× weakness is `200 × 200 / 100`) and the scale has exactly four values.
- **Only the offensive lists (`..._to`) are read** when seeding. PokeAPI reports
  every relation twice, once from each side; applying both writes each cell
  twice with no tiebreak if they ever disagree.
- **All 18 types must fetch successfully or nothing is written.** A missing
  attacker leaves its row at the 100 default, which reads as "hits everything
  neutrally" — wrong, and plausible-looking.

### `users`

The directory behind the "acting as" switcher. **Attribution, not
authentication** — no passwords, no sessions, no permissions; everyone sees the
whole workspace.

- **`users.email` is the value stored in `notes.owner` / `activity.owner`, and
  there is deliberately no foreign key.** Owner columns predate this table and
  may hold an email with no matching row (an older seed, a direct API call, a
  deleted user), so any join to `users` must tolerate a miss and fall back to
  the raw string. `labelFor()` on the client does this.
- **`email` is immutable** — `PATCH /api/users/:id` rejects it. Changing it
  would orphan that user's whole history rather than rename it; rename via
  `name`.
- **The `DEFAULT_OWNER` user cannot be deleted**: unattributed writes land on it.
  Deleting any other user leaves their notes and flags in place under the raw
  email; the response reports how many.
- `seed:users` writes `SEED_USERS` from `constants.ts` and is called by
  `seed:trainers`, which spreads its review history across them.

### `notes`

`pokemon_id` FK (cascade delete), `owner`, `body`, `created_at`, `updated_at`.

`owner` holds the acting user's email — see `users` above. Writes that name no
acting user fall back to `DEFAULT_OWNER` (`server/src/constants.ts`).

### `trainers` and `roster`

Advising analogy: trainer = advisor, roster = caseload, Pokémon = student.

`trainers` holds identity (name, region, specialty, email, bio). `roster` is the
join table — one row per `(trainer_id, pokemon_id)`, enforced by a unique index,
carrying `nickname`, `level`, `acquired_at`, and a `roster_status` enum
(`starter` / `active` / `reserve` / `retired`).

A Pokémon can appear on **many** trainers' rosters — the relation is genuinely
many-to-many.

**Roster stats are computed over the ACTIVE roster.** On the trainer dashboard
only `roster_size` counts everyone; mean BST, best BST, mean level, legendary
count, type coverage, and the type chart all filter `status <> 'retired'`. New
metrics there must filter the same way and be labelled "active roster".

Notes and activity are **not** attached to trainers. A trainer's history is
derived by joining through `roster`. Notes written *about a trainer* would need
a new column or table — don't overload the existing ones.

### `activity`

Status flags: `caught`, `favorite`, `wishlist`, `flagged`, `reviewed` (Postgres
enum `activity_kind`).

One row per `(pokemon_id, owner, kind)`, enforced by a unique index. The API
**toggles** rows rather than storing a boolean column per flag, so adding a flag
is an enum migration and nothing else.

`reviewed` is the exception: re-posting it bumps `updated_at` instead of
clearing the flag.

---

## API

All routes are under `/api`. Responses are JSON; errors are
`{ error: string, details?: […] }` with a matching status code.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness + DB round trip |
| GET | `/api/pokemon` | List — `search`, `type`, `generation`, `legendary`, `activity`, `trainerId`, `minBaseStatTotal`, `maxBaseStatTotal`, `region`, `habitat`, `shape`, `eggGroup`, `growthRate`, `evYield`, `baby`, `moveId`, `learnMethod`, `moveType`, `sort`, `direction`, `page`, `pageSize` |
| GET | `/api/pokemon/filters` | Distinct types/generations/flags/trainers/habitats/shapes/egg groups/growth rates/learn methods for dropdowns, plus the static region list |
| GET | `/api/pokemon/:id` | Profile + its notes, activity, trainers carrying it, full movepool, movepool summary, defensive `matchups`, dex neighbours, BST percentile |
| GET | `/api/moves` | Move catalogue — `search`, `type`, `damageClass`, `generation`, `pokemonId`, `trainerId`, `learnMethod`, `minPower`, `maxPower`, `sort`, `direction`, pagination |
| GET | `/api/moves/filters` | Distinct types/generations/damage classes/learn methods/ailments and the power range |
| GET | `/api/moves/:id` | Move + paginated learners (`learnMethod`, pagination), learn-method and type breakdowns, and trainers with an active-roster learner |
| GET | `/api/users` | The whole user directory with per-user note/flag counts, plus `defaultOwner`. Unpaginated: it backs the switcher |
| POST | `/api/users` | Create a user |
| PATCH | `/api/users/:id` | Update `name` / `role` / `initials`. **Not `email`** |
| DELETE | `/api/users/:id` | Remove the identity; their notes and flags stay. Refuses on `DEFAULT_OWNER` |
| GET | `/api/trainers` | All trainers with roster size and mean BST — `search` (name, region, specialty). Unpaginated: it backs a select control |
| GET | `/api/attention` | Needs-attention queue — `trainerId` (omit for workspace-wide), `limit`. Returns each item's `score` and `reasons`, plus the `model` constants |
| POST | `/api/activity/bulk` | Set or clear one flag across many Pokémon (explicit target state, not a toggle) |
| POST | `/api/notes/bulk` | Write the same note against many Pokémon |
| POST | `/api/trainers/:id/roster/bulk` | Add many Pokémon to a roster; already-present ones are skipped, not an error |
| GET | `/api/trainers/:id` | Trainer dashboard — roster (with evolution progress and movepool figures), summary stats, type breakdown, stat averages, movepool coverage, and one page each of the note/activity history (`notesPage`, `activityPage`, `historyPageSize`) |
| POST | `/api/trainers` | Create a trainer |
| PATCH | `/api/trainers/:id` | Update a trainer |
| DELETE | `/api/trainers/:id` | Delete a trainer; cascades to their roster rows |
| POST | `/api/trainers/:id/roster` | Add a Pokémon to that trainer's roster |
| PATCH | `/api/roster/:id` | Update nickname/level/status, or move the entry to another trainer |
| DELETE | `/api/roster/:id` | Remove a roster entry |
| GET | `/api/notes` | Cross-Pokémon feed — `search` (note body **or** Pokémon name), `pokemonId`, `owner`, `trainerId`, `sort`, `direction`, pagination. Also returns `owners` and `trainers` for the filter dropdowns |
| POST | `/api/notes` | Create |
| PATCH | `/api/notes/:id` | Update body |
| DELETE | `/api/notes/:id` | Delete |
| GET | `/api/activity` | Status flags joined to their Pokémon — `search`, `kind`, `owner`, `pokemonId`, `trainerId`, `sort`, `direction`, pagination. Also returns `owners`, `trainers`, `kinds`, and unfiltered `kindCounts` |
| POST | `/api/activity/toggle` | Toggle a flag on/off |
| DELETE | `/api/activity/:id` | Remove one flag row |
| GET | `/api/stats/dashboard` | Every dashboard aggregation in one round trip — `bucketSize`, plus the filters `type`, `generation`, `legendary`, `mythical`, `region`, `habitat`, `eggGroup`, `growthRate`, `minBaseStatTotal`, `maxBaseStatTotal`. Returns `scope` (filtered vs. total) |

### Conventions

- **Attribution comes from `ownerFor(req, body.owner)`** (`server/src/owner.ts`),
  never from `DEFAULT_OWNER` directly. It reads the `X-Acting-User` header the
  client sets, letting an explicit `owner` in the body win so a caller can
  attribute deliberately — which is what Undo on someone else's status flag
  relies on. **Nothing verifies the header.** Real auth replaces the body of
  this one function; no route handler changes.
- **Parameterised queries only.** Never build SQL by string concatenation or
  template interpolation of user input. Use the Drizzle query builder, or
  Drizzle's `` sql`` `` tag — its `${}` holes become bound parameters.
- **Correlated subqueries: alias the inner table and qualify the outer reference
  as `` ${table}.column ``.** Drizzle renders `` ${pokemon.id} `` as a bare
  `"id"`, which Postgres resolves against the innermost scope:

  ```ts
  // WRONG — both names resolve to `notes`, so this always counts ~0.
  sql`(select count(*)::int from ${notes} where ${notes.pokemonId} = ${pokemon.id})`

  // RIGHT — inner table aliased, outer reference qualified.
  sql`(select count(*)::int from ${notes} n where n.pokemon_id = ${pokemon}.id)`
  ```

  Verify a new correlated subquery's counts against `psql`; the wrong form fails
  silently unless the subquery joins two tables, where it errors as ambiguous.
- **A JS array interpolated into `` sql`` `` becomes a record, not an array.**
  Drizzle expands `` ${['a', 'b']} `` to `($1, $2)`, which works for `in (…)`
  and fails elsewhere (`cannot cast type record to text[]`). Send one scalar
  parameter and unpack it in SQL:

  ```ts
  sql`${pokemon.regionalDexNumbers} ?| array(select jsonb_array_elements_text(${JSON.stringify(slugs)}::jsonb))`
  ```

  This is what the `region` filter on `/api/pokemon` does.
- **Column names are never taken from user input.** `sort` is validated against a
  `SORTABLE` allow-list in each route that maps a public key to a real column.
- **Validate at the edge.** Every `req.query` / `req.body` goes through a Zod
  schema at the top of the handler. `ZodError` becomes a 400 via the error
  middleware in `http.ts`.
- **Wrap async handlers** in `asyncHandler`.
- **Throw `HttpError`** (via `notFound` / `badRequest`) for expected failures.
- **List endpoints build their envelope with `paginationFor(page, pageSize, total)`**
  from `http.ts` — never by hand. It returns
  `{ page, pageSize, total, totalPages, from, to }`; `from`/`to` are the 1-indexed
  row numbers the UI shows, and both are 0 when the page is past the end.
- Every list ordering has a **tiebreaker** (`id`) so pagination is stable.
- **Nothing returns a bare `limit` without a matching total.** A capped list with
  no total truncates silently.

---

## Frontend conventions

- **Data fetching** goes through `useApi(path)`, which returns
  `{ data, loading, error, refetch }` and discards stale responses. Mutations
  call `api.post/patch/delete` then `refetch()`.
- **Pass `null` to `useApi` to skip fetching.** Search-on-demand surfaces (the
  command palette, the bulk roster picker) must do this rather than point at a
  placeholder endpoint, which would briefly put the wrong shape in `data`.
- **Destructive actions use `confirmable()` from `useToast()`**, not
  `window.confirm`: perform the action, then offer Undo in the toast.
- **Charts set `isAnimationActive={false}`** so headless screenshots are
  deterministic.
- **Search inputs are debounced** with `useDebounced` (300ms).
- **Build request URLs with `toQueryString`**, which drops empty values.
- **Every list surface handles four states**: loading (skeleton rows), error
  (with retry), empty (distinguishing "no data yet" from "no matches"), and
  loaded. Use `Loading`, `ErrorState`, `EmptyState` from `components/ui.tsx`.
- **API paths are relative** (`/api/...`); Vite proxies them to `localhost:4000`
  in dev.
- **Every page's outermost element uses `PAGE_CONTAINER`** (`lib/page.ts`), never
  its own `max-w-*`. One width for all routes keeps the content box from shifting
  sideways on navigation and keeps identical toolbars wrapping at the same point.
- **Cards in a grid put their footer row on `mt-auto`** inside a `flex h-full
  flex-col` card. Grid rows stretch cards to a common height, so a footer that
  merely follows variable-length copy lands at a different y in each card.
- **List surfaces sort from their column headers, not a sort dropdown.** The
  header drives the API's `sort`/`direction`; clicking the active column flips
  direction, and a new column starts descending for timestamps, ascending for
  names.
- **A surface whose search spans more than one field highlights the match.**
  Notes searches note text and Pokémon name together, so without the mark it is
  not clear which column a row matched on. Escape the term before it becomes a
  pattern, and highlight the *debounced* term so the marks agree with the rows.
- **Client-side column sorts sink absent values in BOTH directions.** Reversing
  them to the top on a descending sort buries the largest values under a wall of
  dashes. For move power, "absent" means `null` *or* `0` — `movePower` renders
  both as "—", so both must sort the same way.
- **A sortable column header puts its padding on the button, not the `<th>`**, so
  the whole cell is the hit target. Label-sized targets are ~16px tall and are
  genuinely hard to hit.
- **The Pokémon Profile is three rails at `xl`**: reference data left, the species
  record centre, the CRM record (notes, activity log) right. At `lg` there is room
  for two, so the CRM rail takes `lg:col-span-2 xl:col-span-1` and runs full width
  underneath instead of crushing the centre column.
- **Response types are hand-written** in `lib/types.ts`. If you change a route's
  response shape, update the matching interface.
- **`Paginator` takes the API's `pagination` object whole**, not spread fields,
  so `from`/`to` can't be dropped at a call site. Pass `labelPlural` when the
  plural isn't `label + "s"` ("Pokémon", "species").
- **Every paged surface calls `usePageClamp(data?.pagination, setPage)`.**
  Deleting the last row on a page, or any change that shrinks the result set
  without resetting the page, otherwise strands the view on an empty page that
  reads as "no matches". Filter handlers still reset to page 1 themselves.

### Design tokens

Defined once in `client/src/index.css` under Tailwind v4's `@theme`, which
generates the utilities (`bg-surface`, `text-muted`, `border-hairline`,
`text-brand`, …). Add new colors there, not as arbitrary hex in components.

Two colour systems, kept apart:

- **`--color-brand` (`#d92d20`) is the app's accent** — sidebar icons, logo,
  primary buttons, focus rings, links, and the Profile's base-stat bars.
  `--color-brand-strong` (`#b42318`) is the darker step for hover and small
  text. Contrast: 4.71:1 as a mark on the chart surface, 4.83:1 with white text
  on it, 6.40:1 for brand-strong. Do not use `#d03b3b` — reserved for
  status-critical.
- **`--color-series-1..4` are the categorical palette** for the Performance
  Dashboard's analytical charts. Chart series come from the series tokens;
  chrome comes from brand.

### Charting

- **Single-series charts** use `--color-series-1` and carry **no legend**; the
  card title names the measure. Multi-series charts always have a legend.
- **Never a second y-axis.** Two measures on different scales become two charts.
- Series colors come from `--color-series-1..4`, assigned in fixed order, never
  cycled.
- Marks are thin with 4px rounded data-ends; grid and axes are recessive
  (`--color-hairline`, no axis lines, no tick lines); every chart has a tooltip.
- **The Pokémon type colors in `lib/format.ts` are for badges only, never chart
  series.**
- The Profile's base-stat chart is the one chart on `--color-brand`.

### The dashboard is filtered server-side

`/api/stats/dashboard` builds one `scope` fragment — the filtered subset as a
subquery aliased back to `pokemon` — and **every aggregation selects from
`${scope}`, never from `pokemon`**. A new aggregation that reads the table
directly silently ignores the filter bar while sitting under a header that says
otherwise.

Consequences worth knowing:

- The BST histogram's bands come from the filtered min/max, so they shift when
  you filter.
- The Attack vs. Speed scatter samples odd ids only above 300 species; below
  that it plots every point.
- The CRM tiles are scoped too, so they answer the same question as the charts.
- "Most widely learned moves" counts learners **within the scope** rather than
  reading `moves.learned_by_count`, which is dex-wide.

### Type effectiveness

`server/src/effectiveness.ts`. Same split as `attention.ts`: **SQL fetches the
324-row chart, TypeScript does the arithmetic.**

- **The chart never leaves the server.** Callers get conclusions — what a species
  is weak to — not the matrix. `/api/pokemon/:id` returns `matchups` with
  `weaknesses` / `resistances` / `immunities`, worst-first and best-first
  respectively.
- **Neutral matchups are omitted** from all three lists. They are most of the 18
  and carry no signal.
- The matrix is **loaded once and cached** for the life of the process. A
  rejection is not cached, so a first call before the seed has run can be
  retried; `resetTypeChart()` drops it.
- **An unknown type contributes a neutral 100, never a 0** — an absent row must
  not read as an immunity.
- Multipliers stay hundredths end to end; `effectivenessLabel` in
  `lib/format.ts` renders them (`200` → "2×", `50` → "½×", `0` → "No effect").

### Needs-attention scoring

`server/src/attention.ts`. **SQL gathers facts, TypeScript applies weights.**
Every weight lives in `ATTENTION` (`constants.ts`) and produces both the score
and the human-readable reasons.

Five signals: never reviewed, stale review, flagged, milestone overdue, behind
pace. Retired roster members are never scored.

**`expPerDay` is a simulation constant, not a measurement** — PokeAPI gives
EXP-per-level, never EXP-per-day. It is surfaced in the API response and printed
under the queue in the UI. Tune it if rosters read as uniformly ahead or behind.

Two seeding dependencies, both of which silently disable signals if lost:

- **`roster.acquired_at` must be backdated** — it defaults to `now()`, which
  gives every member zero days on roster and disables the pace signal.
  `seed:trainers` spreads tenure.
- **Some review history must exist**, or "never reviewed" fires for nearly every
  member. `seed:trainers` reviews two thirds of roster Pokémon, but only those
  with **no** activity rows, so hand-set flags are never overwritten.

### The acting user

`lib/useCurrentUser.tsx` holds it; `components/UserSwitcher.tsx` is the control
at the foot of the sidebar.

- **The choice is an email in localStorage**, restored before the first request
  so a write is never mis-filed while the directory loads. An unknown or absent
  email falls back to the API's `defaultOwner`.
- **`setActingUser()` in `lib/api.ts` puts it on every request as
  `X-Acting-User`.** Write call sites don't pass an owner, so a new one cannot
  forget to attribute. Pass `owner` in the body only to attribute to someone
  *other* than the acting user (see the Profile's activity Undo).
- **Use `labelFor(owner)` to render any owner string**, never the raw column —
  it resolves an email to a display name and falls back to the email itself.
- **Anything showing "your" state must filter on the acting email and refetch
  when it changes.** The Profile's status toggles do both: the API keys a flag
  on (pokemon, owner, kind), so rendering another user's flag as on would make
  the first click look like a no-op.

### Status flags: three views of one table

- **Profile → Status** — toggle buttons in the left rail. Setting a flag inserts
  a row; unsetting deletes it (`reviewed` excepted, which bumps `updated_at`).
- **Profile → Activity log** — the same rows as a timestamped history, newest
  first, each removable. Removing a log entry *is* clearing the flag; there is no
  separate audit table. It lives in the right-hand CRM rail, not beside the
  toggles, so copy here must not say "below" or "above".
- **Activity page** — every row across all Pokémon, filterable and sortable.

**Filtering notes or activity by trainer** goes through `roster`. There is no
`trainer_id` on `notes` or `activity`, so the filter is an `exists` against
`roster`; since `roster` has its own `pokemon_id`, the outer reference must be
qualified (`${notes}.pokemon_id`) or it matches everything.

The Activity page's summary tiles use the API's **unfiltered** `kindCounts`, so
they stay put while you filter the table underneath them.

### The Tableau embed (`pages/Tableau.tsx`)

Embeds the Tableau Public workbook `shared/K7RTFZCTW`.

- **Uses Embedding API v3** (`tableau.embedding.3.latest.min.js`) with a
  `<tableau-viz>` custom element — not Tableau's share snippet, whose legacy
  `viz_v1.js` rewrites the DOM and double-runs under StrictMode.
- **The element is created imperatively**, not in JSX, so React never owns it.
- **The API script is loaded once** and cached in a module-level promise. A
  rejection is *not* cached, so the retry button can try again.
- **The viz is pinned to its authored 1600 × 927** and the card scrolls
  horizontally; Tableau does not scale a fixed-size dashboard down to fit. Below
  a 500px container the workbook switches to its phone layout, which is taller
  (`PHONE_HEIGHT`). Update both constants if you swap in another workbook.
- This page is **not backed by the CRM database**.

---

## Local development

```bash
npm install
cp .env.example .env      # then edit DATABASE_URL
npm run setup             # db:create → db:migrate → seed → seed:trainers
npm run dev               # API on :4000, web on :5173
```

`db:create` connects to the `postgres` maintenance database and issues a
CREATE DATABASE; without it `db:migrate` fails on a fresh machine with
`database "pokemon_crm" does not exist`. See README for the first-run
walkthrough.

Other scripts: `npm run seed:users`, `npm run seed:types` (re-imports just the
18-request type chart), `npm run db:generate` (new migration from schema changes),
`npm run db:push` (dev-only direct sync), `npm run db:studio`,
`npm run typecheck`, `npm run build`.

### Gotchas

- **`drizzle.config.ts` must not import `src/env.ts`.** drizzle-kit bundles its
  config as CJS, which can't load the ESM-only `env.ts` (`import.meta.url`). The
  config reads `.env` directly. An env var both need must be added in both
  places.
- **The scrolling `<main>` in `App.tsx` must stay `relative`.** `.sr-only` is
  `position: absolute`, so without a positioned ancestor those elements resolve
  against the document, sit outside `main`'s overflow clipping, and stretch
  `<html>` to the full content height — a second scrollbar and empty scroll
  space past the end of the page. Same applies to any new scroll pane.
- **A native `<dialog>` needs `m-auto` under Tailwind**, whose preflight resets
  the `margin: auto` that centres it. `components/Modal.tsx` sets it.
- **Closed modals stay mounted.** Pages render `<Modal open={false}>` rather than
  unmounting, so target `dialog[open]` when scripting against one.
- **Never rewrite a source file with PowerShell `Set-Content`.** PowerShell 5.1
  reads with the ANSI codepage and writes UTF-8, turning `Pokémon` into
  `PokÃ©mon`. Use the editing tools. To check: search the tree for `Ã©`, `â€`,
  or U+FFFD.
- **npm ≥ 11 blocks install scripts by default.** esbuild (used by tsx, vite and
  drizzle-kit) needs its postinstall to fetch a platform binary. Approvals live
  in the root `package.json` under `allowScripts`; after adding a dependency that
  pulls a new esbuild version, run `npm approve-scripts esbuild`.
- **Both seeds are safe to re-run** — `seed` upserts on primary key,
  `seed:trainers` upserts on trainer name and `(trainer, pokemon)`.
  `seed:trainers` skips roster entries whose Pokémon isn't seeded, so a
  `SEED_LIMIT=151` run drops the Sinnoh rosters and says so. `pokemon_moves` is
  the exception: the seed **deletes and reinserts** the rows for the Pokémon it
  fetched, so a move dropped from a movepool doesn't linger.
- **`SEED_MOVES=false` skips the moves import.** The movepool join rows are free
  (they come with the `/pokemon` response); the move details are ~900 extra
  requests and ~30 more for version-group ordering. With it off, the moves pages
  render their empty states.
- The local Postgres uses `trust` auth on localhost, so `.env` has no password.
  Azure needs `PGSSL=true` and `sslmode=require`.

---

## CI

`.github/workflows/ci.yml` runs on every push to `master` and every PR into it.

- **build** — `npm ci`, `typecheck`, `build`, on Node 20 (the `engines` floor)
  and 22. `fail-fast` is off.
- **migrations** — spins up a Postgres 16 service, runs `db:create` and
  `db:migrate` **twice each**, and asserts all ten tables exist. Adding a table
  means adding it to that list.

**CI does not seed** — that would be ~2,600 PokéAPI requests per push, against
their fair use policy. The seed is verified locally.

CI needs no `.env`; the migrations job passes `DATABASE_URL` directly.

## Deploying against Azure Postgres

Set `DATABASE_URL` to the Azure connection string (with `?sslmode=require`) and
`PGSSL=true`; `db/client.ts` then connects with
`ssl: { rejectUnauthorized: false }`, which Azure's managed Postgres requires.
Run `npm run db:migrate` against the Azure database before the first deploy,
then `npm run seed` once.

In production the client is a static bundle (`client/dist`); serve it behind a
proxy that forwards `/api` to the Express server.

---

## Not yet built

See [TODO.md](TODO.md). In short: no auth (users are an unverified "acting as"
switcher — see § `users`), no tests, no dark mode, and a single ~720 kB JS chunk.
