import type { Request } from 'express';
import { z } from 'zod';
import { DEFAULT_OWNER } from './constants.js';

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
