import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { initialsFor, useCurrentUser } from '../lib/useCurrentUser';
import { useToast } from './Toast';
import { Button } from './ui';
import { Modal, Field, fieldClass } from './Modal';

/**
 * The "acting as" control at the foot of the sidebar.
 *
 * Deliberately visible at all times: every note and status flag is filed under
 * whoever is showing here, so the app must never leave you guessing who you are
 * writing as. It is attribution only — no password, no permissions.
 */
export function UserSwitcher() {
  const { user, users, email, loading, switchTo, refresh, scope, setScope } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Click-away and Escape, the two ways out of a popover people expect.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const label = user?.name ?? email ?? 'No user';

  return (
    <div ref={containerRef} className="relative mt-auto pt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Acting as ${label} — click to switch`}
        className="group relative flex h-10 w-10 items-center justify-center rounded-full border border-hairline bg-plane text-xs font-semibold text-ink transition-colors hover:border-brand hover:text-brand"
      >
        {loading && !user ? '··' : user ? initialsFor(user) : '?'}
        <span className="sr-only">Acting as {label}. Switch user.</span>
        <span className="pointer-events-none absolute left-full z-20 ml-2 hidden whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-normal text-white group-hover:block">
          Acting as {label}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-0 left-full z-30 ml-2 w-64 rounded-lg border border-hairline bg-surface p-1 shadow-lg"
        >
          <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Acting as
          </p>

          {users.map((option) => {
            const active = option.email === email;
            return (
              <button
                key={option.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  switchTo(option.email);
                  setOpen(false);
                }}
                className={[
                  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors',
                  active ? 'bg-brand/10 text-brand' : 'text-ink hover:bg-plane',
                ].join(' ')}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-hairline bg-plane text-[11px] font-semibold">
                  {initialsFor(option)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{option.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {option.role ? `${option.role} · ` : ''}
                    {option.noteCount} notes · {option.activityCount} flags
                  </span>
                </span>
              </button>
            );
          })}

          <div className="mt-1 border-t border-hairline pt-1">
            <button
              type="button"
              onClick={() => {
                setCreating(true);
                setOpen(false);
              }}
              className="w-full rounded-md px-3 py-2 text-left text-sm text-muted hover:bg-plane hover:text-brand"
            >
              + Add user…
            </button>
          </div>

          {/* Scope lives beside the user because it only means anything
              relative to one: "mine" is whoever is selected above. */}
          <div className="mt-1 border-t border-hairline pt-2">
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
              Trainers shown
            </p>
            <div className="flex gap-1 px-2 pb-1">
              {(['mine', 'all'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="menuitemradio"
                  aria-checked={scope === option}
                  onClick={() => setScope(option)}
                  className={[
                    'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                    scope === option
                      ? 'bg-brand/10 text-brand'
                      : 'text-muted hover:bg-plane hover:text-ink',
                  ].join(' ')}
                >
                  {option === 'mine' ? 'Mine' : 'All trainers'}
                </button>
              ))}
            </div>
          </div>

          <p className="px-3 pb-2 pt-1 text-[11px] leading-snug text-muted">
            Attribution only — there is no sign-in. Switching user hands you
            their trainers. Notes and activity stay visible to everyone.
          </p>
        </div>
      )}

      <NewUserModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={async (createdEmail) => {
          await refresh();
          switchTo(createdEmail);
        }}
      />
    </div>
  );
}

function NewUserModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (email: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [emailValue, setEmailValue] = useState('');
  const [role, setRole] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.post('/api/users', {
        name: name.trim(),
        email: emailValue.trim(),
        role: role.trim() || undefined,
      });
      await onCreated(emailValue.trim());
      toast(`Now acting as ${name.trim()}`, { tone: 'success' });
      setName('');
      setEmailValue('');
      setRole('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the user');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a user">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
            className={fieldClass}
          />
        </Field>
        <Field
          label="Email"
          hint="Written onto every note and flag this user creates, and not editable afterwards."
        >
          <input
            type="email"
            value={emailValue}
            onChange={(e) => setEmailValue(e.target.value)}
            required
            maxLength={200}
            className={fieldClass}
          />
        </Field>
        <Field label="Role" hint="Optional — shown beside the name.">
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            maxLength={60}
            className={fieldClass}
          />
        </Field>
        {error && <p className="text-xs text-status-critical">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving || !name.trim() || !emailValue.trim()}>
            {saving ? 'Adding…' : 'Add user'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
