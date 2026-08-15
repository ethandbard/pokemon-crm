import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { Button, DamageClassBadge, Loading, TextInput, TypeBadge } from './ui';
import { useApi, useDebounced } from '../lib/useApi';
import { api, toQueryString } from '../lib/api';
import { movePower, moveStat } from '../lib/format';
import type { MoveListItem, MovesResponse, MovesetSlot } from '../lib/types';
import { useToast } from './Toast';

/** The games' limit, and the number every coverage figure downstream assumes. */
const MAX_SLOTS = 4;

/**
 * Sets the four moves a roster member carries.
 *
 * The picker searches `/api/moves?pokemonId=…`, which already restricts results
 * to that species' learnable movepool — so the UI cannot offer an illegal move
 * in the first place. The server re-checks anyway (see
 * `PUT /api/roster/:id/moves`); this is convenience, not the enforcement.
 *
 * Unlike `EditRosterMember`, this component **unmounts when closed** rather
 * than living permanently with `useState` initialised from props. That editor's
 * form state does not reset between members opened in sequence; keying this one
 * on the entry and returning null when closed avoids inheriting the bug.
 */
export function MovesetEditor({
  open,
  onClose,
  rosterId,
  pokemonId,
  memberName,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  rosterId: number;
  pokemonId: number;
  memberName: string;
  onSaved: () => void;
}) {
  if (!open) return null;

  return (
    <MovesetEditorBody
      // Remount on a different member so no state carries across.
      key={rosterId}
      onClose={onClose}
      rosterId={rosterId}
      pokemonId={pokemonId}
      memberName={memberName}
      onSaved={onSaved}
    />
  );
}

function MovesetEditorBody({
  onClose,
  rosterId,
  pokemonId,
  memberName,
  onSaved,
}: {
  onClose: () => void;
  rosterId: number;
  pokemonId: number;
  memberName: string;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const [selected, setSelected] = useState<MovesetSlot[]>([]);
  const [saving, setSaving] = useState(false);

  const current = useApi<{ moveset: MovesetSlot[] }>(`/api/roster/${rosterId}/moves`);

  // Seed the working copy once the saved moveset arrives. Editing happens
  // locally and is committed in one PUT, so a half-built set is never sent.
  useEffect(() => {
    if (current.data) setSelected(current.data.moveset);
  }, [current.data]);

  const results = useApi<MovesResponse>(
    `/api/moves${toQueryString({ pokemonId, search: debounced, pageSize: 8, sort: 'name', direction: 'asc' })}`,
  );

  const chosenIds = new Set(selected.map((move) => move.moveId));
  const full = selected.length >= MAX_SLOTS;

  function add(move: MoveListItem) {
    if (full || chosenIds.has(move.id)) return;
    setSelected((slots) => [
      ...slots,
      {
        slot: slots.length + 1,
        moveId: move.id,
        name: move.name,
        displayName: move.displayName,
        type: move.type,
        damageClass: move.damageClass,
        power: move.power,
        accuracy: move.accuracy,
        pp: move.pp,
      },
    ]);
  }

  function remove(moveId: number) {
    // Renumber so slots stay 1..n with no hole — the server assigns slots from
    // array order, and a gap would silently close on save anyway.
    setSelected((slots) =>
      slots.filter((slot) => slot.moveId !== moveId).map((slot, index) => ({ ...slot, slot: index + 1 })),
    );
  }

  async function save() {
    setSaving(true);
    try {
      await api.put(`/api/roster/${rosterId}/moves`, { moveIds: selected.map((slot) => slot.moveId) });
      toast(
        selected.length === 0 ? `Moveset cleared for ${memberName}` : `Moveset saved for ${memberName}`,
        { tone: 'success' },
      );
      onSaved();
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save the moveset', { tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Moveset — ${memberName}`}
      description={`Up to four moves, chosen from what ${memberName} can learn. Coverage is measured from these, not the full movepool.`}
      width="max-w-2xl"
    >
      <div className="space-y-5">
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
            Selected · {selected.length} of {MAX_SLOTS}
          </h3>

          {current.loading ? (
            <Loading rows={2} />
          ) : selected.length === 0 ? (
            <p className="rounded-md border border-dashed border-hairline px-3 py-4 text-sm text-muted">
              No moves set. This member contributes nothing to the team's attacking coverage.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {selected.map((slot) => (
                <li
                  key={slot.moveId}
                  className="flex items-center gap-2 rounded-md border border-hairline px-2.5 py-1.5"
                >
                  <span className="w-5 shrink-0 text-xs tabular-nums text-muted">{slot.slot}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{slot.displayName}</span>
                  <TypeBadge type={slot.type} />
                  <DamageClassBadge damageClass={slot.damageClass} />
                  <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted">
                    {movePower(slot.power)}
                  </span>
                  <Button onClick={() => remove(slot.moveId)} aria-label={`Remove ${slot.displayName}`}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Add a move</h3>
          <TextInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${memberName}'s movepool…`}
            aria-label="Search this Pokémon's movepool"
            className="w-full"
          />

          {full && (
            <p className="mt-2 text-xs text-muted">
              All four slots are full — remove one to add another.
            </p>
          )}

          <div className="mt-2 max-h-56 overflow-y-auto">
            {results.loading ? (
              <Loading rows={3} />
            ) : !results.data || results.data.data.length === 0 ? (
              <p className="px-1 py-3 text-sm text-muted">No moves match that search.</p>
            ) : (
              <ul className="space-y-1">
                {results.data.data.map((move) => {
                  const chosen = chosenIds.has(move.id);
                  return (
                    <li key={move.id}>
                      <button
                        type="button"
                        onClick={() => add(move)}
                        disabled={chosen || full}
                        // The row is badges and numbers, which give a screen
                        // reader nothing to announce without this.
                        aria-label={`Add ${move.displayName}`}
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-plane disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">
                          {move.displayName}
                        </span>
                        <TypeBadge type={move.type} />
                        <DamageClassBadge damageClass={move.damageClass} />
                        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted">
                          {movePower(move.power)}
                        </span>
                        <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted">
                          {moveStat(move.accuracy)}
                        </span>
                        {chosen && <span className="shrink-0 text-xs text-muted">added</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-hairline pt-4">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save moveset'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
