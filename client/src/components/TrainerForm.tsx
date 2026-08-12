import { useState } from 'react';
import { api } from '../lib/api';
import { POKEMON_TYPE_NAMES } from '../lib/format';
import type { Trainer } from '../lib/types';
import { Field, Modal, fieldClass } from './Modal';
import { Button } from './ui';

/**
 * Create/edit form for a trainer. `trainer` absent means create.
 * `onSaved` receives the saved record so the caller can select it.
 */
export function TrainerForm({
  open,
  trainer,
  onClose,
  onSaved,
}: {
  open: boolean;
  trainer?: Trainer;
  onClose: () => void;
  onSaved: (saved: Trainer) => void;
}) {
  const editing = Boolean(trainer);
  const [name, setName] = useState(trainer?.name ?? '');
  const [region, setRegion] = useState(trainer?.region ?? '');
  const [specialty, setSpecialty] = useState(trainer?.specialty ?? '');
  const [email, setEmail] = useState(trainer?.email ?? '');
  const [bio, setBio] = useState(trainer?.bio ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const body = { name, region, specialty, email, bio };
    try {
      const saved = editing
        ? await api.patch<Trainer>(`/api/trainers/${trainer!.id}`, body)
        : await api.post<Trainer>('/api/trainers', body);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the trainer');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${trainer!.name}` : 'New trainer'}
      description={
        editing ? 'Update this trainer’s details.' : 'Create a trainer to build a roster against.'
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            autoFocus
            className={fieldClass}
            placeholder="e.g. Ash Ketchum"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Region">
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              maxLength={80}
              className={fieldClass}
              placeholder="e.g. Kanto"
            />
          </Field>

          <Field label="Specialty" hint="The type they're known for.">
            <select
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              className={fieldClass}
            >
              <option value="">— None —</option>
              {POKEMON_TYPE_NAMES.map((type) => (
                <option key={type} value={type}>
                  {type[0]!.toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClass}
            placeholder="name@example.com"
          />
        </Field>

        <Field label="Bio">
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            maxLength={1000}
            className={`${fieldClass} resize-y`}
            placeholder="How they approach their roster…"
          />
        </Field>

        {error && <p className="text-xs text-status-critical">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create trainer'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
