import type { Request } from 'express';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { DEFAULT_OWNER } from './constants.js';
import { trainers } from './db/schema.js';

/**
 * Who a write is attributed to.
 *
 * **This is attribution, not authentication.** The header is whatever the
 * client says it is; nothing verifies it. It exists so the multi-user shape —
 * per-user notes, per-user flags, per-user filtering — is exercised before real
 * auth lands. When auth does land, this function reads the session instead and
 * no route handler changes.
 *
 * Precedence: explicit `owner` in the body (an API client acting deliberately),
 * then the header the switcher sets, then DEFAULT_OWNER.
 */
export const ACTING_USER_HEADER = 'x-acting-user';

const ownerSchema = z.string().trim().min(1).max(200);

export function ownerFor(req: Request, bodyOwner?: string | null): string {
  if (bodyOwner) return ownerSchema.parse(bodyOwner);

  const header = req.get(ACTING_USER_HEADER);
  const parsed = header ? ownerSchema.safeParse(header) : null;
  return parsed?.success ? parsed.data : DEFAULT_OWNER;
}

/** `?scope=` on trainer-aware lists. Defaults to the acting user's own. */
export const scopeSchema = z.enum(['mine', 'all']).default('mine');
export type TrainerScope = z.infer<typeof scopeSchema>;

/**
 * The predicate every trainer-aware read filters by, as a single expression.
 *
 * Returns `undefined` for `scope=all`, which callers treat as "no extra
 * condition" — so a caller can always write
 * `and(...filters, trainerScope(req, scope))` and let Drizzle drop the
 * undefined.
 *
 * **This exists so the condition is written once.** There are four independent
 * `trainerOptions` queries across the routes plus joins in `attention.ts`,
 * `moves.ts` and `stats.ts`; eight hand-written copies of `owner = ?` is how
 * one of them ends up scoping differently from the rest.
 *
 * Scoping is **visibility, not security** — the acting user is an unverified
 * header. See `trainers.owner` in schema.ts.
 */
export function trainerScope(req: Request, scope: TrainerScope) {
  return scope === 'all' ? undefined : eq(trainers.owner, ownerFor(req));
}

/** The same predicate as raw SQL, for the routes that build `sql` fragments. */
export function trainerScopeSql(req: Request, scope: TrainerScope, alias = 'trainers') {
  if (scope === 'all') return sql`true`;
  return sql`${sql.identifier(alias)}.owner = ${ownerFor(req)}`;
}
