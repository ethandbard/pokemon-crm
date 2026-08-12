# TODO

Agreed backlog. **Items 1 and 2 below are now done** — kept for the design
notes. Item 3 (unused PokéAPI data) is the live backlog.

---

## ✅ 1. Needs-attention queue (early alert) — DONE

Built as `server/src/attention.ts` (scorer) + `routes/attention.ts` +
`components/AttentionQueue.tsx`. Surfaced workspace-wide on Home and per-trainer
on the Trainers dashboard.

Two things worth knowing that weren't obvious when this was written:

- **`growth_rate` landed first**, as the note in 3a asked. "Underlevelled" is
  now "behind the pace the species' real EXP curve implies for its time on
  roster", not "below the roster mean".
- **Roster tenure had to be seeded.** Every `acquired_at` defaulted to seed
  time, so every member had zero days on roster and the pace signal could never
  fire — the feature would have looked fine and done nothing. `seed:trainers`
  now backdates tenure across a deliberate spread.
- **A review history had to be seeded too.** With none, "never reviewed" fired
  for 39 of 40 members and the queue flagged ~everything. Seeding reviews for
  two thirds took it to 29 of 40 with all five signals represented.

Original spec follows.

### Original spec

The core advising loop: turn the app from something you browse into something
that tells you what to do. A ranked "these need you this week" list on the
trainer dashboard.

Everything it needs already exists in the schema — this is a scoring query plus
a panel, not new tables.

Composite score per roster member:

| Signal | Source | Why it matters |
|---|---|---|
| Days since last review | `activity` where `kind = 'reviewed'`, `updated_at` | Stale contact is the classic advising alert |
| Flagged | `activity` where `kind = 'flagged'` | Explicit concern already raised |
| Never reviewed | no `reviewed` row at all | Never made contact |
| Milestone overdue | `milestoneEligible` and still not evolved | Requirement met, nobody signed it off |
| Underlevelled | `roster.level` well below the roster's mean | Falling behind peers |

Notes:
- Weight the signals in **one place** on the server and return both the score
  and the reasons, so the UI can explain *why* something is in the queue.
  A score with no explanation is not actionable.
- "Milestone overdue" is already computed for the roster table — reuse that SQL
  rather than writing a second copy.
- Consider a workspace-wide version on the Home page, not just per trainer.

## ✅ 2. Interactivity layer — DONE

- **Command palette (⌘K / Ctrl+K)** — `components/CommandPalette.tsx`. Pages
  matched locally; Pokémon and trainers from the same search endpoints the
  pages use, so there's no second index to keep in sync.
- **Optimistic updates** — activity toggles on Profile flip immediately and roll
  back on failure; roster kanban moves do the same.
- **Toasts with Undo** — `components/Toast.tsx`. `confirmable()` replaces
  `window.confirm` on destructive actions: do it, then offer Undo.
- **Multi-select + bulk actions** — `components/BulkActionBar.tsx` on Lookup,
  backed by `POST /api/activity/bulk`, `/api/notes/bulk`, and
  `/api/trainers/:id/roster/bulk`. Selection spans pages.
- **Roster kanban** — `components/RosterBoard.tsx`, native HTML5 drag events.
  Toggle between Table and Board on the Trainers dashboard.
- **Saved views** — `lib/useSavedViews.ts` + `components/SavedViews.tsx`, wired
  to Lookup, Notes, and Activity. localStorage, since these are personal UI
  preferences and there's no auth to attach them to.

Still open from this area:

- Bulk actions are on Lookup only; Activity has row-level remove but no
  multi-select.
- Saved views are per-device. Moving them server-side is a swap of the two
  functions in `useSavedViews.ts`.

## 3. Unused PokéAPI data

The seed hits three endpoints (`/pokemon`, `/pokemon-species`,
`/evolution-chain`) and discards most of what two of them already return.
Grouped by cost, not by priority.

### 3a. Free — already in responses the seed fetches

One migration plus changes to `buildRow` in `server/src/scripts/seed.ts`. No
extra HTTP, so re-seed time is unchanged. Worth doing as a single batch.

- **`flavor_text_entries` + `genera`** — the Pokédex blurb and the genus
  ("Seed Pokémon"). Profile has no descriptive text at all; this is the
  cheapest visual win available. Filter to `language.name === 'en'` and take
  the most recent version entry — the array carries one per game.
