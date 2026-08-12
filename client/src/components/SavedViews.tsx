import { useState } from 'react';
import { useSavedViews, type ViewState } from '../lib/useSavedViews';
import { Button, Select } from './ui';
import { Field, Modal, fieldClass } from './Modal';

/**
 * Save/restore named filter presets for a page.
 *
 * The page owns its filter state and hands the current values in; applying a
 * view calls back with a stored record. Adding a filter to a page needs no
 * change here.
 */
export function SavedViews({
  storageKey,
  current,
  onApply,
  hasActiveFilters,
}: {
  storageKey: string;
  current: ViewState;
  onApply: (state: ViewState) => void;
  hasActiveFilters: boolean;
}) {
  const { views, save, remove } = useSavedViews(storageKey);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState('');

  function apply(viewName: string) {
    setSelected(viewName);
    const view = views.find((v) => v.name === viewName);
    if (view) onApply(view.state);
  }

  return (
    <>
      {views.length > 0 && (
        <Select
          value={selected}
          onChange={(e) => apply(e.target.value)}
          aria-label="Apply a saved view"
        >
          <option value="">Saved views…</option>
          {views.map((view) => (
            <option key={view.name} value={view.name}>
              {view.name}
            </option>
          ))}
        </Select>
      )}

      <Button
        onClick={() => {
          setName(selected);
          setNaming(true);
        }}
        disabled={!hasActiveFilters}
        title={hasActiveFilters ? 'Save these filters as a view' : 'Set a filter first'}
      >
        Save view
      </Button>

      <Modal
        open={naming}
        onClose={() => setNaming(false)}
        title="Save view"
        description="Stores the current filters under a name, on this device."
        width="max-w-sm"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save(name, current);
            setSelected(name.trim());
            setNaming(false);
          }}
          className="space-y-3"
        >
          <Field label="View name" hint="Saving over an existing name replaces it.">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoFocus
              required
              className={fieldClass}
              placeholder="e.g. Flagged fire types"
            />
          </Field>

          {views.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-2">Existing views</p>
              <ul className="space-y-1">
                {views.map((view) => (
                  <li
                    key={view.name}
                    className="flex items-center justify-between rounded-md border border-hairline px-2.5 py-1.5"
                  >
                    <span className="text-xs text-ink">{view.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        remove(view.name);
                        if (selected === view.name) setSelected('');
                      }}
                      className="text-xs text-muted hover:text-status-critical"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" onClick={() => setNaming(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!name.trim()}>
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
