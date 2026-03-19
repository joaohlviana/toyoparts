// ─── Admin Auth Utilities ────────────────────────────────────────────────────
// Manages admin session token in localStorage and provides auth headers.
// Includes global 401 interceptor for expired sessions.

import { projectId, publicAnonKey } from '../../../utils/supabase/info';

const STORAGE_KEY = 'toyoparts_admin_token';
const API = `https://${projectId}.supabase.co/functions/v1/make-server-1d6e33e0`;

// ─── 401 listener registry ──────────────────────────────────────────────────
// Components (e.g. AdminLayout) can subscribe to be notified when a 401 occurs.

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export function onAdminUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => { unauthorizedListeners.delete(listener); };
}

function notifyUnauthorized() {
  clearAdminToken();
  unauthorizedListeners.forEach(fn => {
    try { fn(); } catch { /* ignore */ }
  });
}

// ─── Token management ────────────────────────────────────────────────────────

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string): void {
  localStorage.setItem(STORAGE_KEY, token);
}

export function clearAdminToken(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ─── Headers for admin API calls ─────────────────────────────────────────────
// Returns headers with both the Supabase anon key AND the admin token.

export function getAdminHeaders(): HeadersInit {
  const token = getAdminToken();
  return {
    Authorization  : `Bearer ${publicAnonKey}`,
    apikey         : publicAnonKey,
    'Content-Type' : 'application/json',
    ...(token ? { 'X-Admin-Token': token } : {}),
  };
}

// ─── Admin Fetch wrapper ─────────────────────────────────────────────────────
// Wraps fetch() for admin routes: auto-injects headers and handles 401 globally.
// All admin pages should use this instead of raw fetch for /admin/* routes.

export async function adminFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = { ...getAdminHeaders(), ...(init?.headers || {}) };
  const res = await fetch(url, { ...init, headers });

  if (res.status === 401) {
    // Session expired or invalid — notify listeners (triggers re-login)
    const data = await res.clone().json().catch(() => ({}));
    console.warn('[admin-auth] 401 Unauthorized:', data.error || 'session expired');
    notifyUnauthorized();
  }

  return res;
}

// ─── API calls ───────────────────────────────────────────────────────────────

export async function adminLogin(password: string): Promise<{ token: string } | { error: string }> {
  try {
    const res = await fetch(`${API}/admin/auth/login`, {
      method: 'POST',
      headers: {
        Authorization  : `Bearer ${publicAnonKey}`,
        apikey         : publicAnonKey,
        'Content-Type' : 'application/json',
      },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      return { error: data.error ?? `HTTP ${res.status}` };
    }
    setAdminToken(data.token);
    return { token: data.token };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function adminValidateToken(): Promise<boolean> {
  const token = getAdminToken();
  if (!token) return false;
  try {
    const res = await fetch(`${API}/admin/auth/validate`, {
      method: 'POST',
      headers: {
        Authorization    : `Bearer ${publicAnonKey}`,
        apikey           : publicAnonKey,
        'Content-Type'   : 'application/json',
        'X-Admin-Token'  : token,
      },
    });
    const data = await res.json();
    return data.valid === true;
  } catch {
    return false;
  }
}

export async function adminLogout(): Promise<void> {
  const token = getAdminToken();
  if (token) {
    fetch(`${API}/admin/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization    : `Bearer ${publicAnonKey}`,
        apikey           : publicAnonKey,
        'Content-Type'   : 'application/json',
        'X-Admin-Token'  : token,
      },
    }).catch(() => {});
  }
  clearAdminToken();
}
