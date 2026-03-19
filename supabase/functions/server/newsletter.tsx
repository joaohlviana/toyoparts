// ─── Newsletter Subscription Backend ─────────────────────────────────────────
// Stores subscribers in KV with prefix `newsletter:`
// Key: newsletter:{email} → { email, name, whatsapp, source, subscribedAt }

import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';
import { fetchMagento } from './magento.tsx';

const app = new Hono();

const NEWSLETTER_PREFIX = 'newsletter:';
const NEWSLETTER_INDEX_KEY = 'meta:newsletter_index';
const IMPORT_STATUS_KEY = 'meta:newsletter_import_status';
const PAGE_SIZE = 100; // Magento customers per page

// Normalize email for consistent key
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Validate email format
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Mask WhatsApp to just digits
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

// ── POST /subscribe ─────────────────────────────────────────────────────────
// Body: { email: string, name?: string, whatsapp?: string, source?: string }
app.post('/subscribe', async (c) => {
  try {
    const body = await c.req.json();
    const email = normalizeEmail(body.email || '');

    if (!email || !isValidEmail(email)) {
      return c.json({ error: 'E-mail inválido', code: 'INVALID_EMAIL' }, 400);
    }

    const key = `${NEWSLETTER_PREFIX}${email}`;

    // Check if already subscribed
    const existing = await kv.get(key);
    if (existing) {
      // Update fields if new info provided (merge)
      const updated = {
        ...existing,
        name: body.name || existing.name || '',
        whatsapp: body.whatsapp ? normalizePhone(body.whatsapp) : existing.whatsapp || '',
        source: body.source || existing.source || 'unknown',
        updatedAt: new Date().toISOString(),
      };
      await kv.set(key, updated);
      return c.json({ ok: true, status: 'updated', message: 'Dados atualizados com sucesso!' });
    }

    // New subscriber
    const subscriber = {
      email,
      name: body.name || '',
      whatsapp: body.whatsapp ? normalizePhone(body.whatsapp) : '',
      source: body.source || 'unknown', // 'homepage', 'pdp', 'footer', etc.
      subscribedAt: new Date().toISOString(),
      active: true,
    };

    await kv.set(key, subscriber);

    // Update index (list of emails for quick admin listing)
    try {
      const index: string[] = (await kv.get(NEWSLETTER_INDEX_KEY)) || [];
      if (!index.includes(email)) {
        index.push(email);
        await kv.set(NEWSLETTER_INDEX_KEY, index);
      }
    } catch (e: any) {
      console.error('[newsletter] Index update failed (non-blocking):', e.message);
    }

    console.log(`[newsletter] New subscriber: ${email} (source: ${subscriber.source})`);
    return c.json({ ok: true, status: 'subscribed', message: 'Inscrição realizada com sucesso!' });
  } catch (e: any) {
    console.error('[newsletter] subscribe error:', e.message);
    return c.json({ error: `Erro ao processar inscrição: ${e.message}` }, 500);
  }
});

