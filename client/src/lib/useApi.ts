import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Re-runs the request; use after a mutation. */
  refetch: () => void;
}

/**
 * Fetches `path` whenever it changes. Stale responses are discarded, so fast
 * typing in a search box can't leave an earlier result on screen.
 *
 * Pass `null` (or an empty string) to skip fetching entirely — `data` resets to
 * null and `loading` is false. Callers that only search on demand should use
 * this rather than pointing at a placeholder endpoint, or `data` will briefly
 * hold the wrong shape.
 */
export function useApi<T>(path: string | null): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    if (!path) {
      // Bump the request id so any in-flight response is discarded.
      requestId.current += 1;
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    api
      .get<T>(path)
      .then((result) => {
        if (id !== requestId.current) return;
        setData(result);
      })
      .catch((err: unknown) => {
        if (id !== requestId.current) return;
        setError(err instanceof Error ? err.message : 'Request failed');
        setData(null);
      })
      .finally(() => {
        if (id !== requestId.current) return;
        setLoading(false);
      });
  }, [path, nonce]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  return { data, loading, error, refetch };
}

/** Debounces a rapidly-changing value — used for the search inputs. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
