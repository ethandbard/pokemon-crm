# TODO

Items 1, 2, 3a, 3c, 4 and 5 are done. 3b is the live backlog.

---

## ✅ 1. Needs-attention queue (early alert) — DONE

`server/src/attention.ts` (scorer) + `routes/attention.ts` +
`components/AttentionQueue.tsx`. Surfaced workspace-wide on Home and per-trainer
on the Trainers dashboard. Five signals: never reviewed, stale review, flagged,
milestone overdue, behind pace. Weights and the seeding dependencies are
documented in CLAUDE.md § Needs-attention scoring.

## ✅ 2. Interactivity layer — DONE

- **Command palette (⌘K / Ctrl+K)** — `components/CommandPalette.tsx`; pages
  matched locally, Pokémon, moves and trainers from the pages' own search
  endpoints.
- **Optimistic updates** — activity toggles on Profile and roster kanban moves
  flip immediately and roll back on failure.
- **Toasts with Undo** — `components/Toast.tsx`; `confirmable()` replaces
  `window.confirm` on destructive actions.
- **Multi-select + bulk actions** — `components/BulkActionBar.tsx` on Lookup,
  backed by `POST /api/activity/bulk`, `/api/notes/bulk`, and
  `/api/trainers/:id/roster/bulk`. Selection spans pages.
- **Roster kanban** — `components/RosterBoard.tsx`, native HTML5 drag events.
- **Saved views** — `lib/useSavedViews.ts` + `components/SavedViews.tsx`, wired
  to Lookup, Moves, Notes, and Activity; localStorage-backed.

Still open:

- Bulk actions are on Lookup only; Activity has row-level remove but no
  multi-select.
- Saved views are per-device. Moving them server-side is a swap of the two
  functions in `useSavedViews.ts`.

## 3. Unused PokéAPI data

Grouped by cost, not priority.

### ✅ 3a. Free — already in responses the seed fetches — DONE

Migration `0004_melted_iron_fist.sql` (27 additive columns, 3 indexes) plus
`buildRow`/`walkChain` in the seed. No extra HTTP. Coverage: 1025/1025 for
flavour text, genus and cries; 856/1025 for hidden abilities; 386/1025 for
habitat (Gen 1–3 only). Landed `flavor_text`, `genus`, hidden abilities,
`species.generation`, `growth_rate`, `base_happiness`, `hatch_counter`,
`evolution_condition` / `evolution_requirements`, egg groups, habitat, shape,
`is_baby`, `gender_rate`, EV yield, held items, extra sprites and cries, and
`regional_dex_numbers`.

`varieties` are stored as names only; importing the forms themselves needs extra
HTTP, so it moved to 3b.

### 3b. Extra requests — highest payoff

- **Import `varieties` as rows** — one `/pokemon/{name}` fetch per variety
  (~250). Their dex ids are in the 10000s. Needs a decision on whether a form is
  a row in `pokemon` or a new `pokemon_forms` table; a form sharing a dex number
  with its base would break the primary key.
- **`/type/{name}` — 18 requests, the biggest single unlock.**
  `damage_relations` is the full effectiveness matrix: defensive weaknesses per
  Pokémon, coverage gaps per roster. Compute effectiveness server-side from a
  `type_damage` table; don't ship the matrix to the client. Upgrades 3c's
  coverage report from "which types can this roster hit with" to "can it cover
  what it is weak to".
- **`/pokemon/{id}/encounters`** — 1,025 requests, tiny responses. Location,
  method, and rarity per game version; backs a "where does this come from" panel.
- **`/ability/{name}`** — ~370 requests. Effect text so abilities render as prose
  rather than slugs, plus an abilities dimension on the Dashboard.

### ✅ 3c. Moves — DONE

Migration `0005_swift_xavin.sql`: `moves` (797 rows) and `pokemon_moves`
(115,026 rows). Join rows come free with the `/pokemon` responses; only ~900
`/move/{name}` and ~30 `/version-group/{name}` fetches are extra, and
`SEED_MOVES=false` skips them.

Surfaced as `/moves` + `/moves/:id`, a movepool card on the Profile, movepool
coverage on the trainer dashboard, four aggregations on the Performance
Dashboard, a `moveCount` column on Lookup, and moves in the command palette.

Three constraints that cost time and are easy to reintroduce — all recorded in
CLAUDE.md § `moves` and `pokemon_moves`:

- Version group **ids are not chronological** (`blue-japan` is id 29, order 2).
- `power: 0` is not `power: null`, and neither means zero damage.
- Coverage must exclude status moves.

"Can a roster cover its own weaknesses" still needs 3b's `/type/{name}`.

### 3d. Completionist

- **`/nature`, `/berry`, `/item`, `/machine`** — no CRM analogy that isn't a
  stretch.

## ✅ 4. Pagination — DONE

- Trainer note/activity history paginates (`notesPage`, `activityPage`,
  `historyPageSize`), independently of each other, replacing a bare `limit 50`
  with no total.
- `paginationFor()` in `http.ts` builds every list envelope and adds `from`/`to`
  ("showing 26–50 of 312"). A page past the end reports 0–0, not a backwards
  range.
- `usePageClamp` snaps the page back when the result set shrinks under it.

## ✅ 5. Dashboard filters — DONE

`/api/stats/dashboard` takes type, generation, legendary, mythical, region,
habitat, egg group, growth rate and a BST range, and scopes **every**
aggregation through one `scope` subquery. The response carries `scope.filtered`
vs `scope.total` so the page states its own coverage.

---

## Known gaps (not yet scheduled)

- **No tests.** CI runs typecheck, build, and a migrations smoke test
  (`.github/workflows/ci.yml`), so the job exists to hang tests off. Highest-value
  first suite: the aggregation endpoints (`/api/stats/dashboard`,
  `/api/trainers/:id`, `/api/attention`, `/api/moves/:id`) asserted against a
  known seeded fixture.
- **`owner` is hardcoded** to `DEFAULT_OWNER`. An "acting as" switcher would
  exercise the multi-advisor shape before real auth lands.
- **Single ~720 kB JS chunk.** Route-level `React.lazy` would split Recharts out
  of the pages that don't chart.
- **No dark mode.** Tokens are centralised in `index.css` if it comes back.
- **The needs-attention model ignores movepools.** A thin movepool or an
  uncovered weakness is arguably an alert; it is a sixth signal plus a weight in
  `ATTENTION`, and should wait for 3b's type chart so the signal can be about
  coverage rather than raw move count.
