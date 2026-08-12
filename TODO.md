# TODO

Agreed backlog, in the order it makes sense to build. Items 1 and 2 from the
original plan (trainer/roster CRUD, evolution-as-progress) are **done** — what
follows is what was deferred.

---

## 1. Needs-attention queue (early alert) — next up

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

## 2. Interactivity layer

Independent of 1; can be done in any order.

- **Command palette (⌘K)** — jump to any Pokémon, trainer, or page by typing.
  With 1,025 records this is the biggest usability win available per line of
  code. `/api/pokemon?search=` and `/api/trainers?search=` already back it.
- **Optimistic updates** — every mutation currently calls `refetch()` and
  re-pulls the whole page. Flag toggles in particular should feel instant.
- **Toasts with Undo** — replaces the current mix of inline error text and
  `window.confirm`. Deletion should be recoverable rather than gated behind a
  confirm dialog.
- **Multi-select + bulk actions** — checkboxes on Lookup/Activity to set a flag,
  add the same note, or add several Pokémon to a roster at once.
- **Roster kanban** — drag members between Starter / Active / Reserve / Retired.
  The status enum and the PATCH endpoint already support it.
- **Saved views** — filter state is partly in the URL already; finish it and let
  people name and reopen a filter set.

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
