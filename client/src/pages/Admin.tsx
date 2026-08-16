import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, toQueryString } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useCurrentUser } from '../lib/useCurrentUser';
import type { AdminOverview, TrainerListItem, User, UsersResponse } from '../lib/types';
import { Button, Card, EmptyState, ErrorState, Loading, StatTile, TextInput } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { Modal, Field, fieldClass } from '../components/Modal';
import { useToast } from '../components/Toast';
import { PAGE_CONTAINER } from '../lib/page';

/**
 * Workspace administration.
 *
 * **Ungated on purpose.** There is no auth, and `users.role` is display-only
 * (CLAUDE.md § users), so an "admins only" check would be a fiction resting on
 * a header the client sets. The page says as much rather than implying a
 * permission system that does not exist.
 *
 * Nothing here grants power that was not already available — anyone can switch
 * users and inherit their trainers. What it adds is doing so deliberately, and
 * repairing attribution that the deliberate absence of foreign keys on `owner`
 * allows to drift.
 */
export function AdminPage() {
  const { toast } = useToast();
  const { refresh: refreshUsers, email: actingEmail, labelFor } = useCurrentUser();

  const overview = useApi<AdminOverview>('/api/admin/overview');
  const users = useApi<UsersResponse>('/api/users');
  // Always every trainer: reassignment is precisely the case where you need to
  // see the ones you do not own.
  const trainers = useApi<{ data: TrainerListItem[] }>(
    `/api/trainers${toQueryString({ scope: 'all' })}`,
  );

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);

  function refreshAll() {
    overview.refetch();
    users.refetch();
    trainers.refetch();
    void refreshUsers();
  }

  async function reassign(trainerId: number, owner: string, trainerName: string) {
    setBusy(true);
    try {
      await api.patch(`/api/admin/trainers/${trainerId}/owner`, { owner });
      toast(`${trainerName} → ${labelFor(owner)}`, { tone: 'success' });
      refreshAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not reassign', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser(user: User) {
    setBusy(true);
    try {
      const result = await api.delete<{ orphanedNotes?: number; orphanedActivity?: number }>(
        `/api/users/${user.id}`,
      );
      const left = (result?.orphanedNotes ?? 0) + (result?.orphanedActivity ?? 0);
      toast(
        left > 0
          ? `${user.name} removed — ${left} notes and flags stay under their email`
          : `${user.name} removed`,
        { tone: 'success' },
      );
      refreshAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not delete that user', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const loading = overview.loading || users.loading || trainers.loading;
  if (loading && !overview.data) return <Loading label="Loading workspace…" rows={5} />;

  const error = overview.error ?? users.error ?? trainers.error;
  if (error) return <ErrorState message={error} onRetry={refreshAll} />;
  if (!overview.data || !users.data || !trainers.data) return null;

  const userList = users.data.data;
  const emails = userList.map((u) => u.email);

  return (
    <div className={PAGE_CONTAINER}>
      <PageHeader
        title="Admin"
        description="Who owns what, and whether the workspace data is intact."
      />

      <p className="mb-5 rounded-md border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-sm text-ink">
        This page is not restricted. There is no sign-in, so anyone using the app can reach it —
        the same reason trainer ownership is a convention rather than a guarantee.
      </p>

      <div className="space-y-5">
        {/* ---- Data health ---- */}
        <Card
          title="Data health"
          subtitle="Reference tables the seed is responsible for. A partial import otherwise shows up as unexplained empty pages."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-muted">
                  <th scope="col" className="px-2 py-2 font-medium">Table</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Rows</th>
                  <th scope="col" className="px-2 py-2 font-medium">Status</th>
                  <th scope="col" className="px-2 py-2 font-medium">Populated by</th>
                </tr>
              </thead>
              <tbody>
                {overview.data.tables.map((table) => (
                  <tr key={table.key} className="border-b border-hairline last:border-0">
                    <td className="px-2 py-2 text-ink">{table.label}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink">
                      {table.actual.toLocaleString()}
                      {table.expected !== null && (
                        <span className="text-muted"> / {table.expected.toLocaleString()}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          table.status === 'ok'
                            ? 'border-status-good/40 bg-status-good/10 text-ink-2'
                            : table.status === 'partial'
                              ? 'border-status-warning/50 bg-status-warning/10 text-ink-2'
                              : 'border-status-critical/40 bg-status-critical/10 text-status-critical'
                        }`}
                      >
                        {table.status === 'ok' ? 'Complete' : table.status === 'partial' ? 'Partial' : 'Empty'}
                      </span>
                    </td>
                    <td className="px-2 py-2 font-mono text-xs text-muted">{table.seededBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-hairline pt-4 sm:grid-cols-4">
            <StatTile label="Trainers" value={overview.data.counts.trainers ?? 0} />
            <StatTile label="Roster entries" value={overview.data.counts.roster ?? 0} />
            <StatTile
              label="Movesets set"
              value={overview.data.counts.roster_moves ?? 0}
              hint="equipped moves"
            />
            <StatTile label="Users" value={overview.data.counts.users ?? 0} />
          </div>
        </Card>

        {/* ---- Trainer ownership ---- */}
        <Card
          title="Trainer ownership"
          subtitle="Reassigning is its own action, not a field on the trainer form — it is the one edit that can remove your own access."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-muted">
                  <th scope="col" className="px-2 py-2 font-medium">Trainer</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">Roster</th>
                  <th scope="col" className="px-2 py-2 font-medium">Managed by</th>
                </tr>
              </thead>
              <tbody>
                {trainers.data.data.map((trainer) => (
                  <tr key={trainer.id} className="border-b border-hairline last:border-0">
                    <td className="px-2 py-2">
                      <Link
                        to={`/trainers${toQueryString({ trainerId: trainer.id })}`}
                        className="text-ink hover:text-brand"
                      >
                        {trainer.name}
                      </Link>
                      {trainer.owner === actingEmail && (
                        <span className="ml-2 text-[11px] text-muted">yours</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted">
                      {trainer.rosterSize}
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={trainer.owner}
                        disabled={busy}
                        onChange={(e) => reassign(trainer.id, e.target.value, trainer.name)}
                        aria-label={`Owner of ${trainer.name}`}
                        className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-50"
                      >
                        {/* An owner with no user row would vanish from this
                            list and look like a silent reassignment. */}
                        {!emails.includes(trainer.owner) && (
                          <option value={trainer.owner}>{trainer.owner} (unknown)</option>
                        )}
                        {userList.map((user) => (
                          <option key={user.id} value={user.email}>
                            {user.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ---- Users ---- */}
        <Card
          title="Users"
          subtitle="Attribution identities. Email is immutable — changing it would orphan that user's whole history rather than rename it."
        >
          <ul className="divide-y divide-hairline">
            {userList.map((user) => {
              const isDefault = user.email === overview.data!.defaultOwner;
              return (
                <li key={user.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">
                      {user.name}
                      {isDefault && (
                        <span className="ml-2 text-[11px] font-normal text-muted">
                          default — unattributed writes land here
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-muted">
                      {user.email}
                      {user.role && ` · ${user.role}`} · {user.noteCount} notes ·{' '}
                      {user.activityCount} flags
                    </span>
                  </span>
                  <Button onClick={() => setEditingUser(user)} disabled={busy}>
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => deleteUser(user)}
                    disabled={busy || isDefault}
                    title={isDefault ? 'The default user cannot be deleted' : undefined}
                  >
                    Delete
                  </Button>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* ---- Orphaned attribution ---- */}
        <Card
          title="Orphaned attribution"
          subtitle="Rows filed under an email with no user. Owner columns have no foreign key on purpose, so deleting a user leaves their work in place."
        >
          {overview.data.orphans.length === 0 ? (
            <EmptyState
              title="Nothing orphaned"
              description="Every trainer, note and flag is attributed to a user who still exists."
            />
          ) : (
            <ul className="divide-y divide-hairline">
              {overview.data.orphans.map((orphan) => (
                <li key={orphan.owner} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-sm text-ink">{orphan.owner}</span>
                    <span className="block text-xs text-muted">
                      {orphan.trainers} trainers · {orphan.notes} notes · {orphan.activity} flags
                    </span>
                  </span>
                  <ReassignOrphan
                    from={orphan.owner}
                    users={userList}
                    disabled={busy}
                    onDone={refreshAll}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <EditUserModal
        user={editingUser}
        onClose={() => setEditingUser(null)}
        onSaved={() => {
          setEditingUser(null);
          refreshAll();
        }}
      />
    </div>
  );
}

/**
 * Moves everything filed under an orphaned email onto a real user.
 *
 * Notes and flags are opt-in: inheriting a caseload is not the same as
 * claiming authorship of someone's write-ups, so the choice is explicit.
 */
function ReassignOrphan({
  from,
  users,
  disabled,
  onDone,
}: {
  from: string;
  users: User[];
  disabled: boolean;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [to, setTo] = useState(users[0]?.email ?? '');
  const [includeNotes, setIncludeNotes] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const result = await api.post<{ moved: { trainers: number; notes: number; activity: number } }>(
        '/api/admin/reassign-owner',
        { from, to, includeTrainers: true, includeNotes, includeActivity: includeNotes },
      );
      const { trainers, notes, activity } = result.moved;
      toast(`Moved ${trainers} trainers, ${notes} notes, ${activity} flags`, { tone: 'success' });
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not reassign', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-muted">
        <input
          type="checkbox"
          checked={includeNotes}
          onChange={(e) => setIncludeNotes(e.target.checked)}
        />
        also notes &amp; flags
      </label>
      <select
        value={to}
        onChange={(e) => setTo(e.target.value)}
        aria-label={`Reassign ${from} to`}
        className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-brand"
      >
        {users.map((user) => (
          <option key={user.id} value={user.email}>
            {user.name}
          </option>
        ))}
      </select>
      <Button onClick={run} disabled={disabled || busy || !to}>
        Reassign
      </Button>
    </span>
  );
}

function EditUserModal({
  user,
  onClose,
  onSaved,
}: {
  user: User | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();

  return (
    <Modal open={user !== null} onClose={onClose} title={`Edit ${user?.name ?? 'user'}`}>
      {user && (
        <EditUserForm
          // Remount per user so the fields never carry over — the bug
          // EditRosterMember has.
          key={user.id}
          user={user}
          onClose={onClose}
          onSaved={onSaved}
          toast={toast}
        />
      )}
    </Modal>
  );
}

function EditUserForm({
  user,
  onClose,
  onSaved,
  toast,
}: {
  user: User;
  onClose: () => void;
  onSaved: () => void;
  toast: (message: string, options?: { tone?: 'neutral' | 'success' | 'error' }) => void;
}) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState(user.role ?? '');
  const [initials, setInitials] = useState(user.initials ?? '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api.patch(`/api/users/${user.id}`, { name, role, initials });
      toast(`${name} updated`, { tone: 'success' });
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not update that user', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Field label="Name">
        <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </Field>
      <Field label="Role" hint="Display only — never branched on.">
        <input className={fieldClass} value={role} onChange={(e) => setRole(e.target.value)} maxLength={60} />
      </Field>
      <Field label="Initials" hint="Two characters for the switcher avatar.">
        <input
          className={fieldClass}
          value={initials}
          onChange={(e) => setInitials(e.target.value)}
          maxLength={2}
        />
      </Field>
      <Field label="Email" hint="Immutable: it is the value stored in every owner column.">
        <TextInput value={user.email} readOnly disabled className="w-full" />
      </Field>

      <div className="flex justify-end gap-2 border-t border-hairline pt-4">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={busy || !name.trim()}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
