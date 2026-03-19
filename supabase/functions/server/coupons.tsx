// ─── Coupon Module ────────────────────────────────────────────────────────────
// Adjustments applied from the plan:
//  1. Per-user usage via coupon:used:{CODE}:{sha256(email)} — no growing arrays
//  2. Idempotent /redeem with coupon:redeem:{CODE}:{orderId} lock
//  3. All arithmetic in integer cents; maxDiscount applied correctly
//  4. SKU / category filter applied to eligible subtotal
//  5. Returns shippingDiscount explicitly
//  6. Rate limit by sha256(ip):code:minute-bucket
//  7. Admin: UPPERCASE normalization, startsAt < expiresAt, usageLimit >= usageCount
//  8. Logs: emailHash + orderIdHash + timestamps — no plain PII

import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';

export const coupons = new Hono();

// ─── KV Key helpers ───────────────────────────────────────────────────────────
const COUPON_KEY   = (code: string) => `coupon:${code.toUpperCase()}`;
const USED_KEY     = (code: string, emailHash: string) => `coupon:used:${code}:${emailHash}`;
const REDEEM_KEY   = (code: string, orderId: string)   => `coupon:redeem:${code}:${orderId}`;
const RL_KEY       = (ipHash: string, code: string, bucket: string) => `coupon:rl:${ipHash}:${code}:${bucket}`;
const LOG_KEY      = (ts: number, code: string)        => `coupon:log:${ts}:${code}`;

const RL_MAX_FAILURES = 10;  // per minute, per ip+code

// ─── Types ────────────────────────────────────────────────────────────────────
export interface CouponRecord {
  code:             string;
  type:             'percent' | 'fixed' | 'free_shipping' | 'combo';
  value:            number;           // % or BRL amount (0 for free_shipping)
  freeShipping:     boolean;
  description:      string;
  active:           boolean;
  startsAt:         string | null;
  expiresAt:        string | null;
  usageLimit:       number | null;
  usageCount:       number;
  usageLimitPerUser: number | null;
  minOrderValue:    number | null;    // BRL
  maxDiscount:      number | null;    // BRL cap on discount (for percent)
  productSkus:      string[];         // [] = all SKUs
  categories:       string[];         // [] = all categories
  createdAt:        string;
  createdBy:        string;
}

export interface ValidateResult {
  valid:            boolean;
  code:             string;
  type:             CouponRecord['type'];
  discountValue:    number;           // BRL — discount on subtotal
  shippingDiscount: number;           // BRL — discount on shipping (point 5)
  totalDiscount:    number;           // discountValue + shippingDiscount
  freeShipping:     boolean;
  description:      string;
  eligibleSubtotal: number;           // subtotal of qualifying items
}

// ─── Crypto helpers ───────────────────────────────────────────────────────────
async function sha256hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Cents arithmetic (point 3) ──────────────────────────────────────────────
function toCents(brl: number): number { return Math.round(brl * 100); }
function toBRL(cents: number): number { return Math.round(cents) / 100; }

