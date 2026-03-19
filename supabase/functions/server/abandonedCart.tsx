// ─── Abandoned Cart Recovery ───────────────────────────────────────────────
// Token aleatório criptográfico (32 bytes) — chave = sha256(token)
// Rate limit: 1 notificação/email a cada 24h
// Supressão: sem envio se recovered=true, expirado ou cooldown ativo
// Telemetria: abandoned_saved | email_sent | recovered | purchased_after_recover
// PII mínimo: sem CPF, sem telefone, só nome + email + itens
// Um carrinho por e-mail (sobrescreve)

import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';

export const abandonedCart = new Hono();

// ─── Constants ────────────────────────────────────────────────────────────────
const TOKEN_PREFIX  = 'abandoned:token:';   // sha256(plainToken) → record
const EMAIL_PREFIX  = 'abandoned:email:';   // sha256(email)       → { tokenHash }
const EVENT_PREFIX  = 'abandoned:event:';   // timestamp:type      → event

const NOTIFY_COOLDOWN_MS = 24 * 60 * 60 * 1000;   // 24 h
const CART_TTL_MS        =  7 * 24 * 60 * 60 * 1000; // 7 days
const NOTIFY_DELAY_MS    = 30 * 60 * 1000;           // 30 min

// ─── Types ────────────────────────────────────────────────────────────────────
interface AbandonedCartRecord {
  tokenHash:               string;
  plainToken:              string;   // needed to reconstruct recovery URL in batch-notify
  emailHash:               string;
  savedAt:                 string;
  expiresAt:               string;
  notifiedAt:              string | null;
  recovered:               boolean;
  recoveredAt:             string | null;
  purchasedAfterRecover:   boolean;
  formData: {
    name:  string;
    email: string;
    // phone NOT stored (PII reduction — point 6 of the plan)
  };
  cart: Array<{
    sku:           string;
    name:          string;
    qty:           number;
    unitPrice:     number;
    originalPrice: number;
    imageUrl?:     string;
    urlKey?:       string;
  }>;
  events: string[];
}

interface EmailRef {
  tokenHash: string;
  email:     string;
  savedAt:   string;
}

// ─── Crypto helpers ───────────────────────────────────────────────────────────
async function sha256hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Email sender ─────────────────────────────────────────────────────────────
async function sendRecoveryEmail(
  record: AbandonedCartRecord,
  toEmail: string,
): Promise<boolean> {
  const apiKey = (Deno.env.get('RESEND_API') || '').trim();
  if (!apiKey) {
    console.warn('[AbandonedCart] RESEND_API not set — skipping email');
    return false;
  }

  const recoveryUrl = `https://toyoparts.com.br/checkout?recover=${record.plainToken}`;
  const name        = record.formData.name || toEmail.split('@')[0];

  const itemsHtml = record.cart.map(item => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:14px;color:#333;font-weight:600;line-height:1.4;">${item.name}</td>
            <td align="right" style="font-size:14px;color:#EB0A1E;font-weight:700;white-space:nowrap;padding-left:12px;">
              ${item.qty}× ${item.unitPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;">Você deixou itens no carrinho — eles ainda estão disponíveis para você!</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#EB0A1E;padding:24px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td><span style="font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px;">TOYOPARTS</span></td>
                <td align="right"><span style="font-size:12px;color:rgba(255,255,255,0.7);font-weight:500;">Peças Toyota Genuínas</span></td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px;">
            <!-- Cart icon -->
            <div style="width:64px;height:64px;background:#fff8f8;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid #fde8e8;margin:0 0 24px;">
              <span style="font-size:28px;">🛒</span>
            </div>
            <h2 style="margin:0 0 12px;font-size:26px;font-weight:700;color:#1d1d1f;">Você esqueceu algo!</h2>
            <p style="margin:0 0 28px;font-size:16px;color:#666;line-height:1.7;">
              Olá, <strong>${name}</strong>! Você deixou <strong>${record.cart.length} item(ns)</strong> no carrinho da Toyoparts. Eles ainda estão disponíveis para você.
            </p>
            <!-- Items -->
            <div style="background:#f8f8f8;border-radius:14px;padding:20px 24px;margin:0 0 28px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                ${itemsHtml}
              </table>
            </div>
            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0;">
              <tr>
                <td align="center">
                  <a href="${recoveryUrl}" style="display:inline-block;background:#EB0A1E;color:#fff;text-decoration:none;font-size:16px;font-weight:700;padding:18px 48px;border-radius:12px;letter-spacing:0.2px;">
                    Finalizar Minha Compra →
                  </a>
                </td>
              </tr>
            </table>
            <!-- Warning -->
            <div style="background:#fff8f8;border:1px solid #fde8e8;border-radius:12px;padding:14px 20px;">
              <p style="margin:0;font-size:13px;color:#cc4444;line-height:1.6;">⚠️ Este link expira em <strong>7 dias</strong>. Estoque e preços sujeitos à disponibilidade.</p>
            </div>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9f9f9;padding:20px 40px;border-top:1px solid #f0f0f0;text-align:center;">
            <p style="margin:0 0 6px;font-size:13px;color:#999;">Toyoparts · Peças Genuínas e Compatíveis Toyota</p>
            <p style="margin:0;font-size:11px;color:#bbb;">© ${new Date().getFullYear()} Toyoparts. Você recebeu este e-mail porque iniciou uma compra em toyoparts.com.br.<br>Se não foi você, ignore este e-mail.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const payload = {
      from:    'Toyoparts <noreply@toyoparts.com.br>',
      to:      [toEmail],
      subject: `${name}, você deixou itens no carrinho 🛒`,
      html,
    };
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    let res = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers, body: JSON.stringify(payload),
    });
    let data = await res.json();

    // Fallback: if domain not verified, retry with Resend's free domain
    if (res.status === 403 && /domain.*not verified/i.test(data.message || '')) {
      console.log('[AbandonedCart] Domain not verified, retrying with onboarding@resend.dev');
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers,
        body: JSON.stringify({ ...payload, from: 'Toyoparts <onboarding@resend.dev>' }),
      });
      data = await res.json();
    }

    if (!res.ok) {
      console.error('[AbandonedCart] Resend error:', data);
      return false;
    }
    console.log('[AbandonedCart] Recovery email sent:', data.id, '→', toEmail);
    return true;
  } catch (e: any) {
    console.error('[AbandonedCart] sendRecoveryEmail error:', e.message);
    return false;
  }
}

