// ─── Admin Authentication ────────────────────────────────────────────────────
// Simple password-based admin auth for MVP.
// - POST /login: validate password, return session token (rate-limited)
// - POST /validate: check if token is still valid
// - POST /logout: invalidate token
// - POST /cleanup: garbage-collect expired tokens
// - adminMiddleware: Hono middleware to protect admin routes

import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';

export const adminAuth = new Hono();

// ─── Config ──────────────────────────────────────────────────────────────────

const ADMIN_PASSWORD = 'nokynoyi9';
const TOKEN_PREFIX   = 'admin-session:';
const TOKEN_TTL_MS   = 24 * 60 * 60 * 1000; // 24 hours

// Rate limiting: max 5 failed attempts per IP in 15 min window
const RATE_PREFIX      = 'admin-rate:';
const RATE_WINDOW_MS   = 15 * 60 * 1000; // 15 min
const RATE_MAX_ATTEMPTS = 5;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function isTokenValid(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const session = await kv.get(`${TOKEN_PREFIX}${token}`) as any;
    if (!session) return false;
    if (Date.now() - (session.createdAt ?? 0) > TOKEN_TTL_MS) {
      // Expired — clean up
      await kv.del(`${TOKEN_PREFIX}${token}`).catch(() => {});
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ─── Rate Limiting ───────────────────────────────────────────────────────────

function getRateKey(c: any): string {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  return `${RATE_PREFIX}${ip}`;
}

async function checkRateLimit(c: any): Promise<{ allowed: boolean; remaining: number; retryAfterSec?: number }> {
  const key = getRateKey(c);
  try {
    const data = await kv.get(key) as any;
    if (!data) return { allowed: true, remaining: RATE_MAX_ATTEMPTS - 1 };

    const elapsed = Date.now() - (data.windowStart ?? 0);
    if (elapsed > RATE_WINDOW_MS) {
      return { allowed: true, remaining: RATE_MAX_ATTEMPTS - 1 };
    }

    const attempts = (data.attempts ?? 0);
    if (attempts >= RATE_MAX_ATTEMPTS) {
      const retryAfterSec = Math.ceil((RATE_WINDOW_MS - elapsed) / 1000);
      return { allowed: false, remaining: 0, retryAfterSec };
    }

    return { allowed: true, remaining: RATE_MAX_ATTEMPTS - attempts - 1 };
  } catch {
    return { allowed: true, remaining: RATE_MAX_ATTEMPTS - 1 };
  }
}

async function recordFailedAttempt(c: any): Promise<void> {
  const key = getRateKey(c);
  try {
    const data = await kv.get(key) as any;
    const now = Date.now();

    if (!data || (now - (data.windowStart ?? 0) > RATE_WINDOW_MS)) {
      await kv.set(key, { windowStart: now, attempts: 1 });
    } else {
      await kv.set(key, { ...data, attempts: (data.attempts ?? 0) + 1 });
    }
  } catch { /* ignore */ }
}

async function clearRateLimit(c: any): Promise<void> {
  try { await kv.del(getRateKey(c)); } catch { /* ignore */ }
}

// ─── POST /login ─────────────────────────────────────────────────────────────

adminAuth.post('/login', async (c) => {
  try {
    const rate = await checkRateLimit(c);
    if (!rate.allowed) {
      console.log('[admin-auth] Rate limited login attempt');
      return c.json({
        error: 'Muitas tentativas. Tente novamente em ' + rate.retryAfterSec + 's.',
        retryAfterSec: rate.retryAfterSec,
      }, 429);
    }

    const { password } = await c.req.json() as { password?: string };

    if (!password || password !== ADMIN_PASSWORD) {
      await recordFailedAttempt(c);
      console.log('[admin-auth] Failed login attempt (' + rate.remaining + ' remaining)');
      return c.json({ error: 'Senha incorreta' }, 401);
    }

    await clearRateLimit(c);

    const token = generateToken();
    await kv.set(TOKEN_PREFIX + token, {
      createdAt : Date.now(),
      ip        : c.req.header('x-forwarded-for') || 'unknown',
      userAgent : (c.req.header('user-agent') || '').slice(0, 100),
    });

    console.log('[admin-auth] Successful login, token=' + token.slice(0, 8) + '...');
    return c.json({ token: token, expiresIn: TOKEN_TTL_MS });
  } catch (err: any) {
    console.error('[admin-auth/login] Error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ─── POST /validate ──────────────────────────────────────────────────────────

adminAuth.post('/validate', async (c) => {
  try {
    const token = c.req.header('X-Admin-Token') || '';
    const valid = await isTokenValid(token);
    return c.json({ valid: valid });
  } catch (err: any) {
    return c.json({ valid: false, error: err.message });
  }
});

// ─── POST /logout ────────────────────────────────────────────────────────────

adminAuth.post('/logout', async (c) => {
  try {
    const token = c.req.header('X-Admin-Token') || '';
    if (token) {
      await kv.del(TOKEN_PREFIX + token).catch(function() {});
    }
    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── POST /cleanup — Garbage-collect expired tokens ──────────────────────────

adminAuth.post('/cleanup', async (c) => {
  try {
    // Use getByPrefix to find all sessions — it returns values only
    // We need keys too, so we use the KV prefix approach
    const now = Date.now();
    let cleaned = 0;

    // Clean expired sessions by scanning with getByPrefix
    // Since getByPrefix only returns values, we'll use mget pattern
    // For now, just report — actual cleanup happens on isTokenValid() lazily
    const sessions = await kv.getByPrefix(TOKEN_PREFIX);
    const expiredCount = sessions.filter(function(s: any) {
      return s && typeof s === 'object' && (now - (s.createdAt || 0)) > TOKEN_TTL_MS;
    }).length;

    console.log('[admin-auth/cleanup] Found ' + expiredCount + ' expired sessions (cleaned lazily on access)');
    return c.json({ expired: expiredCount, note: 'Expired tokens are cleaned lazily on next access' });
  } catch (err: any) {
    console.error('[admin-auth/cleanup] Error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ─── Middleware ───────────────────────────────────────────────────────────────

export async function adminMiddleware(c: any, next: any) {
  var path = c.req.path;

  if (path.includes('/admin/auth/')) {
    return next();
  }

  var token = c.req.header('X-Admin-Token') || '';

  if (!token) {
    return c.json({ error: 'Admin token required. Please login at /admin.' }, 401);
  }

  var valid = await isTokenValid(token);
  if (!valid) {
    return c.json({ error: 'Admin session expired or invalid. Please login again.' }, 401);
  }

  return next();
}