- **`abilities[].is_hidden` / `slot`** — the seed flattens abilities to bare
  names and loses the hidden flag. Store `{ name, isHidden }`; it can't be
  recovered later without a re-seed.
- **`species.generation`** — replaces `generationForDexNumber` in
  `constants.ts`, which buckets by dex-number ranges. The heuristic is correct
  for 1–1025 but breaks silently on any regional form or variety, whose dex
  ids are in the 10000s.
- **`growth_rate`, `base_happiness`, `hatch_counter`** — `growth_rate` is the
  valuable one: it names a real EXP curve, so combined with `roster.level` it
  gives *pace* rather than raw level. That turns item 1's "underlevelled"
  signal from "below the roster mean" into "behind the expected curve for
  time on roster", which is a far better alert. **Do this before writing the
  scoring query.**
- **Full `evolution_details`** — `walkChain` takes `[0]` and reads only
  `min_level` / `trigger` / `item`, dropping `min_happiness`, `time_of_day`,
  `location`, `known_move`, `held_item`, `gender`, and `trade_species` — plus
  every path after the first on a branching species. Those dropped fields are
  exactly where the requirement lives for the ~⅓ of the dex with a null
  `evolution_min_level` (see CLAUDE.md § Data model).
- **`egg_groups`, `habitat`, `shape`, `is_baby`, `gender_rate`** — cheap
  categorical dimensions. The Dashboard currently only slices by type,
  generation, and BST.
- **`stats[].effort` (EV yield)** and **`held_items`** — `effort` is the only
  per-stat field still being dropped.
- **`sprites.other.home`, shiny variants, `cries.latest`** — the seed keeps 2
  of roughly 20 sprite URLs. A shiny toggle is a few lines; `cries` is an mp3
  URL and one `<audio>` on Profile.
- **`varieties` / `pokedex_numbers`** — `varieties` are the Mega and regional
  forms, missing from the dataset entirely. `pokedex_numbers` gives regional
  dex numbers, which would let Lookup scope by region — and would finally give
  `trainers.region` a data relationship to something.

### 3b. Extra requests — highest payoff

- **`/type/{name}` — 18 requests, the biggest single unlock.**
  `damage_relations` is the full effectiveness matrix. Per Pokémon it gives
  defensive weaknesses; per roster it gives **coverage analysis**: "this
  trainer's active roster is 4× weak to Ground and has no answer to Steel."
  The Trainers page's type breakdown currently only counts types — this makes
  it a gap report, which is the advising analogue that's actually missing.
  Compute effectiveness server-side from a `type_damage` table; don't ship the
  matrix to the client and fold it there.
- **`/pokemon/{id}/encounters`** — 1,025 requests but tiny responses. Location,
  method, and rarity per game version; backs a "where does this come from"
  panel and a source/recruitment breakdown.
- **`/ability/{name}`** — ~370 requests. Effect text so abilities render as
  prose rather than slugs, plus an abilities dimension on the Dashboard.

### 3c. Larger — a new pillar, not a column

- **`pokemon.moves` + `/move/{name}`** — ~900 moves and a large join table.
  The curriculum analogy: moves learned by level are coursework with
  prerequisites, learn method is how it was earned, and movepool coverage
  checked against the type chart (3b) answers whether a roster member can
  actually cover its own weaknesses. Richest unused data in the API, and the
  only item here that's a schema project rather than an additive migration.
- **`/nature`, `/berry`, `/item`, `/machine`** — completionist. No CRM analogy
  that isn't a stretch; listed so nobody has to re-derive that conclusion.

---

## Known gaps (not yet scheduled)

- **No tests at all.** The correlated-subquery bug (see CLAUDE.md § API
  conventions) silently returned zeros for weeks and was only caught when a
  later query made it ambiguous enough to crash. API-level tests over the
  aggregation endpoints would have caught it.
- **Trainer note/activity history is capped at 50** with no pagination and no
  "showing 50 of N" — it silently truncates on a busy roster.
- **`owner` is hardcoded** to `DEFAULT_OWNER`. An "acting as" switcher would
  exercise the multi-advisor shape before real auth lands.
- **Single ~640 kB JS chunk.** Route-level `React.lazy` would split Recharts out
  of the pages that don't chart.
- **No dark mode.** Deliberately deprioritised; tokens are centralised in
  `index.css` if it comes back.
- **Dashboard has no filters** — the EDA charts always cover the whole dataset,
  with no way to scope by generation or type.
