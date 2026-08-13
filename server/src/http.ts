import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

/** Thrown by route handlers for expected, client-facing failures. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFound = (message: string) => new HttpError(404, message);
export const badRequest = (message: string) => new HttpError(400, message);

/**
 * Wraps an async handler so rejected promises reach the error middleware
 * instead of becoming unhandled rejections.
 */
export function asyncHandler<T extends Request>(
  handler: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: T, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** 1-indexed row numbers of this page — what "showing 26–50 of 312" reads. */
  from: number;
  to: number;
}

/**
 * Builds the pagination envelope every list endpoint returns.
 *
 * Centralised because each route had its own copy and they had already drifted:
 * `from`/`to` existed nowhere, so no list surface could say which slice it was
 * showing. `totalPages` is at least 1 even for an empty result, so "Page 1 of 0"
 * never renders.
 */
export function paginationFor(page: number, pageSize: number, total: number): Pagination {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const offset = (page - 1) * pageSize;
  // A page past the end returns no rows, so it reports 0–0 rather than a
  // backwards range like "4–1 of 1".
  const empty = total === 0 || offset >= total;

  return {
    page,
    pageSize,
    total,
    totalPages,
    from: empty ? 0 : offset + 1,
    // Clamped to `total`, so the last page reads "showing 301–312", not "–325".
    to: empty ? 0 : Math.min(page * pageSize, total),
  };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Invalid request',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  console.error('[api] unhandled error', err);
  res.status(500).json({ error: 'Internal server error' });
}
