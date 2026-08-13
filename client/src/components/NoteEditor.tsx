import { useState } from 'react';
import { api } from '../lib/api';
import { useCurrentUser } from '../lib/useCurrentUser';
import { Button } from './ui';

/** Composer for a new note on a given Pokémon. Calls `onSaved` after a write. */
export function NoteComposer({ pokemonId, onSaved }: { pokemonId: number; onSaved: () => void }) {
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Attribution rides along as a header (see lib/api.ts); this only names it,
  // so nobody writes a note without seeing whose it will be.
  const { user, email } = useCurrentUser();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.post('/api/notes', { pokemonId, body });
      setBody('');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the note');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <label htmlFor="note-body" className="sr-only">
        New note
      </label>
      <textarea
        id="note-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Add a note — observations, follow-ups, training plans…"
        className="w-full resize-y rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-muted focus:border-brand focus:ring-1 focus:ring-brand"
      />
      {error && <p className="text-xs text-status-critical">{error}</p>}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          Writing as <span className="font-medium text-ink">{user?.name ?? email ?? '—'}</span>
        </p>
        <Button type="submit" variant="primary" disabled={saving || !body.trim()}>
          {saving ? 'Saving…' : 'Add note'}
        </Button>
      </div>
    </form>
  );
}

/** Inline edit/delete controls for an existing note. */
export function NoteActions({
  noteId,
  body,
  onChanged,
}: {
  noteId: number;
  body: string;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!draft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/notes/${noteId}`, { body: draft });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the note');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm('Delete this note? This cannot be undone.')) return;
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/api/notes/${noteId}`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the note');
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          aria-label="Edit note"
          className="w-full resize-y rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
        {error && <p className="text-xs text-status-critical">{error}</p>}
        <div className="flex gap-2">
          <Button variant="primary" onClick={save} disabled={busy || !draft.trim()}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
          <Button
            onClick={() => {
              setDraft(body);
              setEditing(false);
              setError(null);
            }}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-xs">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-muted hover:text-brand"
        disabled={busy}
      >
        Edit
      </button>
      <button
        type="button"
        onClick={remove}
        className="text-muted hover:text-status-critical"
        disabled={busy}
      >
        Delete
      </button>
      {error && <span className="text-status-critical">{error}</span>}
    </div>
  );
}
