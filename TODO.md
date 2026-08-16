# TODO

Items 1, 2, 3a, 3c, 4, 5 and 6 are done. **Item 7 — the roster-building pivot —
is complete** — all four phases landed. **Item 8 is the active work**; 3b's
remaining bullets (varieties, encounters) follow it.

---

## ✅ 1. Needs-attention queue (early alert) — DONE

`server/src/attention.ts` (scorer) + `routes/attention.ts` +
`components/AttentionQueue.tsx`. Surfaced workspace-wide on Home and per-trainer
on the Trainers dashboard.

**The signals were replaced in 7c** — see there. The queue is now moveset
readiness plus review hygiene, with a separate trainer-level alert list. Weights
and constraints live in CLAUDE.md § Needs-attention scoring.

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

  **The roster-level half landed with item 7 phase 1** — and turned out to need
  movesets first. Answering "can it cover what it is weak to" from the
  *learnable* movepool would have said yes for nearly every roster.
- **`/pokemon/{id}/encounters`** — 1,025 requests, tiny responses. Location,
  method, and rarity per game version; backs a "where does this come from" panel.
  **Probe coverage before designing a surface** — encounter data thins out after
  Gen 7, so this may be a Gen 1–7 panel that has to state its own scope, as
  `habitat` does.
- **`/ability/{name}` — moved to item 8a.**

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

## 7. Roster building as the product

The pivot: make building and evaluating a roster the point, and the analysis
honest. Plan agreed in four phases; **phase 1 is done**.

### ✅ 7a. Movesets and honest coverage — DONE

Migration `0008_flat_nocturne.sql` adds `roster_moves` (four slots per entry).
`PUT /api/roster/:id/moves` replaces a whole moveset and **rejects moves the
species cannot learn** — the rule the whole feature rests on.
`GET /api/trainers/:id/analysis` returns offence, defence, gaps, threats and
readiness, computed in `effectiveness.ts` from equipped moves only. Surfaced as
the Team analysis card and a Moveset column on the trainer dashboard; the old
coverage card is relabelled "(potential)".

The constraint worth not reintroducing is recorded in CLAUDE.md § Roster
analysis: **equipped is `roster_moves`, learnable is `pokemon_moves`**, and a
team-strength figure that reads the latter is a ceiling wearing the wrong label.

### ✅ 7b. Team-leader dashboard — DONE

`/team` (`pages/Team.tsx`), trainer-scoped via `?trainerId=`, reading the
analysis endpoint: readiness tiles, open threats, attacking coverage and
defensive exposure charts, coverage detail, and per-member moveset completeness.
The dex-wide `/dashboard` is untouched.

Both cleanups landed with it:

- `axisProps` / `tooltipProps` extracted to `lib/charts.ts`, which is now the
  one place chart chrome is defined.
- `statAverages` on the trainer dashboard averaged **retired** members despite
  its "Averaged across this roster" subtitle. It was six `union all` arms each
  repeating the join and filter, and the filter was missing from all six;
  rewritten as one scan plus a lateral `VALUES` unpivot, so there is now exactly
  one place that filter could be wrong.

`offense[].answeredBy` was added server-side rather than deriving it on the
client — `members.length` ties on the best result even when neutral, so "how
many can answer this" needed to mean one thing.

### ✅ 7c. Attention rework — DONE

`behind_pace` is gone, and `expPerDay` with it — the queue no longer reports a
simulation as a finding. `flagged` and `milestone_overdue` went too.
`moveset_missing` and `moveset_incomplete` are the new member signals, and
`getRosterAlerts()` is a **separate trainer-level list** (roster below six,
unanswered shared weakness), because a roster alert has no member to hang on.

Two things found while building it:

- **Alerts had to cap on the workspace-wide view.** Ten rosters produce ~38
  alerts, which buried a member queue capped at 8. Scoped to one trainer they
  all ship — Brock's six unanswered weaknesses are each real — so only the
  unscoped view caps, and it returns `alertsTotal` with it.
