import { useState } from 'react';
import { Field, Modal, fieldClass } from './Modal';
import { Button, ErrorState, Loading } from './ui';
import { useApi } from '../lib/useApi';
import { api } from '../lib/api';
import { STAT_LABELS, natureAdjustedStat, natureEffectLabel, natureStatLabel } from '../lib/format';
import type { RosterBuild } from '../lib/types';
import { useToast } from './Toast';

/**
 * Sets the build details a trainer chooses for one roster member: its ability
 * and its nature.
 *
 * Sibling to `MovesetEditor` — the moveset is the other half of the same
 * decision, kept separate because choosing four moves from a 130-move pool needs
 * a search field and a list, and these two are a pair of selects.
 *
 * The ability options come from `/api/roster/:id/build`, which returns only what
 * that species may legally have, so the UI cannot offer an illegal one. The
 * server re-checks on write (`PATCH /api/roster/:id`); this is convenience, not
 * the enforcement — same arrangement as the moveset picker.
 *
 * Like `MovesetEditor` and unlike `EditRosterMember`, this **unmounts when
 * closed** and remounts per member, so form state never carries from one entry
 * to the next.
 */
export function BuildEditor({
  open,
  onClose,
  rosterId,
  memberName,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  rosterId: number;
  memberName: string;
  onSaved: () => void;
}) {
  if (!open) return null;

  return (
    <BuildEditorBody
      key={rosterId}
      onClose={onClose}
      rosterId={rosterId}
      memberName={memberName}
      onSaved={onSaved}
    />
  );
}