// ─── Core validation logic (exported for re-use in checkout.tsx) ──────────────
export async function validateCouponInternal(
  code: string,
  email: string,
  subtotal: number,
  shippingValue: number,
  items: Array<{ sku: string; qty: number; unitPrice: number; categoryId?: string }>,
): Promise<{ ok: boolean; reason?: string; detail?: string; result?: ValidateResult }> {

  const upperCode = code.trim().toUpperCase();
  const record: CouponRecord | null = await kv.get(COUPON_KEY(upperCode));

  if (!record) return { ok: false, reason: 'coupon_not_found' };
  if (!record.active) return { ok: false, reason: 'coupon_inactive' };

  const now = Date.now();
  if (record.startsAt && new Date(record.startsAt).getTime() > now) {
    return { ok: false, reason: 'coupon_not_started', detail: record.startsAt };
  }
  if (record.expiresAt && new Date(record.expiresAt).getTime() < now) {
    return { ok: false, reason: 'coupon_expired', detail: record.expiresAt };
  }
  if (record.usageLimit !== null && record.usageCount >= record.usageLimit) {
    return { ok: false, reason: 'coupon_exhausted' };
  }
  if (record.minOrderValue !== null && subtotal < record.minOrderValue) {
    return { ok: false, reason: 'min_order_not_met', detail: String(record.minOrderValue) };
  }

  // Per-user check (point 1)
  if (record.usageLimitPerUser !== null && email) {
    const emailHash = await sha256hex(email.trim().toLowerCase());
    const userUsage = await kv.get(USED_KEY(upperCode, emailHash)) as { count: number } | null;
    if (userUsage && userUsage.count >= record.usageLimitPerUser) {
      return { ok: false, reason: 'already_used' };
    }
  }

  // Eligible items for SKU / category filter (point 4)
  let eligibleItems = items;
  if (record.productSkus.length > 0) {
    eligibleItems = items.filter(i => record.productSkus.includes(i.sku));
  } else if (record.categories.length > 0) {
    eligibleItems = items.filter(i => i.categoryId && record.categories.includes(i.categoryId));
  }

  if ((record.productSkus.length > 0 || record.categories.length > 0) && eligibleItems.length === 0) {
    return { ok: false, reason: 'not_applicable' };
  }

  const eligibleSubtotal = eligibleItems.reduce((s, i) => s + i.unitPrice * i.qty, 0);

  // Discount calculation in integer cents (point 3)
  let discountCents = 0;
  if (record.type === 'percent' || record.type === 'combo') {
    discountCents = Math.round(toCents(eligibleSubtotal) * record.value / 100);
    if (record.maxDiscount !== null) {
      discountCents = Math.min(discountCents, toCents(record.maxDiscount));
    }
  } else if (record.type === 'fixed') {
    discountCents = Math.min(toCents(record.value), toCents(eligibleSubtotal));
  }
  // free_shipping: discountCents stays 0

  const freeShipping      = record.freeShipping || record.type === 'free_shipping' || record.type === 'combo';
  const shippingDiscountCents = freeShipping ? toCents(shippingValue) : 0;   // point 5

  const discountValue    = toBRL(discountCents);
  const shippingDiscount = toBRL(shippingDiscountCents);

  return {
    ok: true,
    result: {
      valid:            true,
      code:             upperCode,
      type:             record.type,
      discountValue,
      shippingDiscount,
      totalDiscount:    toBRL(discountCents + shippingDiscountCents),
      freeShipping,
      description:      record.description,
      eligibleSubtotal: toBRL(toCents(eligibleSubtotal)),
    },
  };
}

// ─── POST /validate ───────────────────────────────────────────────────────────
coupons.post('/validate', async (c) => {
  try {
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
      || c.req.header('cf-connecting-ip')
      || 'unknown';
    const body = await c.req.json();
    const { code, email = '', subtotal = 0, shippingValue = 0, items = [] } = body;

    if (!code) return c.json({ valid: false, reason: 'missing_code' }, 400);

    const upperCode = code.trim().toUpperCase();

    // Rate limit by ip+code (point 6)
    const minuteBucket = String(Math.floor(Date.now() / 60_000));
    const ipHash       = await sha256hex(ip);
    const rlKey        = RL_KEY(ipHash, upperCode, minuteBucket);
    const rlCount      = (await kv.get(rlKey) as number | null) ?? 0;
    if (rlCount >= RL_MAX_FAILURES) {
      return c.json({ valid: false, reason: 'rate_limited' }, 429);
    }

    const { ok, reason, detail, result } = await validateCouponInternal(
      upperCode, email, subtotal, shippingValue, items,
    );

    if (!ok) {
      // Increment failure counter (only on "wrong" codes, not on business rule failures)
      if (reason === 'coupon_not_found') {
        await kv.set(rlKey, rlCount + 1);
      }
      return c.json({ valid: false, reason, detail });
    }

    return c.json(result);
  } catch (e: any) {
    console.error('[Coupons] POST /validate error:', e.message);
    return c.json({ valid: false, reason: 'server_error', detail: e.message }, 500);
  }
});