// ── POST /unsubscribe ───────────────────────────────────────────────────────
app.post('/unsubscribe', async (c) => {
  try {
    const { email } = await c.req.json();
    const normalized = normalizeEmail(email || '');
    if (!normalized) return c.json({ error: 'E-mail obrigatório' }, 400);

    const key = `${NEWSLETTER_PREFIX}${normalized}`;
    const existing = await kv.get(key);

    if (!existing) {
      return c.json({ ok: true, message: 'E-mail não encontrado na lista' });
    }

    // Soft delete — mark as inactive
    await kv.set(key, { ...existing, active: false, unsubscribedAt: new Date().toISOString() });

    console.log(`[newsletter] Unsubscribed: ${normalized}`);
    return c.json({ ok: true, message: 'Inscrição cancelada com sucesso' });
  } catch (e: any) {
    console.error('[newsletter] unsubscribe error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// ── GET /subscribers ────────────────────────────────────────────────────────
// Admin endpoint — returns all subscribers
app.get('/subscribers', async (c) => {
  try {
    const all = await kv.getByPrefix(NEWSLETTER_PREFIX);
    const subscribers = (all || [])
      .filter((s: any) => s && s.email)
      .sort((a: any, b: any) => (b.subscribedAt || '').localeCompare(a.subscribedAt || ''));

    const active = subscribers.filter((s: any) => s.active !== false);
    const inactive = subscribers.filter((s: any) => s.active === false);

    return c.json({
      total: subscribers.length,
      active: active.length,
      inactive: inactive.length,
      subscribers,
    });
  } catch (e: any) {
    console.error('[newsletter] list error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// ── GET /stats ──────────────────────────────────────────────────────────────
app.get('/stats', async (c) => {
  try {
    const all = await kv.getByPrefix(NEWSLETTER_PREFIX);
    const subscribers = (all || []).filter((s: any) => s && s.email);
    const active = subscribers.filter((s: any) => s.active !== false);

    // Group by source
    const bySource: Record<string, number> = {};
    for (const s of active) {
      const src = s.source || 'unknown';
      bySource[src] = (bySource[src] || 0) + 1;
    }

    // Last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recent = active.filter((s: any) => s.subscribedAt >= sevenDaysAgo);

    return c.json({
      total: subscribers.length,
      active: active.length,
      recent_7d: recent.length,
      by_source: bySource,
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// IMPORT MAGENTO NEWSLETTER — step-based architecture
// ═══════════════════════════════════════════════════════════════════════════════

// ── GET /import-magento/status ──────────────────────────────────────────────
app.get('/import-magento/status', async (c) => {
  try {
    const status = await kv.get(IMPORT_STATUS_KEY);
    if (!status) return c.json({ status: 'idle' });
    return c.json(status);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ── POST /import-magento/start ──────────────────────────────────────────────
app.post('/import-magento/start', async (c) => {
  try {
    // Check if already running
    const existing = await kv.get(IMPORT_STATUS_KEY);
    if (existing?.status === 'running') {
      return c.json({ error: 'Import já em andamento', status: existing }, 409);
    }

    // Probe Magento to count total customers
    console.log('[newsletter-import] Probing Magento customers count...');
    const probe = await fetchMagento('/V1/customers/search', {
      'searchCriteria[currentPage]': '1',
      'searchCriteria[pageSize]': '1',
    });

    const totalCustomers = probe?.total_count ?? 0;
    if (totalCustomers === 0) {
      return c.json({ error: 'Nenhum cliente encontrado no Magento' }, 404);
    }

    const totalPages = Math.ceil(totalCustomers / PAGE_SIZE);

    const status = {
      status: 'running',
      total_customers: totalCustomers,
      total_pages: totalPages,
      current_page: 0,
      processed: 0,
      imported: 0,
      skipped_no_subscription: 0,
      skipped_existing: 0,
      updated: 0,
      errors: 0,
      started_at: new Date().toISOString(),
      last_step_at: null as string | null,
      completed_at: null as string | null,
      elapsed_seconds: 0,
    };

    await kv.set(IMPORT_STATUS_KEY, status);
    console.log(`[newsletter-import] Started: ${totalCustomers} customers, ${totalPages} pages`);

    return c.json({
      message: 'started',
      total_customers: totalCustomers,
      total_pages: totalPages,
      page_size: PAGE_SIZE,
    });
  } catch (e: any) {
    console.error('[newsletter-import] start error:', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// ── POST /import-magento/step ───────────────────────────────────────────────
app.post('/import-magento/step', async (c) => {
  const t0 = Date.now();
  try {
    const status = await kv.get(IMPORT_STATUS_KEY);
    if (!status || status.status !== 'running') {
      return c.json({ error: 'Import não está rodando. Execute /start primeiro.', status: status?.status || 'idle' }, 400);
    }

    const nextPage = status.current_page + 1;
    if (nextPage > status.total_pages) {
      // All done
      status.status = 'completed';
      status.completed_at = new Date().toISOString();
      status.elapsed_seconds = Math.round((Date.now() - new Date(status.started_at).getTime()) / 1000);
      await kv.set(IMPORT_STATUS_KEY, status);
      return c.json({ message: 'completed', status });
    }

    // Fetch page of customers from Magento
    console.log(`[newsletter-import] Fetching page ${nextPage}/${status.total_pages}...`);
    const data = await fetchMagento('/V1/customers/search', {
      'searchCriteria[currentPage]': String(nextPage),
      'searchCriteria[pageSize]': String(PAGE_SIZE),
      'searchCriteria[sortOrders][0][field]': 'entity_id',
      'searchCriteria[sortOrders][0][direction]': 'ASC',
    });

    const customers = data?.items || [];
    let imported = 0;
    let skippedNoSub = 0;
    let skippedExisting = 0;
    let updated = 0;
    let errors = 0;

    for (const customer of customers) {
      try {
        const email = (customer.email || '').trim().toLowerCase();
        if (!email || !isValidEmail(email)) {
          errors++;
          continue;
        }

        // Check if customer is subscribed to newsletter
        const isSubscribed = customer?.extension_attributes?.is_subscribed;
        
        // If is_subscribed is explicitly false, skip
        // If is_subscribed is undefined/null, we still import (Magento may not expose this field)
        // The user said "grande mailing" so we import all customers that have is_subscribed=true
        // or where the field is available and true
        if (isSubscribed === false) {
          skippedNoSub++;
          continue;
        }

        const name = [customer.firstname || '', customer.lastname || ''].filter(Boolean).join(' ').trim();
        const key = `${NEWSLETTER_PREFIX}${email}`;
        const existing = await kv.get(key);

        if (existing) {
          // Merge — update name if not set, add magento metadata
          const needsUpdate = !existing.name && name || 
                              !existing.magento_id && customer.id ||
                              !existing.magento_created_at && customer.created_at;
          if (needsUpdate) {
            await kv.set(key, {
              ...existing,
              name: existing.name || name,
              magento_id: existing.magento_id || customer.id,
              magento_created_at: existing.magento_created_at || customer.created_at,
              magento_is_subscribed: isSubscribed ?? null,
              updatedAt: new Date().toISOString(),
            });
            updated++;
          } else {
            skippedExisting++;
          }
          continue;
        }

        // New subscriber from Magento
        const subscriber = {
          email,
          name,
          whatsapp: '',
          source: 'magento',
          subscribedAt: customer.created_at || new Date().toISOString(),
          active: true,
          magento_id: customer.id,
          magento_created_at: customer.created_at || null,
          magento_group_id: customer.group_id || null,
          magento_is_subscribed: isSubscribed ?? null,
          importedAt: new Date().toISOString(),
        };

        await kv.set(key, subscriber);
        imported++;
      } catch (e: any) {
        errors++;
        console.error(`[newsletter-import] Error processing customer:`, e.message);
      }
    }

    // Update status
    status.current_page = nextPage;
    status.processed += customers.length;
    status.imported += imported;
    status.skipped_no_subscription += skippedNoSub;
    status.skipped_existing += skippedExisting;
    status.updated += updated;
    status.errors += errors;
    status.last_step_at = new Date().toISOString();
    status.elapsed_seconds = Math.round((Date.now() - new Date(status.started_at).getTime()) / 1000);

    const stepMs = Date.now() - t0;
    const pct = Math.round((status.current_page / status.total_pages) * 100);
    const remaining = status.total_pages - status.current_page;
    const avgMsPerPage = status.elapsed_seconds > 0 ? (status.elapsed_seconds * 1000) / status.current_page : stepMs;
    const etaSeconds = Math.round((remaining * avgMsPerPage) / 1000);
    const etaHuman = etaSeconds >= 60 ? `${Math.floor(etaSeconds / 60)}m ${etaSeconds % 60}s` : `${etaSeconds}s`;

    await kv.set(IMPORT_STATUS_KEY, status);

    // Check if this was the last page
    if (nextPage >= status.total_pages) {
      status.status = 'completed';
      status.completed_at = new Date().toISOString();
      status.elapsed_seconds = Math.round((Date.now() - new Date(status.started_at).getTime()) / 1000);
      await kv.set(IMPORT_STATUS_KEY, status);
      return c.json({ message: 'completed', status });
    }

    return c.json({
      message: 'step_done',
      page: nextPage,
      total_pages: status.total_pages,
      pct,
      step: {
        customers_fetched: customers.length,
        imported,
        skipped_no_subscription: skippedNoSub,
        skipped_existing: skippedExisting,
        updated,
        errors,
        step_ms: stepMs,
      },
      totals: {
        processed: status.processed,
        imported: status.imported,
        skipped_no_subscription: status.skipped_no_subscription,
        skipped_existing: status.skipped_existing,
        updated: status.updated,
        errors: status.errors,
      },
      performance: {
        eta_human: etaHuman,
        elapsed_seconds: status.elapsed_seconds,
      },
      status,
    });
  } catch (e: any) {
    console.error('[newsletter-import] step error:', e.message);
    // Save error to status but don't break — allow retry
    try {
      const status = await kv.get(IMPORT_STATUS_KEY);
      if (status) {
        status.last_error = e.message;
        status.errors = (status.errors || 0) + 1;
        await kv.set(IMPORT_STATUS_KEY, status);
      }
    } catch {}
    return c.json({ error: e.message, will_retry: true }, 500);
  }
});

// ── POST /import-magento/reset ──────────────────────────────────────────────
app.post('/import-magento/reset', async (c) => {
  try {
    await kv.del(IMPORT_STATUS_KEY);
    return c.json({ ok: true, message: 'Import status resetado' });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

export const newsletter = app;