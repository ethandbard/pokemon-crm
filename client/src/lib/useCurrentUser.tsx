import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setActingUser } from './api';
import type { User, UsersResponse } from './types';

/**
 * Who the app is acting as.
 *
 * **Attribution, not authentication.** Picking a user changes whose name goes
 * on new notes and status flags and what "mine" means in the filters; it grants
 * nothing and hides nothing. Everyone still sees the whole workspace.
 *
 * The choice is an email in localStorage, deliberately the same value that
 * lands in the `owner` columns — so a selection survives a reload even if that
 * user is later removed from the directory.
 */
const STORAGE_KEY = 'pokemon-crm:acting-user';

function storedEmail(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private-mode or blocked storage — the switcher still works per session.
    return null;
  }
}

// Applied before the first request so writes are never attributed to the
// fallback owner just because the directory hasn't finished loading.
setActingUser(storedEmail());

interface CurrentUserValue {
  /** The acting user, once the directory has loaded and matched the email. */
  user: User | null;
  /** Everyone available to act as. */
  users: User[];
  /** The acting email even when no matching user row exists. */
  email: string | null;
  loading: boolean;
  error: string | null;
  switchTo: (email: string) => void;
  /** Re-reads the directory — call after creating or deleting a user. */
  refresh: () => Promise<void>;
  /** Display name for any `owner` string, falling back to the email itself. */
  labelFor: (owner: string) => string;
}

const CurrentUserContext = createContext<CurrentUserValue | null>(null);

export function CurrentUserProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState<string | null>(() => storedEmail());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<UsersResponse>('/api/users');
      setUsers(response.data);
      // No stored choice, or one that no longer exists: fall back to the
      // server's default owner so the header always names a real user.
      setEmail((current) => {
        const known = response.data.some((u) => u.email === current);
        return current && known ? current : response.defaultOwner;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the fetch wrapper's header and localStorage in step with the choice.
  useEffect(() => {
    setActingUser(email);
    try {
      if (email) window.localStorage.setItem(STORAGE_KEY, email);
    } catch {
      // Storage unavailable — the in-memory choice is still honoured.
    }
  }, [email]);

  const value = useMemo<CurrentUserValue>(() => {
    const byEmail = new Map(users.map((u) => [u.email, u]));
    return {
      users,
      email,
      loading,
      error,
      user: email ? (byEmail.get(email) ?? null) : null,
      switchTo: setEmail,
      refresh: load,
      labelFor: (owner: string) => byEmail.get(owner)?.name ?? owner,
    };
  }, [users, email, loading, error, load]);

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

export function useCurrentUser(): CurrentUserValue {
  const value = useContext(CurrentUserContext);
  if (!value) throw new Error('useCurrentUser must be used inside <CurrentUserProvider>');
  return value;
}

/** "Professor Oak" → "PO". Mirrors the server's fallback for seeded users. */
export function initialsFor(user: Pick<User, 'name' | 'initials'>): string {
  if (user.initials) return user.initials;
  const words = user.name.split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1 ? words[0]![0]! + words[words.length - 1]![0]! : user.name.slice(0, 2);
  return letters.toUpperCase();
}