function BuildEditorBody({
  onClose,
  rosterId,
  memberName,
  onSaved,
}: {
  onClose: () => void;
  rosterId: number;
  memberName: string;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const { data, loading, error, refetch } = useApi<RosterBuild>(`/api/roster/${rosterId}/build`);

  // `undefined` means "not yet touched, use what the server sent"; the empty
  // string is a real choice meaning "clear it". Distinguishing them is what lets
  // the form seed itself from the fetch without a useEffect.
  const [ability, setAbility] = useState<string | undefined>(undefined);
  const [nature, setNature] = useState<string | undefined>(undefined);
  const [item, setItem] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const chosenAbility = ability ?? data?.ability ?? '';
  const chosenNature = nature ?? data?.nature ?? '';
  const chosenItem = item ?? data?.item ?? '';
  const natureRow = data?.natureOptions.find((option) => option.slug === chosenNature) ?? null;

  async function save() {
    setSaving(true);
    try {
      // Two writes: ability and nature are columns on the roster entry, the item
      // is a row in `roster_items`. Sequential rather than parallel so a failure
      // on the first does not leave the second applied.
      await api.patch(`/api/roster/${rosterId}`, {
        ability: chosenAbility || null,
        nature: chosenNature || null,
      });
      await api.put(`/api/roster/${rosterId}/item`, { itemSlug: chosenItem || null });
      toast(`Build saved for ${memberName}`, { tone: 'success' });
      onSaved();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save the build', { tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Build — ${memberName}`}
      description={`The ability, nature and held item ${memberName} carries. None of them change the team analysis, which is measured from equipped moves.`}
      width="max-w-lg"
    >
      {loading ? (
        <Loading rows={3} />
      ) : error || !data ? (
        <ErrorState message={error ?? 'Could not load this member'} onRetry={refetch} />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Ability"
              hint={
                data.abilityOptions.length === 0
                  ? 'No abilities on record for this species'
                  : 'Only what this species can have'
              }
            >
              <select
                className={fieldClass}
                value={chosenAbility}
                onChange={(event) => setAbility(event.target.value)}
                disabled={data.abilityOptions.length === 0}
              >
                <option value="">Not set</option>
                {data.abilityOptions.map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {option.displayName}
                    {option.isHidden ? ' (hidden)' : ''}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Nature" hint="Any of the 25">
              <select
                className={fieldClass}
                value={chosenNature}
                onChange={(event) => setNature(event.target.value)}
              >
                <option value="">Not set</option>
                {data.natureOptions.map((option) => (
                  <option key={option.slug} value={option.slug}>
                    {option.displayName} ·{' '}
                    {natureEffectLabel(option.increasedStat, option.decreasedStat)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* The chosen ability's effect, so the picker is not a list of names
              whose meaning lives on another page. */}
          {chosenAbility && (
            <p className="rounded-md border border-hairline bg-plane px-3 py-2 text-xs leading-relaxed text-muted">
              {data.abilityOptions.find((option) => option.slug === chosenAbility)?.shortEffect ??
                'No effect text imported for this ability.'}
            </p>
          )}

          {/*
            The item picker is a plain select over the whole catalogue, not a
            search: unlike moves there is no per-species rule to narrow it by, so
            every one of the ~400 holdable items is legal for every member. The
            seed already did the only filtering there is.
          */}
          <Field
            label="Held item"
            hint={
              data.itemOptions.length === 0
                ? 'No items imported — run npm run seed:items'
                : 'Any Pokémon can hold any of these'
            }
          >
            <select
              className={fieldClass}
              value={chosenItem}
              onChange={(event) => setItem(event.target.value)}
              disabled={data.itemOptions.length === 0}
            >
              <option value="">Not set</option>
              {data.itemOptions.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.displayName}
                </option>
              ))}
            </select>
          </Field>

          {chosenItem && (
            <p className="rounded-md border border-hairline bg-plane px-3 py-2 text-xs leading-relaxed text-muted">
              {data.itemOptions.find((option) => option.slug === chosenItem)?.shortEffect ??
                'No effect text imported for this item.'}
            </p>
          )}

          <NatureStats baseStats={data.baseStats} nature={natureRow} memberName={memberName} />

          <div className="flex justify-end gap-2 border-t border-hairline pt-4">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save build'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * Base stats with the chosen nature's ±10% applied.
 *
 * ⚠️ **This is the only surface in the app permitted to show a nature-adjusted
 * number**, and it is allowed only because the subject is a single named member
 * with a recorded nature. The figure is an adjusted *base* stat: a real in-game
 * stat also depends on IVs, EVs and level, which this app does not record. The
 * subtitle says so, and must keep saying so. See CLAUDE.md § Natures.
 */
function NatureStats({
  baseStats,
  nature,
  memberName,
}: {
  baseStats: RosterBuild['baseStats'];
  nature: RosterBuild['natureOptions'][number] | null;
  memberName: string;
}) {
  if (!nature) return null;

  const neutral = !nature.increasedStat || !nature.decreasedStat;
  const stats = Object.entries(STAT_LABELS) as [keyof typeof STAT_LABELS, string][];

  return (
    <div className="rounded-md border border-hairline px-3 py-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
        Base stats, nature-adjusted
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        {neutral ? (
          <>
            <span className="text-ink">{nature.displayName}</span> is neutral — it raises and lowers
            the same stat, so it changes nothing.
          </>
        ) : (
          <>
            <span className="text-ink">{nature.displayName}</span> applies +10%{' '}
            {natureStatLabel(nature.increasedStat)} and −10%{' '}
            {natureStatLabel(nature.decreasedStat)} to {memberName}'s base stats. This is not an
            in-game battle stat — the real value also depends on IVs, EVs and level, which this app
            does not record.
          </>
        )}
      </p>

      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="pb-1 text-left font-medium">
              Stat
            </th>
            <th scope="col" className="pb-1 text-right font-medium">
              Base
            </th>
            {/* A neutral nature omits this column entirely. A column of
                identical numbers is a claim that something was computed. */}
            {!neutral && (
              <th scope="col" className="pb-1 text-right font-medium">
                Adjusted
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {stats.map(([key, label]) => {
            const base = baseStats[key];
            const adjusted = natureAdjustedStat(
              base,
              key,
              nature.increasedStat,
              nature.decreasedStat,
            );
            const delta = adjusted > base ? '+10%' : adjusted < base ? '−10%' : null;

            return (
              <tr key={key} className="border-t border-hairline/60">
                <td className="py-1 text-muted">
                  {label}
                  {delta && (
                    <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide text-brand">
                      {delta}
                    </span>
                  )}
                </td>
                <td className="py-1 text-right tabular-nums text-ink">{base}</td>
                {!neutral && (
                  <td className="py-1 text-right tabular-nums text-ink">{adjusted}</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
