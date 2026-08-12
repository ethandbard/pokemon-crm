import { useState } from 'react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import type { ActivityKind, TrainerListItem } from '../lib/types';
import { ACTIVITY_META } from '../lib/format';
import { Button } from './ui';
import { Field, Modal, fieldClass } from './Modal';
import { useToast } from './Toast';

const KINDS = Object.keys(ACTIVITY_META) as ActivityKind[];

/**
 * Actions for a multi-row selection on the Lookup table.
 *
 * Each action posts a single bulk request rather than looping — see the note on
 * `/api/activity/bulk` for why flags take an explicit target state instead of
 * toggling per row.
 */
export function BulkActionBar({
  selectedIds,
  onClear,
  onDone,
}: {
  selectedIds: number[];
  onClear: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  const [trainerId, setTrainerId] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Only fetched once the roster dialog is actually opened.
  const trainers = useApi<{ data: TrainerListItem[] }>(rosterOpen ? '/api/trainers' : null);

  const count = selectedIds.length;
  if (count === 0) return null;

  async function run(work: () => Promise<string>) {
    setBusy(true);
    setError(null);
    try {
      const message = await work();
      toast(message, { tone: 'success' });
      onDone();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bulk action failed';
      setError(message);
      toast(message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function setFlag(kind: ActivityKind, active: boolean) {
    await run(async () => {
      await api.post('/api/activity/bulk', { pokemonIds: selectedIds, kind, active });
      return `${active ? 'Set' : 'Cleared'} “${ACTIVITY_META[kind].label}” on ${count} Pokémon`;
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-hairline bg-brand/5 px-5 py-2.5">
      <span className="text-sm font-medium text-ink">
        {count} selected
      </span>

      <select
        aria-label="Set a status flag on the selection"
        disabled={busy}
        value=""
        onChange={(e) => {
          const [kind, state] = e.target.value.split(':');
          if (kind) void setFlag(kind as ActivityKind, state === 'on');
          e.target.value = '';
        }}
        className="rounded-md border border-hairline bg-surface px-2.5 py-1 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-50"
      >
        <option value="">Set status…</option>
        {KINDS.map((kind) => (
          <option key={`${kind}-on`} value={`${kind}:on`}>
            Set {ACTIVITY_META[kind].label}
          </option>
        ))}
        {KINDS.map((kind) => (
          <option key={`${kind}-off`} value={`${kind}:off`}>
            Clear {ACTIVITY_META[kind].label}
          </option>
        ))}
      </select>

      <Button onClick={() => setNoteOpen(true)} disabled={busy}>
        Add note to all
      </Button>
      <Button onClick={() => setRosterOpen(true)} disabled={busy}>
        Add to roster
      </Button>

      <Button onClick={onClear} disabled={busy} className="ml-auto">
        Clear selection
      </Button>

      {error && <span className="w-full text-xs text-status-critical">{error}</span>}

      {/* ---- Same note against every selected Pokémon ---- */}
      <Modal
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        title={`Add a note to ${count} Pokémon`}
        description="Writes the same note against each one."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await api.post('/api/notes/bulk', { pokemonIds: selectedIds, body: noteBody });
              setNoteOpen(false);
              setNoteBody('');
              return `Added a note to ${count} Pokémon`;
            });
          }}
          className="space-y-3"
        >
          <Field label="Note">
            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              rows={4}
              autoFocus
              required
              className={`${fieldClass} resize-y`}
              placeholder="e.g. Reviewed as part of the Q3 sweep."
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setNoteOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy || !noteBody.trim()}>
              {busy ? 'Saving…' : `Add to ${count}`}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ---- Add the selection to a trainer's roster ---- */}
      <Modal
        open={rosterOpen}
        onClose={() => setRosterOpen(false)}
        title={`Add ${count} Pokémon to a roster`}
        description="Any already on that roster are skipped."
        width="max-w-sm"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const result = await api.post<{
                added: number;
                skippedAlreadyOnRoster: number;
              }>(`/api/trainers/${trainerId}/roster/bulk`, { pokemonIds: selectedIds });
              setRosterOpen(false);
              return result.skippedAlreadyOnRoster > 0
                ? `Added ${result.added}, skipped ${result.skippedAlreadyOnRoster} already on that roster`
                : `Added ${result.added} to the roster`;
            });
          }}
          className="space-y-3"
        >
          <Field label="Trainer">
            <select
              value={trainerId}
              onChange={(e) => setTrainerId(e.target.value)}
              required
              className={fieldClass}
            >
              <option value="">— Choose a trainer —</option>
              {trainers.data?.data.map((trainer) => (
                <option key={trainer.id} value={trainer.id}>
                  {trainer.name} ({trainer.rosterSize} on roster)
                </option>
              ))}
            </select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setRosterOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy || !trainerId}>
              {busy ? 'Adding…' : `Add ${count}`}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