// ─── POST /redeem — idempotent usage increment (point 2) ─────────────────────
coupons.post('/redeem', async (c) => {
  try {
    const body = await c.req.json();
    const { code, email = '', orderId } = body;
    if (!code || !orderId) return c.json({ error: 'code e orderId são obrigatórios' }, 400);

    const upperCode = code.trim().toUpperCase();

    // Idempotency lock — re-entrance returns OK without double-counting
    const redeemKey    = REDEEM_KEY(upperCode, orderId);
    const alreadyLocked = await kv.get(redeemKey);
    if (alreadyLocked) {
      console.log(`[Coupons] /redeem idempotent hit: ${upperCode} / ${orderId}`);
      return c.json({ ok: true, idempotent: true });
    }

    // Set idempotency lock FIRST before any mutations
    await kv.set(redeemKey, { redeemedAt: new Date().toISOString(), orderId });

    // Increment global usage counter
    const record: CouponRecord | null = await kv.get(COUPON_KEY(upperCode));
    if (!record) return c.json({ error: 'Cupom não encontrado' }, 404);

    await kv.set(COUPON_KEY(upperCode), {
      ...record,
      usageCount: record.usageCount + 1,
    });

    // Increment per-user usage (point 1)
    if (email) {
      const emailHash = await sha256hex(email.trim().toLowerCase());
      const usedKey   = USED_KEY(upperCode, emailHash);
      const current   = (await kv.get(usedKey) as { count: number; lastUsedAt: string } | null);
      await kv.set(usedKey, {
        count:      (current?.count ?? 0) + 1,
        lastUsedAt: new Date().toISOString(),
      });
    }

    // Audit log — no plain PII (point 8)
    const emailHash   = email ? await sha256hex(email.trim().toLowerCase()) : null;
    const orderHash   = await sha256hex(orderId);
    await kv.set(LOG_KEY(Date.now(), upperCode), {
      action:    'redeemed',
      codeUpper: upperCode,
      emailHash,
      orderHash,
      ts:        new Date().toISOString(),
    });

    console.log(`[Coupons] Redeemed: ${upperCode} / order:${orderId}`);
    return c.json({ ok: true });
  } catch (e: any) {
    console.error('[Coupons] POST /redeem error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Admin CRUD ──────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// GET /admin — list all coupons
coupons.get('/admin', async (c) => {
  try {
    const all = (await kv.getByPrefix('coupon:')) as any[];
    // Only return CouponRecord entries (not used/redeem/log/rl keys)
    const list = all.filter(r => r && r.code && r.type && typeof r.usageCount === 'number');
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return c.json({ coupons: list });
  } catch (e: any) {
    console.error('[Coupons] GET /admin error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// GET /admin/:code — single coupon
coupons.get('/admin/:code', async (c) => {
  try {
    const code   = c.req.param('code').toUpperCase();
    const record = await kv.get(COUPON_KEY(code));
    if (!record) return c.json({ error: 'Cupom não encontrado' }, 404);
    return c.json(record);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// POST /admin — create coupon (point 7: UPPERCASE + date validation)
coupons.post('/admin', async (c) => {
  try {
    const body = await c.req.json();
    const code = (body.code || '').trim().toUpperCase();

    if (!code) return c.json({ error: 'code é obrigatório' }, 400);
    if (!body.type) return c.json({ error: 'type é obrigatório' }, 400);
    if (!['percent', 'fixed', 'free_shipping', 'combo'].includes(body.type)) {
      return c.json({ error: 'type inválido' }, 400);
    }

    const existing = await kv.get(COUPON_KEY(code));
    if (existing) return c.json({ error: 'Código já existe. Use PUT para editar.' }, 409);

    // Date range validation (point 7)
    if (body.startsAt && body.expiresAt) {
      if (new Date(body.startsAt) >= new Date(body.expiresAt)) {
        return c.json({ error: 'startsAt deve ser anterior a expiresAt' }, 400);
      }
    }

    const record: CouponRecord = {
      code,
      type:             body.type,
      value:            Number(body.value ?? 0),
      freeShipping:     body.freeShipping ?? (body.type === 'free_shipping'),
      description:      body.description || '',
      active:           body.active ?? true,
      startsAt:         body.startsAt || null,
      expiresAt:        body.expiresAt || null,
      usageLimit:       body.usageLimit != null ? Number(body.usageLimit) : null,
      usageCount:       0,
      usageLimitPerUser: body.usageLimitPerUser != null ? Number(body.usageLimitPerUser) : null,
      minOrderValue:    body.minOrderValue != null ? Number(body.minOrderValue) : null,
      maxDiscount:      body.maxDiscount != null ? Number(body.maxDiscount) : null,
      productSkus:      Array.isArray(body.productSkus) ? body.productSkus : [],
      categories:       Array.isArray(body.categories) ? body.categories : [],
      createdAt:        new Date().toISOString(),
      createdBy:        body.createdBy || 'admin',
    };

    await kv.set(COUPON_KEY(code), record);
    console.log(`[Coupons] Created: ${code}`);
    return c.json({ ok: true, coupon: record });
  } catch (e: any) {
    console.error('[Coupons] POST /admin error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// PUT /admin/:code — update coupon (point 7: prevent usageLimit < usageCount)
coupons.put('/admin/:code', async (c) => {
  try {
    const code   = c.req.param('code').toUpperCase();
    const record: CouponRecord | null = await kv.get(COUPON_KEY(code));
    if (!record) return c.json({ error: 'Cupom não encontrado' }, 404);

    const body = await c.req.json();

    // Date range validation (point 7)
    const newStart  = body.startsAt  ?? record.startsAt;
    const newExpiry = body.expiresAt ?? record.expiresAt;
    if (newStart && newExpiry && new Date(newStart) >= new Date(newExpiry)) {
      return c.json({ error: 'startsAt deve ser anterior a expiresAt' }, 400);
    }

    // Prevent usageLimit < current usageCount (point 7)
    const newLimit = body.usageLimit != null ? Number(body.usageLimit) : record.usageLimit;
    if (newLimit !== null && newLimit < record.usageCount) {
      return c.json({
        error: `usageLimit (${newLimit}) não pode ser menor que usageCount atual (${record.usageCount})`,
      }, 400);
    }

    const updated: CouponRecord = {
      ...record,
      ...(body.type        !== undefined && { type:             body.type }),
      ...(body.value       !== undefined && { value:            Number(body.value) }),
      ...(body.freeShipping !== undefined && { freeShipping:    body.freeShipping }),
      ...(body.description  !== undefined && { description:     body.description }),
      ...(body.active       !== undefined && { active:          body.active }),
      ...(body.startsAt     !== undefined && { startsAt:        body.startsAt || null }),
      ...(body.expiresAt    !== undefined && { expiresAt:       body.expiresAt || null }),
      ...(newLimit          !== undefined && { usageLimit:      newLimit }),
      ...(body.usageLimitPerUser !== undefined && { usageLimitPerUser: body.usageLimitPerUser != null ? Number(body.usageLimitPerUser) : null }),
      ...(body.minOrderValue    !== undefined && { minOrderValue:     body.minOrderValue != null ? Number(body.minOrderValue) : null }),
      ...(body.maxDiscount      !== undefined && { maxDiscount:       body.maxDiscount   != null ? Number(body.maxDiscount)   : null }),
      ...(body.productSkus      !== undefined && { productSkus:       body.productSkus }),
      ...(body.categories       !== undefined && { categories:        body.categories }),
      code, // always keep UPPERCASE
    };

    await kv.set(COUPON_KEY(code), updated);
    return c.json({ ok: true, coupon: updated });
  } catch (e: any) {
    console.error('[Coupons] PUT /admin/:code error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// DELETE /admin/:code
coupons.delete('/admin/:code', async (c) => {
  try {
    const code = c.req.param('code').toUpperCase();
    await kv.del(COUPON_KEY(code));
    console.log(`[Coupons] Deleted: ${code}`);
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// GET /admin/stats/:code — usage stats for a single coupon
coupons.get('/admin/stats/:code', async (c) => {
  try {
    const code   = c.req.param('code').toUpperCase();
    const record: CouponRecord | null = await kv.get(COUPON_KEY(code));
    if (!record) return c.json({ error: 'Cupom não encontrado' }, 404);

    const logs = (await kv.getByPrefix(`coupon:log:`)) as any[];
    const myLogs = logs.filter(l => l?.codeUpper === code);

    return c.json({
      code,
      usageCount: record.usageCount,
      usageLimit: record.usageLimit,
      pct: record.usageLimit ? Math.round(record.usageCount / record.usageLimit * 100) : null,
      logs: myLogs.slice(-50),
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});