- Weaknesses sort worst-first so a capped view keeps the worst.

⚠️ Dropping `flagged` removed the only manual escalation path into the queue.
Reversible in four lines of `scoreFacts`.

Nothing reads `growth_rates` (600 rows) any more; the table stays seeded.
Evolution readiness survives as the trainer dashboard's "Ready to evolve" card —
it is no longer an alert, which is the distinction.

### ✅ 7d. Trainer ownership — DONE

Migration `0009_narrow_jack_murdock.sql` adds `trainers.owner`. Reads take
`?scope=mine|all` (default `mine`); writes to a trainer you don't own return
403 from `assertOwned` / `assertOwnsTrainer`, and a transfer must clear both
ends. The predicate lives once in `owner.ts` as `trainerScope` /
`trainerScopeSql`. Full rules in CLAUDE.md § Trainer ownership.

Three findings worth keeping:

- **`stats.ts` never referenced trainers**, so the dex-wide dashboard needed no
  scoping at all — the plan over-listed it.
- **`db/schema.ts` cannot import `constants.ts`** — drizzle-kit loads it as CJS
  and fails on the ESM path, the same trap already documented for
  `drizzle.config.ts`. `DEFAULT_OWNER` is repeated as a literal there.
- **The scope toggle had to be a query param, not a header** like
  `X-Acting-User`. `useApi` keys off the path, so a header would have changed
  nothing on screen until an unrelated refetch.

Under "All trainers" you can open someone else's roster, so every write control
is disabled with a banner naming the owner — showing buttons that can only 403
is the dead-end this app keeps having to design out.

With no auth this is a convention, not a guarantee: switching users grants you
their trainers, and the switcher says so.

### ✅ 7e. Admin page — DONE

`/admin` (`pages/Admin.tsx`, `routes/admin.ts`), covering the gap that trainer
ownership could be *set* at creation but never *changed*.

Four sections: data health (reference-table completeness, so a partial seed
stops presenting as unexplained empty pages), trainer owner reassignment, user
edit/delete — **both endpoints already existed with no UI**, so users could be
created but never renamed or removed — and orphaned-attribution repair.

Deliberately ungated; the page says so. Rules in CLAUDE.md § The admin page.

Verified by deleting a user who owned two trainers: the orphan panel picked up
2 trainers / 1 note / 3 flags, and reassigning moved 2 trainers, 1 note and
**2** flags — the third was dropped as a duplicate, because the destination
already carried that same `(pokemon, kind)` flag.

Not built, and argued against: making the `ATTENTION` weights editable. They
are documented compile-time constants; moving them to runtime needs a settings
table and turns a legible model into mutable state.

---

## 8. PokéAPI data, round two

Four items, ordered cheapest-first so each ships independently. Each brings
reference data (seed-only, like `moves` and `type_damage`); **8a, 8b and 8d also
add a per-member column or table to the roster**, following the `roster_moves`
rule — equipped rather than potential, keyed on the roster entry, legality
enforced in the route. 8c is reference data only.

### ✅ 8a. Abilities — DONE

Migration `0010_demonic_falcon.sql` adds `abilities` (slug PK) and
`roster.ability`. `seed-abilities.ts` imports effect text; `PATCH
/api/roster/:id` enforces the legality rule; `/api/pokemon/:id` returns an
`abilities` array with effect text, rendered as a stacked block on the Profile.

Three findings worth keeping:

- **The dex references 284 distinct abilities, not ~370.** The rest are
  side-game only. Sourcing the slugs from `pokemon` rather than the `/ability`
  index made the import 23% smaller *and* made it scale with `SEED_LIMIT`, so
  `REFERENCE_TABLES` gives the table no `expected` count — a fixed target would
  report a healthy partial seed as incomplete.
- **`titleCase` had to move to `constants.ts`.** The route quoting a slug back
  in an error needed it, and it lived in `scripts/pokeapi.ts` where a route
  should not reach. `ENGLISH` stayed there — it is PokéAPI-specific.
