import { Router } from 'express';
import { z } from 'zod';
import { getAttentionQueue } from '../attention.js';
import { ATTENTION } from '../constants.js';
import { asyncHandler } from '../http.js';

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
      })
      .parse(req.query);

    const { items, scanned } = await getAttentionQueue(query);

    res.json({
      data: items,
      scanned,
      flagged: items.length,
      /*
       * The model is surfaced so the UI can explain itself — expPerDay in
       * particular is a simulation assumption, not a measurement, and users
       * should be able to see that rather than trust a bare number.
       */
      model: {
        staleAfterDays: ATTENTION.staleAfterDays,
        behindPaceTolerance: ATTENTION.behindPaceTolerance,
        expPerDay: ATTENTION.expPerDay,
      },
    });
  }),
);
