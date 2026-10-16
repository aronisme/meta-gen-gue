import type { AuthUser, GoogleAuthResponse } from './types';

const AUTH_USER_KEY = 'metagen_auth_user';
const AUTH_EVENT_NAME = 'metagen_auth_change';

export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function saveStoredUser(user: AuthUser): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    window.dispatchEvent(new CustomEvent(AUTH_EVENT_NAME, { detail: user }));
  } catch (e) {
    console.error('Failed to save auth user:', e);
  }
}

export function clearStoredUser(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(AUTH_USER_KEY);
    window.dispatchEvent(new CustomEvent(AUTH_EVENT_NAME, { detail: null }));
  } catch (e) {
    console.error('Failed to clear auth user:', e);
  }
}

export function onAuthChange(callback: (user: AuthUser | null) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (event: Event) => {
    const custom = event as CustomEvent<AuthUser | null>;
    callback(custom.detail);
  };

  window.addEventListener(AUTH_EVENT_NAME, handler);
  window.addEventListener('storage', (e) => {
    if (e.key === AUTH_USER_KEY) {
      callback(getStoredUser());
    }
  });

  return () => {
    window.removeEventListener(AUTH_EVENT_NAME, handler);
  };
}

export async function loginWithGoogleIdToken(idToken: string): Promise<GoogleAuthResponse> {
  try {
    const resp = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'google_login', idToken }),
    });

    const data = (await resp.json()) as GoogleAuthResponse;

    if (data.ok && data.user) {
      const fullUser: AuthUser = {
        ...data.user,
        idToken,
      };
      saveStoredUser(fullUser);
      return { ok: true, user: fullUser };
    }

    return data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

export async function refreshUserStatus(): Promise<AuthUser | null> {
  const current = getStoredUser();
  if (!current?.email) return null;

  try {
    const resp = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_user_status', email: current.email }),
    });

    if (resp.ok) {
      const data = (await resp.json()) as { ok?: boolean; user?: Partial<AuthUser> };
      if (data.ok && data.user) {
        const updated: AuthUser = {
          ...current,
          ...data.user,
          picture: current.picture || data.user.picture,
          remainingQuota:
            typeof data.user.remainingQuota === 'number'
              ? data.user.remainingQuota
              : Math.max(0, (data.user.dailyQuota ?? current.dailyQuota) - (data.user.usageCount ?? current.usageCount)),
        };
        saveStoredUser(updated);
        return updated;
      }
    }
  } catch (e) {
    console.warn('Failed to refresh user status:', e);
  }

  return current;
}