- **Effect text cannot live in the Profile's reference `<dl>`**, which is
  right-aligned short values. Abilities moved out to a stacked block; the rule
  is now in CLAUDE.md § Frontend conventions.

Still open: the abilities dimension on the Dashboard ships with the dashboards
commit, not here.

### ✅ 8b. Natures — DONE (data layer)

Migration `0011_lonely_hercules.sql` adds `natures` (25 rows) and
`roster.nature`. `seed-natures.ts` imports them all-or-nothing; `GET
/api/natures` backs the picker; `PATCH /api/roster/:id` validates the slug.
`natureEffectLabel` and `natureAdjustedStat` in `lib/format.ts` do the
arithmetic at the display edge.

**The display boundary is the whole point of this item** and is recorded in
CLAUDE.md § Natures: an adjusted figure may appear only for a single named
member, never in an aggregate, and **no route may return one**.

Two things worth keeping:

- **No nature affects HP** — five stats × five = 25 rows. A UI that lays out six
  stat rows must expect HP never to carry a badge.
- **Neutral natures are a choice, not missing data.** Both stat columns are null
  for the five, so they render "neutral"; writing the same stat into both would
  make "+10% Attack / −10% Attack" renderable, which reads as an effect.

The **nature-adjusted stat panel ships with the BuildEditor**, which is the only
surface allowed to show those numbers — see the next item. Committing it here
would have meant an unmounted component.

### 8c. Machines — `/machine/{id}`, ~500–900 requests

`pokemon_moves.learn_method = 'machine'` records that a move is TM-taught but
not *which* TM. The `machines` array already comes free on each `/move`
response; resolving the latest version group's entry per move yields the TM
number and item name. Surfaces on the movepool card and move detail.

Version-group recency uses the group's `order`, not its id — the same trap
recorded in CLAUDE.md § `moves` and `pokemon_moves`.

### 8d. Held items — `/item/{name}`, scoped

Two halves, and only the second needs new tables:

- Effect text for the held items already named in `pokemon.held_items` — a few
  hundred distinct items, self-limiting.
- **`roster_items`** — the item a roster member actually carries. Mirrors
  `roster_moves`: one row per roster entry, equipped rather than potential,
  written by one route (`PUT /api/roster/:id/item`). One item per entry, so no
  slot mechanic.

⚠️ **There is no per-species legality rule for items** — any Pokémon can hold
any held item. The moveset route's join-constraint has no analogue here; the
only check is that the item is holdable. Do not assume otherwise.

Team analysis does **not** read items initially. An item that changes a matchup
(Focus Sash, resist berries) means matchup logic in `effectiveness.ts`, which is
a separate decision — coverage figures must not shift under a label that has not
been re-argued.

Do **not** import all ~2,180 items; scope the fetch to battle-relevant
categories.

---

## Known gaps (not yet scheduled)

- **No tests.** CI runs typecheck, build, and a migrations smoke test
  (`.github/workflows/ci.yml`), so the job exists to hang tests off. Highest-value
  first suite: the aggregation endpoints (`/api/stats/dashboard`,
  `/api/trainers/:id`, `/api/attention`, `/api/moves/:id`) asserted against a
  known seeded fixture.
- **No authentication.** The `users` table and "acting as" switcher attribute
  writes but verify nothing — the acting user is a header the client sets. Real
  auth means sessions and a check in `ownerFor`. **Item 7d now leans on this**:
  trainer ownership scopes reads and 403s writes, which is real behaviour built
  on an unverified claim. Auth is the one gap that turns a convention into a
  guarantee.
- **Single ~720 kB JS chunk.** Route-level `React.lazy` would split Recharts out
  of the pages that don't chart.
- **No dark mode.** Tokens are centralised in `index.css` if it comes back.
- **The needs-attention model ignores movepools.** A thin movepool or an
  uncovered weakness is arguably an alert; it is a sixth signal plus a weight in
  `ATTENTION`. The type chart it was waiting on now exists (3b), so the signal
  can be about coverage rather than raw move count — but it should follow the
  roster-level coverage report rather than lead it.
