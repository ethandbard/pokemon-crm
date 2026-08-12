import { useMemo, useState } from 'react';
import { api, toQueryString } from '../lib/api';
import { useApi, useDebounced } from '../lib/useApi';
import type { PokemonListResponse, RosterMember, RosterStatus, TrainerListItem } from '../lib/types';
import { ROSTER_STATUS_META, dexNumber } from '../lib/format';
import { Field, Modal, fieldClass } from './Modal';
import { Button, EmptyState, Loading, TypeBadge } from './ui';

const STATUSES: RosterStatus[] = ['starter', 'active', 'reserve', 'retired'];

/** Adds a Pokémon to a trainer's roster, choosing it from a live search. */
export function AddRosterMember({
  open,
  trainerId,
  trainerName,
  existingIds,
  onClose,
  onSaved,
}: {
  open: boolean;
  trainerId: number;
  trainerName: string;
  existingIds: number[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<{ id: number; displayName: string } | null>(null);
  const [nickname, setNickname] = useState('');
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState<RosterStatus>('active');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedSearch = useDebounced(search);
  const path = useMemo(
    () => `/api/pokemon${toQueryString({ search: debouncedSearch, pageSize: 6 })}`,
    [debouncedSearch],
  );
  const results = useApi<PokemonListResponse>(path);

  function reset() {
    setSearch('');
    setPicked(null);
    setNickname('');
    setLevel('');
    setStatus('active');
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!picked) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/api/trainers/${trainerId}/roster`, {
        pokemonId: picked.id,
        nickname,
        level: level ? Number(level) : null,
        status,
      });
      reset();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add to the roster');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Add to roster"
      description={`Choose a Pokémon to add to ${trainerName}'s roster.`}
    >
      <form onSubmit={submit} className="space-y-3">
        <Field label="Pokémon">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPicked(null);
            }}
            placeholder="Search by name…"
            autoFocus
            className={fieldClass}
          />
        </Field>

        <div className="max-h-56 overflow-y-auto rounded-md border border-hairline">
          {results.loading && !results.data ? (
            <div className="p-3">
              <Loading rows={3} label="Searching…" />
            </div>
          ) : !results.data || results.data.data.length === 0 ? (
            <EmptyState title="No matches" description="Try a different name." />
          ) : (
            <ul>
              {results.data.data.map((row) => {
                const already = existingIds.includes(row.id);
                const selected = picked?.id === row.id;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      disabled={already}
                      onClick={() => setPicked({ id: row.id, displayName: row.displayName })}
                      className={`flex w-full items-center gap-2 border-b border-hairline/70 px-3 py-2 text-left last:border-0 disabled:cursor-not-allowed disabled:opacity-45 ${
                        selected ? 'bg-brand/10' : 'hover:bg-plane'
                      }`}
                    >
                      <span className="w-12 text-right text-xs tabular-nums text-muted">
                        {dexNumber(row.id)}
                      </span>
                      {row.spriteUrl && (
                        <img src={row.spriteUrl} alt="" width={28} height={28} className="h-7 w-7" />
                      )}
                      <span className="flex-1 text-sm font-medium text-ink">{row.displayName}</span>
                      <TypeBadge type={row.type1} />
                      {already && <span className="text-[11px] text-muted">on roster</span>}
                      {selected && <span className="text-xs font-medium text-brand">✓</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Nickname">
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={60}
              className={fieldClass}
              placeholder="Optional"
            />
          </Field>
          <Field label="Level">
            <input
              type="number"
              min={1}
              max={100}
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className={fieldClass}
              placeholder="1–100"
            />
          </Field>
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as RosterStatus)}
              className={fieldClass}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ROSTER_STATUS_META[s].label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {error && <p className="text-xs text-status-critical">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving || !picked}>
            {saving ? 'Adding…' : picked ? `Add ${picked.displayName}` : 'Choose a Pokémon'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Edits one roster entry: nickname, level, status, or which trainer owns it. */
export function EditRosterMember({
  member,
  trainers,
  currentTrainerId,
  onClose,
  onSaved,
}: {
  member: RosterMember | null;
  trainers: TrainerListItem[];
  currentTrainerId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nickname, setNickname] = useState(member?.nickname ?? '');
  const [level, setLevel] = useState(member?.level ? String(member.level) : '');
  const [status, setStatus] = useState<RosterStatus>(member?.status ?? 'active');
  const [trainerId, setTrainerId] = useState(String(currentTrainerId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!member) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/roster/${member!.id}`, {
        nickname,
        level: level ? Number(level) : null,
        status,
        trainerId: Number(trainerId),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the roster entry');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${member.nickname ?? member.displayName}`}
      description={`${member.displayName} · ${dexNumber(member.pokemonId)}`}
    >
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Nickname">
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={60}
              className={fieldClass}
              placeholder="Optional"
            />
          </Field>
          <Field label="Level">
            <input
              type="number"
              min={1}
              max={100}
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as RosterStatus)}
              className={fieldClass}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {ROSTER_STATUS_META[s].label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="Trainer"
          hint="Moving this entry transfers it to another trainer's roster."
        >
          <select
            value={trainerId}
            onChange={(e) => setTrainerId(e.target.value)}
            className={fieldClass}
          >
            {trainers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>

        {error && <p className="text-xs text-status-critical">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
