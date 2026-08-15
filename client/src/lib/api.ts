/**
 * Thin fetch wrapper. Paths are relative, so Vite's dev proxy (and a reverse
 * proxy in production) routes `/api/*` to the Express server.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Who the app is currently acting as, sent on every request as `X-Acting-User`
 * and used by the server to attribute notes and status flags.
 *
 * Module-level rather than threaded through each call site: attribution applies
 * to every write, and a header the fetch wrapper always sets cannot be
 * forgotten at a new one. `CurrentUserProvider` is the only thing that sets it.
 * **This is not authentication** — nothing verifies the value.
 */
let actingUser: string | null = null;

export function setActingUser(email: string | null) {
  actingUser = email;
}

export const ACTING_USER_HEADER = 'X-Acting-User';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(actingUser ? { [ACTING_USER_HEADER]: actingUser } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const payload = (await res.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // Non-JSON error body — fall back to the status line.
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Drops empty/undefined values so they don't become `?type=` in the URL. */
export function toQueryString(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  /** Whole-resource replacement — the moveset endpoint is the only user today. */
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
