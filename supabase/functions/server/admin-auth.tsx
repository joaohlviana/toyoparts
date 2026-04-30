// Admin authentication for the Toyoparts admin panel.
// Uses stateless signed tokens to avoid login stalls caused by external session persistence.
// Legacy KV-backed tokens are still accepted during the transition window.

import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';

export const adminAuth = new Hono();

const ADMIN_PASSWORD = 'nokynoyI09*';
const TOKEN_PREFIX = 'admin-session:';
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const STATELESS_TOKEN_PREFIX = 'admv2';
const ADMIN_AUTH_SECRET =
  (Deno.env.get('ADMIN_AUTH_SECRET') || '').trim() ||
  (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim() ||
  ADMIN_PASSWORD;

// Best-effort rate limiting in memory so login remains responsive even if persistence is degraded.
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX_ATTEMPTS = 5;
const rateState = new Map<string, { windowStart: number; attempts: number }>();

function generateNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes).map((byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacKey() {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(ADMIN_AUTH_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function signPayload(encodedPayload: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(),
    new TextEncoder().encode(encodedPayload),
  );

  return bytesToBase64Url(new Uint8Array(signature));
}

async function verifyPayloadSignature(encodedPayload: string, signature: string): Promise<boolean> {
  return crypto.subtle.verify(
    'HMAC',
    await hmacKey(),
    base64UrlToBytes(signature),
    new TextEncoder().encode(encodedPayload),
  );
}

async function generateToken(): Promise<string> {
  const payload = {
    v: 2,
    iat: Date.now(),
    exp: Date.now() + TOKEN_TTL_MS,
    nonce: generateNonce(),
  };

  const encodedPayload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await signPayload(encodedPayload);

  return `${STATELESS_TOKEN_PREFIX}.${encodedPayload}.${signature}`;
}

async function isStatelessTokenValid(token: string): Promise<boolean> {
  if (!token || !token.startsWith(`${STATELESS_TOKEN_PREFIX}.`)) return false;

  const [, encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return false;

  try {
    const signatureValid = await verifyPayloadSignature(encodedPayload, signature);
    if (!signatureValid) return false;

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(encodedPayload)),
    ) as { exp?: number; iat?: number };

    if (!payload?.exp || payload.exp < Date.now()) return false;
    if (!payload?.iat || payload.iat > Date.now() + 60_000) return false;

    return true;
  } catch {
    return false;
  }
}

async function isLegacyTokenValid(token: string): Promise<boolean> {
  if (!token) return false;

  try {
    const session = await kv.get(`${TOKEN_PREFIX}${token}`) as any;
    if (!session) return false;

    if (Date.now() - (session.createdAt ?? 0) > TOKEN_TTL_MS) {
      await kv.del(`${TOKEN_PREFIX}${token}`).catch(() => {});
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

async function isTokenValid(token: string): Promise<boolean> {
  if (!token) return false;
  if (await isStatelessTokenValid(token)) return true;
  return isLegacyTokenValid(token);
}

function getRateKey(c: any): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

async function checkRateLimit(c: any): Promise<{ allowed: boolean; remaining: number; retryAfterSec?: number }> {
  const key = getRateKey(c);
  const data = rateState.get(key);

  if (!data) {
    return { allowed: true, remaining: RATE_MAX_ATTEMPTS - 1 };
  }

  const elapsed = Date.now() - (data.windowStart ?? 0);
  if (elapsed > RATE_WINDOW_MS) {
    rateState.delete(key);
    return { allowed: true, remaining: RATE_MAX_ATTEMPTS - 1 };
  }

  const attempts = data.attempts ?? 0;
  if (attempts >= RATE_MAX_ATTEMPTS) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.ceil((RATE_WINDOW_MS - elapsed) / 1000),
    };
  }

  return { allowed: true, remaining: RATE_MAX_ATTEMPTS - attempts - 1 };
}

async function recordFailedAttempt(c: any): Promise<void> {
  const key = getRateKey(c);
  const data = rateState.get(key);
  const now = Date.now();

  if (!data || now - (data.windowStart ?? 0) > RATE_WINDOW_MS) {
    rateState.set(key, { windowStart: now, attempts: 1 });
    return;
  }

  rateState.set(key, {
    ...data,
    attempts: (data.attempts ?? 0) + 1,
  });
}

async function clearRateLimit(c: any): Promise<void> {
  rateState.delete(getRateKey(c));
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

adminAuth.post('/login', async (c) => {
  try {
    const rate = await checkRateLimit(c);
    if (!rate.allowed) {
      console.log('[admin-auth] Rate limited login attempt');
      return c.json(
        {
          error: `Muitas tentativas. Tente novamente em ${rate.retryAfterSec}s.`,
          retryAfterSec: rate.retryAfterSec,
        },
        429,
      );
    }

    const body = await c.req.json().catch(() => ({}));
    const password = typeof body?.password === 'string' ? body.password.trim() : '';

    if (!password || password !== ADMIN_PASSWORD) {
      await recordFailedAttempt(c);
      await delay(700);
      console.log(`[admin-auth] Failed login attempt (${rate.remaining} remaining)`);
      return c.json({ error: 'Senha incorreta' }, 401);
    }

    await clearRateLimit(c);

    const token = await generateToken();
    console.log(`[admin-auth] Successful login, token=${token.slice(0, 12)}...`);
    return c.json({ token, expiresIn: TOKEN_TTL_MS });
  } catch (err: any) {
    console.error('[admin-auth/login] Error:', err?.message || String(err));
    return c.json({ error: err?.message || 'Falha ao realizar login' }, 500);
  }
});

adminAuth.post('/validate', async (c) => {
  try {
    const token = c.req.header('X-Admin-Token') || '';
    const valid = await isTokenValid(token);
    return c.json({ valid });
  } catch (err: any) {
    return c.json({ valid: false, error: err?.message || String(err) });
  }
});

adminAuth.post('/logout', async (c) => {
  try {
    const token = c.req.header('X-Admin-Token') || '';

    if (token && !token.startsWith(`${STATELESS_TOKEN_PREFIX}.`)) {
      await kv.del(TOKEN_PREFIX + token).catch(() => {});
    }

    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ error: err?.message || String(err) }, 500);
  }
});

adminAuth.post('/cleanup', async (c) => {
  try {
    const now = Date.now();
    const sessions = await kv.getByPrefix(TOKEN_PREFIX);
    const expiredCount = sessions.filter((session: any) => {
      return session && typeof session === 'object' && (now - (session.createdAt || 0)) > TOKEN_TTL_MS;
    }).length;

    console.log(
      `[admin-auth/cleanup] Found ${expiredCount} expired legacy sessions (stateless tokens expire automatically)`,
    );

    return c.json({
      expired: expiredCount,
      note: 'Stateless tokens expiram automaticamente; sessoes legadas sao limpas sob demanda',
    });
  } catch (err: any) {
    console.error('[admin-auth/cleanup] Error:', err?.message || String(err));
    return c.json({ error: err?.message || String(err) }, 500);
  }
});

export async function adminMiddleware(c: any, next: any) {
  const path = c.req.path;

  if (path.includes('/admin/auth/')) {
    return next();
  }

  const token = c.req.header('X-Admin-Token') || '';
  if (!token) {
    return c.json({ error: 'Admin token required. Please login at /admin.' }, 401);
  }

  const valid = await isTokenValid(token);
  if (!valid) {
    return c.json({ error: 'Admin session expired or invalid. Please login again.' }, 401);
  }

  return next();
}
