import { useCallback, useEffect, useState } from 'react';

/**
 * Named filter presets, persisted in localStorage.
 *
 * Views are stored per page under `storageKey`, and hold whatever plain
 * record of filter values the page passes in — the hook doesn't know or care
 * what the fields mean, so a page can add a filter without touching this.
 *
 * localStorage rather than the database: these are personal UI preferences,
 * and there's no auth yet to attach them to. Moving them server-side later is
 * a swap of the two functions below.
 */
export type ViewState = Record<string, string | number | undefined>;

export interface SavedView {
  name: string;
  state: ViewState;
}

const PREFIX = 'pokemon-crm:views:';

function read(storageKey: string): SavedView[] {
  try {
    const raw = window.localStorage.getItem(PREFIX + storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SavedView[]) : [];
  } catch {
    // Corrupt or unavailable storage shouldn't take the page down.
    return [];
  }
}

function write(storageKey: string, views: SavedView[]) {
  try {
    window.localStorage.setItem(PREFIX + storageKey, JSON.stringify(views));
  } catch {
    // Quota or private-mode failure — saving is best-effort.
  }
}

export function useSavedViews(storageKey: string) {
  const [views, setViews] = useState<SavedView[]>(() => read(storageKey));

  useEffect(() => setViews(read(storageKey)), [storageKey]);

  const save = useCallback(
    (name: string, state: ViewState) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setViews((current) => {
        // Saving under an existing name overwrites it — that's the expected
        // "update this view" behaviour, rather than silently duplicating.
        const next = [...current.filter((v) => v.name !== trimmed), { name: trimmed, state }].sort(
          (a, b) => a.name.localeCompare(b.name),
        );
        write(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const remove = useCallback(
    (name: string) => {
      setViews((current) => {
        const next = current.filter((v) => v.name !== name);
        write(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  return { views, save, remove };
}
