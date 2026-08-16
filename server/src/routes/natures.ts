import { Router } from 'express';
import { asc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { natures } from '../db/schema.js';
import { asyncHandler } from '../http.js';

/**
 * The 25 natures — read-only reference data, written only by the seed.
 *
 * Unpaginated, like `/api/users`: it backs a picker, and 25 rows is the whole
 * set forever.
 *
 * **Deliberately returns no adjusted stat numbers**, only which stat each nature
 * raises and lowers. Applying the ±10% is a display-edge concern on one named
 * roster member; the moment a route returns an adjusted figure, something
 * downstream will average it across a roster where most members have no nature
 * at all. See CLAUDE.md § Natures.
 */
export const naturesRouter = Router();

naturesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select()
      .from(natures)
      // Neutral natures last: they are a real choice but the least interesting
      // one, and sorting by name would scatter them through the list.
      .orderBy(asc(natures.increasedStat), asc(natures.displayName));

    res.json({ natures: rows });
  }),
);
