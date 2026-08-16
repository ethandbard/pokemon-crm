/**
 * The shared PokéAPI client bits, used by every seed script.
 *
 * These live here rather than in `seed.ts` because that module runs its `main()`
 * on import — importing it to borrow a helper would kick off a full dex import
 * as a side effect.
 *
 * See the header of `seed.ts` for the fair-use commitments these uphold:
 * capped concurrency and backoff on failure.
 */

export const POKEAPI = 'https://pokeapi.co/api/v2';

export interface NamedRef {
  name: string;
  url: string;
}

export async function fetchJson<T>(url: string, attempt = 1): Promise<T> {
  const maxAttempts = 4;
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } catch (err) {
    if (attempt >= maxAttempts) throw new Error(`GET ${url} failed after ${maxAttempts} attempts: ${String(err)}`);
    // Exponential backoff — PokeAPI rate-limits bursts.
    await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** (attempt - 1)));
    return fetchJson<T>(url, attempt + 1);
  }
}

/** Runs `worker` over `items` with at most `limit` in flight at once. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runner() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runner));
  return results;
}
