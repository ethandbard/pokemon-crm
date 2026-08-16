import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { RosterMember, RosterStatus } from '../lib/types';
import { ROSTER_STATUS_META, dexNumber } from '../lib/format';
import { EvolutionProgress } from './EvolutionProgress';
import { useToast } from './Toast';

const COLUMNS: RosterStatus[] = ['starter', 'active', 'reserve', 'retired'];

/**
 * Drag-and-drop board for roster status.
 *
 * Uses the native HTML5 drag events rather than a DnD library — there are four
 * fixed drop targets and no reordering within a column, which is the case
 * native DnD handles well.
 *
 * Dropping PATCHes the entry's status and optimistically moves the card, so it
 * lands in the new column immediately; a failure rolls it back and toasts.
 */
export function RosterBoard({
  roster,
  onChanged,
  onEditMoveset,
  onEditBuild,
}: {
  roster: RosterMember[];
  onChanged: () => void;
  /** Opens the moveset editor. The board is a full peer of the table view. */
  onEditMoveset: (member: RosterMember) => void;
  /** Opens the build editor, for the same reason. */
  onEditBuild: (member: RosterMember) => void;
}) {
  const { toast } = useToast();
  const [dragging, setDragging] = useState<number | null>(null);
  const [hovered, setHovered] = useState<RosterStatus | null>(null);
  /** Pending status overrides, applied over the server's until refetch. */
  const [optimistic, setOptimistic] = useState<Record<number, RosterStatus>>({});

  function statusOf(member: RosterMember): RosterStatus {
    return optimistic[member.id] ?? member.status;
  }

  async function move(member: RosterMember, status: RosterStatus) {
    const previous = statusOf(member);
    if (previous === status) return;

    setOptimistic((current) => ({ ...current, [member.id]: status }));
    const label = member.nickname ?? member.displayName;

    try {
      await api.patch(`/api/roster/${member.id}`, { status });
      toast(`${label} → ${ROSTER_STATUS_META[status].label}`, {
        tone: 'success',
        action: {
          label: 'Undo',
          onAct: async () => {
            setOptimistic((current) => ({ ...current, [member.id]: previous }));
            await api.patch(`/api/roster/${member.id}`, { status: previous });
            onChanged();
          },
        },
      });
      onChanged();
    } catch (err) {
      setOptimistic((current) => {
        const next = { ...current };
        delete next[member.id];
        return next;
      });
      toast(err instanceof Error ? err.message : 'Could not move that entry', { tone: 'error' });
    }
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map((status) => {
        const meta = ROSTER_STATUS_META[status];
        const members = roster.filter((m) => statusOf(m) === status);

        return (
          <div
            key={status}
            onDragOver={(event) => {
              // Preventing default is what marks this a valid drop target.
              event.preventDefault();
              setHovered(status);
            }}
            onDragLeave={() => setHovered((current) => (current === status ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              setHovered(null);
              const member = roster.find((m) => m.id === dragging);
              if (member) void move(member, status);
              setDragging(null);
            }}
            className={`rounded-xl border p-2.5 transition-colors ${
              hovered === status ? 'border-brand bg-brand/5' : 'border-hairline bg-plane/40'
            }`}
          >
            <div className="mb-2 flex items-baseline justify-between px-1">
              <h3 className="text-xs font-semibold text-ink">{meta.label}</h3>
              <span className="text-xs tabular-nums text-muted">{members.length}</span>
            </div>
            <p className="mb-2 px-1 text-[11px] text-muted">{meta.hint}</p>

            <ul className="space-y-2">
              {members.map((member) => (
                <li
                  key={member.id}
                  draggable
                  onDragStart={() => setDragging(member.id)}
                  onDragEnd={() => {
                    setDragging(null);
                    setHovered(null);
                  }}
                  className={`cursor-grab rounded-lg border border-hairline bg-surface p-2.5 active:cursor-grabbing ${
                    dragging === member.id ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {member.spriteUrl && (
                      <img
                        src={member.spriteUrl}
                        alt=""
                        width={28}
                        height={28}
                        loading="lazy"
                        className="h-7 w-7 shrink-0"
                        // Otherwise the browser drags the image, not the card.
                        draggable={false}
                      />
                    )}
                    <Link
                      to={`/pokemon/${member.pokemonId}`}
                      className="min-w-0 flex-1 text-xs font-medium text-ink hover:text-brand"
                    >
                      <span className="block truncate">{member.nickname ?? member.displayName}</span>
                      <span className="block text-[11px] font-normal text-muted">
                        {dexNumber(member.pokemonId)}
                        {member.level !== null && ` · Lv ${member.level}`}
                      </span>
                    </Link>
                  </div>

                  <div className="mt-1.5">
                    <EvolutionProgress
                      stage={member.evolutionStage}
                      chainLength={member.chainLength}
                      eligible={member.milestoneEligible}
                    />
                  </div>

                  {/* The board is the other half of the roster surface, so it
                      carries the same moveset state and the same way in — a
                      member with no moves is invisible here otherwise. */}
                  <button
                    type="button"
                    onClick={() => onEditMoveset(member)}
                    draggable={false}
                    aria-label={`Edit moveset for ${member.nickname ?? member.displayName}`}
                    className="mt-2 flex w-full items-center justify-between rounded-md border border-hairline px-1.5 py-1 text-[11px] hover:border-brand hover:text-brand"
                  >
                    <span className={member.movesetSize === 0 ? 'text-status-critical' : 'text-muted'}>
                      {member.movesetSize === 0 ? 'No moves set' : `${member.movesetSize}/4 moves`}
                    </span>
                    <span className="text-muted">Edit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onEditBuild(member)}
                    draggable={false}
                    aria-label={`Edit build for ${member.nickname ?? member.displayName}`}
                    className="mt-1 flex w-full items-center justify-between rounded-md border border-hairline px-1.5 py-1 text-[11px] hover:border-brand hover:text-brand"
                  >
                    {/* Not critical when unset, unlike the moveset above: no
                        team figure depends on an ability or a nature. */}
                    <span className="truncate text-muted">
                      {member.abilityName ?? 'No ability'}
                    </span>
                    <span className="shrink-0 text-muted">Edit</span>
                  </button>
                </li>
              ))}

              {members.length === 0 && (
                <li className="rounded-lg border border-dashed border-hairline px-2 py-4 text-center text-[11px] text-muted">
                  Drop here
                </li>
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
