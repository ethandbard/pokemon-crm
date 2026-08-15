# TODO

Items 1, 2, 3a, 3c, 4, 5 and 6 are done. 3b is the live backlog — its
`/type/{name}` bullet has landed the matrix, leaving the roster coverage report.

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
- **✅ `/type/{name}` — DONE (the matrix and the Pokémon-level surface).**
  Migration `0007_abnormal_gideon.sql` adds `type_damage` (324 rows);
  `seed:types` imports it in 18 requests, and `seed` runs it as a pass.
  `server/src/effectiveness.ts` computes defensive matchups server-side — the
  matrix is not shipped to the client — and `/api/pokemon/:id` returns them as
  `matchups`, rendered as a Type matchups card on the Profile.

  **Still open, and the reason this item was picked:** the roster-level half.
  Upgrading 3c's coverage report from "which types can this roster hit with" to
  "can it cover what it is weak to" means joining the active roster's movepool
  types against the matrix on the trainer dashboard. Everything it needs is now
  in place.
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

"Can a roster cover its own weaknesses" now has its data — see 3b's
`/type/{name}`, which landed the matrix but not yet the roster-level report.

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

## ✅ 6. Multiple users — DONE

Migration `0006_flimsy_smiling_tiger.sql` adds `users`; `seed:users` fills it.
`owner` columns were already in place, so nothing needed backfilling.

- `ownerFor` (`server/src/owner.ts`) resolves every write's attribution from the
  `X-Acting-User` header, with an explicit body `owner` overriding it.
- `UserSwitcher` in the sidebar, backed by `lib/useCurrentUser.tsx`; the choice
  is an email in localStorage.
- Notes and Activity render display names and gained an "Only mine" filter; the
  Profile's status toggles are now per-user, with the activity log staying
  shared.

Still open:

- **Nothing is verified** — see the auth gap below.
- **Anyone can edit or delete anyone's note.** With no auth there is nothing to
  enforce it with; the UI doesn't distinguish yours from theirs.
- Existing rows seeded before this landed stay under `DEFAULT_OWNER`; only newly
  seeded review history spreads across users.

---

## Known gaps (not yet scheduled)

- **No tests.** CI runs typecheck, build, and a migrations smoke test
  (`.github/workflows/ci.yml`), so the job exists to hang tests off. Highest-value
  first suite: the aggregation endpoints (`/api/stats/dashboard`,
  `/api/trainers/:id`, `/api/attention`, `/api/moves/:id`) asserted against a
  known seeded fixture.
- **No authentication.** The `users` table and "acting as" switcher (item 6
  below) attribute writes but verify nothing — the acting user is a header the
  client sets. Real auth means sessions and a check in `ownerFor`.
- **Single ~720 kB JS chunk.** Route-level `React.lazy` would split Recharts out
  of the pages that don't chart.
- **No dark mode.** Tokens are centralised in `index.css` if it comes back.
- **The needs-attention model ignores movepools.** A thin movepool or an
  uncovered weakness is arguably an alert; it is a sixth signal plus a weight in
  `ATTENTION`. The type chart it was waiting on now exists (3b), so the signal
  can be about coverage rather than raw move count — but it should follow the
  roster-level coverage report rather than lead it.