// ─── POST /save ───────────────────────────────────────────────────────────────
// Saves or updates an abandoned cart session.
// Returns a plain token stored in localStorage by the frontend.
abandonedCart.post('/save', async (c) => {
  try {
    const body = await c.req.json();
    const { email, name, cart } = body;

    if (!email || !Array.isArray(cart) || cart.length === 0) {
      return c.json({ error: 'email e cart são obrigatórios' }, 400);
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailHash  = await sha256hex(cleanEmail);
    const emailKey   = `${EMAIL_PREFIX}${emailHash}`;

    // One-per-email: check existing record (preserve notifiedAt history)
    const existingRef: EmailRef | null = await kv.get(emailKey);
    let existingRecord: AbandonedCartRecord | null = null;
    if (existingRef?.tokenHash) {
      existingRecord = await kv.get(`${TOKEN_PREFIX}${existingRef.tokenHash}`);
      // Delete old record before overwriting
      await kv.del(`${TOKEN_PREFIX}${existingRef.tokenHash}`);
    }

    // Generate NEW random token — NOT derived from email (point 1 of the plan)
    const plainToken = generateToken();
    const tokenHash  = await sha256hex(plainToken);
    const now        = new Date().toISOString();
    const expiresAt  = new Date(Date.now() + CART_TTL_MS).toISOString();

    const record: AbandonedCartRecord = {
      tokenHash,
      plainToken,                                       // stored for batch-notify URL construction
      emailHash,
      savedAt:               now,
      expiresAt,
      notifiedAt:            existingRecord?.notifiedAt ?? null, // preserve notification history
      recovered:             false,
      recoveredAt:           null,
      purchasedAfterRecover: false,
      formData: {
        name:  (name || '').trim(),
        email: cleanEmail,
        // phone NOT stored (PII — point 6)
      },
      cart: cart.map((item: any) => ({
        sku:           item.sku,
        name:          item.name,
        qty:           item.qty,
        unitPrice:     item.unitPrice,
        originalPrice: item.originalPrice ?? item.unitPrice,
        imageUrl:      item.imageUrl,
        urlKey:        item.urlKey,
      })),
      events: [...(existingRecord?.events ?? []), `saved:${now}`],
    };

    await kv.set(`${TOKEN_PREFIX}${tokenHash}`, record);
    await kv.set(emailKey, { tokenHash, email: cleanEmail, savedAt: now });

    // Telemetry (point 5)
    await kv.set(`${EVENT_PREFIX}${Date.now()}:saved`, {
      type:      'abandoned_saved',
      email:     cleanEmail,
      itemCount: cart.length,
      savedAt:   now,
    });

    console.log(`[AbandonedCart] Saved: ${cleanEmail} (${cart.length} items)`);
    return c.json({ ok: true, token: plainToken, savedAt: now });
  } catch (e: any) {
    console.error('[AbandonedCart] POST /save error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// ─── GET /recover/:token ──────────────────────────────────────────────────────
// Recovers cart by plain token (from URL ?recover= param).
// Note: revalidation of price/stock is done on the frontend (point 2 of the plan).
abandonedCart.get('/recover/:token', async (c) => {
  try {
    const plainToken = c.req.param('token');
    if (!plainToken || plainToken.length < 32) {
      return c.json({ error: 'Token inválido' }, 400);
    }

    const tokenHash = await sha256hex(plainToken);
    const record: AbandonedCartRecord | null = await kv.get(`${TOKEN_PREFIX}${tokenHash}`);

    if (!record) {
      return c.json({ error: 'Carrinho não encontrado ou expirado' }, 404);
    }

    // Expiry check
    if (new Date(record.expiresAt) < new Date()) {
      await kv.del(`${TOKEN_PREFIX}${tokenHash}`);
      return c.json({ error: 'Link de recuperação expirado' }, 410);
    }

    // Mark as recovered
    const now = new Date().toISOString();
    await kv.set(`${TOKEN_PREFIX}${tokenHash}`, {
      ...record,
      recovered:   true,
      recoveredAt: now,
      events:      [...record.events, `recovered:${now}`],
    });

    // Telemetry
    await kv.set(`${EVENT_PREFIX}${Date.now()}:recovered`, {
      type:        'recovered',
      email:       record.formData.email,
      itemCount:   record.cart.length,
      recoveredAt: now,
    });

    console.log(`[AbandonedCart] Recovered: ${record.formData.email}`);
    return c.json({
      ok:          true,
      formData:    record.formData,
      cart:        record.cart,
      savedAt:     record.savedAt,
      wasNotified: !!record.notifiedAt,
    });
  } catch (e: any) {
    console.error('[AbandonedCart] GET /recover/:token error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// ─── DELETE /clear ────────────────────────────────────────────────────────────
// Called after successful purchase. Purges KV record.
abandonedCart.delete('/clear', async (c) => {
  try {
    const body = await c.req.json();
    const { email, purchasedAfterRecover } = body;
    if (!email) return c.json({ error: 'email é obrigatório' }, 400);

    const cleanEmail = email.trim().toLowerCase();
    const emailHash  = await sha256hex(cleanEmail);
    const emailKey   = `${EMAIL_PREFIX}${emailHash}`;
    const emailRef: EmailRef | null = await kv.get(emailKey);

    if (emailRef?.tokenHash) {
      const record: AbandonedCartRecord | null = await kv.get(`${TOKEN_PREFIX}${emailRef.tokenHash}`);
      // Telemetry: purchased_after_recover (point 5)
      if (record?.recovered && purchasedAfterRecover) {
        await kv.set(`${EVENT_PREFIX}${Date.now()}:purchased`, {
          type:        'purchased_after_recover',
          email:       cleanEmail,
          purchasedAt: new Date().toISOString(),
        });
      }
      await kv.del(`${TOKEN_PREFIX}${emailRef.tokenHash}`);
    }
    await kv.del(emailKey);

    console.log(`[AbandonedCart] Cleared: ${cleanEmail}`);
    return c.json({ ok: true });
  } catch (e: any) {
    console.error('[AbandonedCart] DELETE /clear error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// ─── POST /notify ─────────────────────────────────────────────────────────────
// Sends recovery email for a given plain token.
// Enforces: rate limit (24h), suppression (recovered / expired / cart_empty).
abandonedCart.post('/notify', async (c) => {
  try {
    const body = await c.req.json();
    const { token } = body;
    if (!token) return c.json({ error: 'token é obrigatório' }, 400);

    const tokenHash = await sha256hex(token);
    const record: AbandonedCartRecord | null = await kv.get(`${TOKEN_PREFIX}${tokenHash}`);
    if (!record) return c.json({ error: 'Carrinho não encontrado ou expirado' }, 404);

    // ── Suppression checks (point 3) ──
    if (record.recovered) {
      return c.json({ ok: false, reason: 'already_recovered' });
    }
    if (new Date(record.expiresAt) < new Date()) {
      return c.json({ ok: false, reason: 'expired' });
    }

    const age = Date.now() - new Date(record.savedAt).getTime();
    if (age < NOTIFY_DELAY_MS) {
      return c.json({ ok: false, reason: 'too_soon', notifyAfterMs: NOTIFY_DELAY_MS - age });
    }

    if (record.notifiedAt) {
      const elapsed = Date.now() - new Date(record.notifiedAt).getTime();
      if (elapsed < NOTIFY_COOLDOWN_MS) {
        return c.json({
          ok:           false,
          reason:       'rate_limited',
          nextNotifyAt: new Date(new Date(record.notifiedAt).getTime() + NOTIFY_COOLDOWN_MS).toISOString(),
        });
      }
    }

    const sent = await sendRecoveryEmail(record, record.formData.email);
    if (!sent) return c.json({ ok: false, reason: 'send_failed' }, 500);

    const now = new Date().toISOString();
    await kv.set(`${TOKEN_PREFIX}${tokenHash}`, {
      ...record,
      notifiedAt: now,
      events: [...record.events, `email_sent:${now}`],
    });

    // Telemetry
    await kv.set(`${EVENT_PREFIX}${Date.now()}:email_sent`, {
      type:   'email_sent',
      email:  record.formData.email,
      sentAt: now,
    });

    return c.json({ ok: true });
  } catch (e: any) {
    console.error('[AbandonedCart] POST /notify error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// ─── POST /batch-notify ───────────────────────────────────────────────────────
// Processes all pending notifications (admin / cron use).
// Leverages plainToken stored in record to reconstruct the recovery URL.
abandonedCart.post('/batch-notify', async (c) => {
  try {
    const records = (await kv.getByPrefix(TOKEN_PREFIX)) as AbandonedCartRecord[];
    const now     = Date.now();
    let sent = 0, skipped = 0;

    for (const record of records) {
      if (!record?.savedAt) { skipped++; continue; }
      const age = now - new Date(record.savedAt).getTime();

      // Suppression
      if (record.recovered)                          { skipped++; continue; }
      if (new Date(record.expiresAt) < new Date())   { skipped++; continue; }
      if (age < NOTIFY_DELAY_MS)                     { skipped++; continue; }
      if (record.notifiedAt) {
        const elapsed = now - new Date(record.notifiedAt).getTime();
        if (elapsed < NOTIFY_COOLDOWN_MS)            { skipped++; continue; }
      }

      const ok = await sendRecoveryEmail(record, record.formData.email);
      if (!ok) { skipped++; continue; }

      const ts = new Date().toISOString();
      await kv.set(`${TOKEN_PREFIX}${record.tokenHash}`, {
        ...record,
        notifiedAt: ts,
        events: [...(record.events ?? []), `email_sent:${ts}`],
      });
      await kv.set(`${EVENT_PREFIX}${Date.now()}:email_sent`, {
        type: 'email_sent', email: record.formData.email, sentAt: ts,
      });
      sent++;
    }

    console.log(`[AbandonedCart] batch-notify: sent=${sent}, skipped=${skipped}`);
    return c.json({ ok: true, sent, skipped, total: records.length });
  } catch (e: any) {
    console.error('[AbandonedCart] POST /batch-notify error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// ─── GET /stats ───────────────────────────────────────────────────────────────
// Telemetry dashboard (point 5).
abandonedCart.get('/stats', async (c) => {
  try {
    const events = (await kv.getByPrefix(EVENT_PREFIX)) as any[];
    const counts = {
      abandoned_saved:           events.filter(e => e?.type === 'abandoned_saved').length,
      email_sent:                events.filter(e => e?.type === 'email_sent').length,
      recovered:                 events.filter(e => e?.type === 'recovered').length,
      purchased_after_recover:   events.filter(e => e?.type === 'purchased_after_recover').length,
    };
    const recoveryRate = counts.abandoned_saved > 0
      ? Math.round((counts.recovered / counts.abandoned_saved) * 100)
      : 0;

    return c.json({ ...counts, recovery_rate_pct: recoveryRate });
  } catch (e: any) {
    console.error('[AbandonedCart] GET /stats error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});