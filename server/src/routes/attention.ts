import { Router } from 'express';
import { z } from 'zod';
import { getAttentionQueue, getRosterAlerts } from '../attention.js';
import { ATTENTION } from '../constants.js';
import { asyncHandler } from '../http.js';
import { scopeSchema, trainerScopeSql } from '../owner.js';

export const attentionRouter = Router();

/**
 * GET /api/attention — the needs-attention queue.
 *
 * Omit `trainerId` for the workspace-wide view (Home); pass it for one
 * trainer's caseload (Trainers dashboard). Same scorer either way.
 */
attentionRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = z
      .object({
        trainerId: z.coerce.number().int().min(1).optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
        scope: scopeSchema,
      })
      .parse(req.query);

    // Both queries alias the trainers table as `t`.
    const scope = trainerScopeSql(req, query.scope, 't');

    const [{ items, scanned }, allAlerts] = await Promise.all([
      getAttentionQueue({ ...query, scope }),
      getRosterAlerts(query.trainerId, scope),
    ]);

    /*
     * Scoped to one trainer, every alert is actionable and they all ship —
     * Brock genuinely has six unanswered weaknesses and hiding three would
     * misrepresent the roster.
     *
     * Workspace-wide it is a summary of ten rosters, where the same honesty
     * produces ~38 rows above a member queue capped at 8. So that view caps,
     * and reports the total alongside — never a bare limit (see CLAUDE.md
     * § API conventions).
     */
    const alertLimit = query.trainerId === undefined ? (query.limit ?? 8) : allAlerts.length;
    const alerts = allAlerts.slice(0, alertLimit);

    res.json({
      data: items,
      scanned,
      flagged: items.length,
      /*
       * Roster-level problems, alongside the member queue rather than inside
       * it — see getRosterAlerts for why they are not one list.
       */
      alerts,
      alertsTotal: allAlerts.length,
      /*
       * The model is surfaced so the UI can explain itself. Every number here
       * is now a threshold over recorded facts; the old expPerDay simulation
       * constant is gone along with the signal that needed it.
       */
      model: {
        staleAfterDays: ATTENTION.staleAfterDays,
        fullRosterSize: ATTENTION.fullRosterSize,
        sharedWeaknessMembers: ATTENTION.sharedWeaknessMembers,
      },
    });
  }),
);
