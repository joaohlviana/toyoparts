import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';
import { fetchMagento } from './magento.tsx';
import { sendResendEmail } from './resend-mailer.tsx';

const app = new Hono();

const NEWSLETTER_PREFIX = 'newsletter:';
const NEWSLETTER_INDEX_KEY = 'meta:newsletter_index';
const IMPORT_STATUS_KEY = 'meta:newsletter_import_status';
const PAGE_SIZE = 100;

const NEWSLETTER_SYONET_URL = String(Deno.env.get('NEWSLETTER_SYONET_URL') || '').trim();
const NEWSLETTER_SYONET_ANON_KEY = String(Deno.env.get('NEWSLETTER_SYONET_ANON_KEY') || '').trim();
const HUBSPOT_PRIVATE_APP_TOKEN = String(
  Deno.env.get('HUBSPOT_PRIVATE_APP_TOKEN') || Deno.env.get('NEWSLETTER_HUBSPOT_PRIVATE_APP_TOKEN') || '',
).trim();

type NewsletterIntegrationStatus = 'success' | 'error' | 'pending_config' | 'skipped';

interface NewsletterIntegrationState {
  status: NewsletterIntegrationStatus;
  lastAttemptAt: string;
  lastSuccessAt?: string | null;
  error?: string | null;
  lastPayloadSignature?: string | null;
  leadId?: string | null;
  contactId?: string | null;
  response?: unknown;
}

interface NewsletterSubscriber {
  email: string;
  name: string;
  whatsapp: string;
  source: string;
  subscribedAt: string;
  updatedAt?: string;
  unsubscribedAt?: string;
  active: boolean;
  integrations?: {
    syonet?: NewsletterIntegrationState;
    hubspot?: NewsletterIntegrationState;
  };
  magento_id?: number | null;
  magento_created_at?: string | null;
  magento_group_id?: number | null;
  magento_is_subscribed?: boolean | null;
  importedAt?: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function trimText(value: unknown, maxLength = 240): string {
  return String(value || '').trim().slice(0, maxLength);
}

function extractErrorMessage(error: unknown): string {
  if (!error) return 'Erro desconhecido';
  if (error instanceof Error) return error.message;
  return trimText(error, 400) || 'Erro desconhecido';
}

function escapeHtml(value: unknown): string {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function parseJsonSafe(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizePhone(phone: string): string {
  if (!phone) return '';

  let digits = String(phone).replace(/\D+/g, '');

  while (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }

  while (digits.startsWith('0') && digits.length > 11) {
    digits = digits.slice(1);
  }

  if (digits.length > 11) {
    digits = digits.slice(-11);
  }

  return digits;
}

function isValidBrazilPhone(phone: string): boolean {
  return /^\d{10,11}$/.test(normalizePhone(phone));
}

function buildSubscriberSignature(subscriber: NewsletterSubscriber): string {
  return JSON.stringify({
    email: normalizeEmail(subscriber.email),
    name: trimText(subscriber.name, 120).toLowerCase(),
    whatsapp: normalizePhone(subscriber.whatsapp || ''),
  });
}

function buildDefaultIntegrationState(
  status: NewsletterIntegrationStatus,
  extras: Partial<NewsletterIntegrationState> = {},
): NewsletterIntegrationState {
  return {
    status,
    lastAttemptAt: new Date().toISOString(),
    ...extras,
  };
}

function deriveSubscriberName(subscriber: NewsletterSubscriber): string {
  const explicit = trimText(subscriber.name, 120);
  if (explicit) return explicit;

  const emailUser = String(subscriber.email || '').split('@')[0] || 'Lead Newsletter';
  return emailUser.replace(/[._-]+/g, ' ').trim() || 'Lead Newsletter';
}

function splitName(name: string) {
  const normalized = trimText(name, 120);
  if (!normalized) {
    return { firstName: '', lastName: '' };
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' '),
  };
}

function buildSyonetPayload(subscriber: NewsletterSubscriber) {
  const normalizedPhone = normalizePhone(subscriber.whatsapp || '');
  const phones = isValidBrazilPhone(normalizedPhone) ? [{ e164Number: `+55${normalizedPhone}` }] : [];

  return {
    customer: {
      name: deriveSubscriberName(subscriber),
      emails: [subscriber.email],
      phones,
    },
    event: {
      companyId: 2,
      eventGroup: 'OPORTUNIDADE',
      eventType: 'ACESSORIOS E PECAS WEB',
      source: 'INTERNET',
      media: 'GOOGLE',
      comment: 'Lead do Hubspot',
    },
    rules: {
      updateMainEmailPhone: true,
    },
  };
}

async function syncSubscriberToSyonet(
  subscriber: NewsletterSubscriber,
  previousState?: NewsletterIntegrationState,
): Promise<NewsletterIntegrationState> {
  const now = new Date().toISOString();
  const signature = buildSubscriberSignature(subscriber);

  if (previousState?.status === 'success' && previousState?.lastPayloadSignature === signature) {
    return {
      ...previousState,
      lastAttemptAt: now,
    };
  }

  if (!NEWSLETTER_SYONET_URL || !NEWSLETTER_SYONET_ANON_KEY) {
    return buildDefaultIntegrationState('pending_config', {
      error: 'Integracao Syonet nao configurada',
      lastPayloadSignature: signature,
    });
  }

  try {
    const response = await fetch(NEWSLETTER_SYONET_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NEWSLETTER_SYONET_ANON_KEY}`,
        apikey: NEWSLETTER_SYONET_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildSyonetPayload(subscriber)),
    });

    const rawBody = await response.text();
    const data = parseJsonSafe(rawBody);

    if (!response.ok || Number(data?.ok || 0) !== 1) {
      throw new Error(trimText(data?.error || data?.message || rawBody || `HTTP ${response.status}`, 400));
    }

    return {
      status: 'success',
      lastAttemptAt: now,
      lastSuccessAt: now,
      leadId: trimText(data?.msg, 80) || null,
      error: null,
      lastPayloadSignature: signature,
      response: data,
    };
  } catch (error) {
    return {
      status: 'error',
      lastAttemptAt: now,
      lastSuccessAt: previousState?.lastSuccessAt || null,
      leadId: previousState?.leadId || null,
      error: extractErrorMessage(error),
      lastPayloadSignature: signature,
      response: previousState?.response,
    };
  }
}

async function hubspotRequest(path: string, init: RequestInit) {
  const response = await fetch(`https://api.hubapi.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${HUBSPOT_PRIVATE_APP_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  const rawBody = await response.text();
  const data = parseJsonSafe(rawBody);

  if (!response.ok) {
    throw new Error(trimText(data?.message || data?.error || rawBody || `HTTP ${response.status}`, 400));
  }

  return data;
}

async function syncSubscriberToHubSpot(
  subscriber: NewsletterSubscriber,
  previousState?: NewsletterIntegrationState,
): Promise<NewsletterIntegrationState> {
  const now = new Date().toISOString();
  const signature = buildSubscriberSignature(subscriber);

  if (previousState?.status === 'success' && previousState?.lastPayloadSignature === signature) {
    return {
      ...previousState,
      lastAttemptAt: now,
    };
  }

  if (!HUBSPOT_PRIVATE_APP_TOKEN) {
    return buildDefaultIntegrationState('pending_config', {
      error: 'HubSpot nao configurado',
      lastPayloadSignature: signature,
    });
  }

  try {
    const normalizedPhone = normalizePhone(subscriber.whatsapp || '');
    const name = splitName(deriveSubscriberName(subscriber));

    const search = await hubspotRequest('/crm/v3/objects/contacts/search', {
      method: 'POST',
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'email',
                operator: 'EQ',
                value: subscriber.email,
              },
            ],
          },
        ],
        properties: ['email', 'firstname', 'lastname', 'phone'],
        limit: 1,
      }),
    });

    const properties: Record<string, string> = {
      email: subscriber.email,
      firstname: name.firstName,
    };

    if (name.lastName) {
      properties.lastname = name.lastName;
    }

    if (isValidBrazilPhone(normalizedPhone)) {
      properties.phone = `+55${normalizedPhone}`;
    }

    const existingId = trimText(search?.results?.[0]?.id, 80);
    let contactId = existingId || null;

    if (existingId) {
      await hubspotRequest(`/crm/v3/objects/contacts/${existingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties }),
      });
    } else {
      const created = await hubspotRequest('/crm/v3/objects/contacts', {
        method: 'POST',
        body: JSON.stringify({
          properties: {
            ...properties,
            lifecyclestage: 'lead',
          },
        }),
      });
      contactId = trimText(created?.id, 80) || null;
    }

    return {
      status: 'success',
      lastAttemptAt: now,
      lastSuccessAt: now,
      contactId,
      error: null,
      lastPayloadSignature: signature,
      response: { contactId },
    };
  } catch (error) {
    return {
      status: 'error',
      lastAttemptAt: now,
      lastSuccessAt: previousState?.lastSuccessAt || null,
      contactId: previousState?.contactId || null,
      error: extractErrorMessage(error),
      lastPayloadSignature: signature,
      response: previousState?.response,
    };
  }
}

async function syncNewsletterIntegrations(
  subscriber: NewsletterSubscriber,
  existing?: Partial<NewsletterSubscriber> | null,
) {
  const previousIntegrations = existing?.integrations || {};

  const [syonet, hubspot] = await Promise.all([
    syncSubscriberToSyonet(subscriber, previousIntegrations.syonet),
    syncSubscriberToHubSpot(subscriber, previousIntegrations.hubspot),
  ]);

  return {
    syonet,
    hubspot,
  };
}

async function sendNewsletterConfirmationEmail(subscriber: NewsletterSubscriber) {
  const safeEmail = normalizeEmail(subscriber.email);
  if (!safeEmail || !isValidEmail(safeEmail)) {
    return { sent: false, reason: 'invalid_email' };
  }

  const safeName = escapeHtml(deriveSubscriberName(subscriber));
  const safeEmailHtml = escapeHtml(safeEmail);
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e2e8f0;">
            <tr>
              <td style="padding:28px 32px;background:#fff5f5;border-bottom:1px solid #fecaca;">
                <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#EB0A1E;">Newsletter Toyoparts</p>
                <h1 style="margin:10px 0 0;font-size:28px;line-height:1.2;color:#0f172a;">Seu cadastro foi enviado com sucesso.</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 14px;font-size:16px;line-height:1.8;color:#334155;">Olá, <strong>${safeName}</strong>.</p>
                <p style="margin:0 0 14px;font-size:16px;line-height:1.8;color:#334155;">Recebemos sua inscrição na newsletter da Toyoparts e seu contato já foi registrado com sucesso.</p>
                <div style="margin:24px 0;padding:18px 20px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0;">
                  <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#64748b;">E-mail cadastrado</p>
                  <p style="margin:0;font-size:15px;font-weight:600;color:#0f172a;">${safeEmailHtml}</p>
                </div>
                <p style="margin:0;font-size:14px;line-height:1.8;color:#64748b;">Se precisar falar com a equipe, basta responder este e-mail ou falar conosco em <a href="mailto:atendimento@toyoparts.com.br" style="color:#EB0A1E;text-decoration:none;font-weight:600;">atendimento@toyoparts.com.br</a>.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  try {
    const { data } = await sendResendEmail({
      to: [safeEmail],
      subject: 'Recebemos sua inscrição na Toyoparts',
      html,
      includeInternalBcc: true,
    });

    return { sent: true, id: data?.id || null };
  } catch (error) {
    console.error('[newsletter] confirmation email error:', extractErrorMessage(error));
    return { sent: false, reason: extractErrorMessage(error) };
  }
}

app.post('/subscribe', async (c) => {
  try {
    const body = await c.req.json();
    const email = normalizeEmail(body.email || '');

    if (!email || !isValidEmail(email)) {
      return c.json({ error: 'E-mail invalido', code: 'INVALID_EMAIL' }, 400);
    }

    const key = `${NEWSLETTER_PREFIX}${email}`;
    const existing = await kv.get(key) as NewsletterSubscriber | null;

    if (existing) {
      const updated: NewsletterSubscriber = {
        ...existing,
        name: body.name || existing.name || '',
        whatsapp: body.whatsapp ? normalizePhone(body.whatsapp) : existing.whatsapp || '',
        source: body.source || existing.source || 'unknown',
        updatedAt: new Date().toISOString(),
      };

      updated.integrations = await syncNewsletterIntegrations(updated, existing);
      await kv.set(key, updated);

      return c.json({
        ok: true,
        status: 'updated',
        message: 'Dados atualizados com sucesso!',
        integrations: updated.integrations,
      });
    }

    const subscriber: NewsletterSubscriber = {
      email,
      name: body.name || '',
      whatsapp: body.whatsapp ? normalizePhone(body.whatsapp) : '',
      source: body.source || 'unknown',
      subscribedAt: new Date().toISOString(),
      active: true,
    };

    subscriber.integrations = await syncNewsletterIntegrations(subscriber);
    await kv.set(key, subscriber);

    const confirmationEmail = await sendNewsletterConfirmationEmail(subscriber);

    try {
      const index: string[] = (await kv.get(NEWSLETTER_INDEX_KEY)) || [];
      if (!index.includes(email)) {
        index.push(email);
        await kv.set(NEWSLETTER_INDEX_KEY, index);
      }
    } catch (error) {
      console.error('[newsletter] Index update failed (non-blocking):', extractErrorMessage(error));
    }

    console.log(`[newsletter] New subscriber: ${email} (source: ${subscriber.source})`);
    return c.json({
      ok: true,
      status: 'subscribed',
      message: 'Inscrição realizada com sucesso!',
      integrations: subscriber.integrations,
      confirmation_email: confirmationEmail,
    });
  } catch (error) {
    console.error('[newsletter] subscribe error:', extractErrorMessage(error));
    return c.json({ error: `Erro ao processar inscrição: ${extractErrorMessage(error)}` }, 500);
  }
});

app.post('/unsubscribe', async (c) => {
  try {
    const { email } = await c.req.json();
    const normalized = normalizeEmail(email || '');
    if (!normalized) return c.json({ error: 'E-mail obrigatorio' }, 400);

    const key = `${NEWSLETTER_PREFIX}${normalized}`;
    const existing = await kv.get(key) as NewsletterSubscriber | null;

    if (!existing) {
      return c.json({ ok: true, message: 'E-mail nao encontrado na lista' });
    }

    await kv.set(key, { ...existing, active: false, unsubscribedAt: new Date().toISOString() });

    console.log(`[newsletter] Unsubscribed: ${normalized}`);
    return c.json({ ok: true, message: 'Inscrição cancelada com sucesso' });
  } catch (error) {
    console.error('[newsletter] unsubscribe error:', extractErrorMessage(error));
    return c.json({ error: extractErrorMessage(error) }, 500);
  }
});

app.get('/subscribers', async (c) => {
  try {
    const all = await kv.getByPrefix(NEWSLETTER_PREFIX);
    const subscribers = (all || [])
      .filter((subscriber: any) => subscriber && subscriber.email)
      .sort((left: any, right: any) => (right.subscribedAt || '').localeCompare(left.subscribedAt || ''));

    const active = subscribers.filter((subscriber: any) => subscriber.active !== false);
    const inactive = subscribers.filter((subscriber: any) => subscriber.active === false);

    return c.json({
      total: subscribers.length,
      active: active.length,
      inactive: inactive.length,
      subscribers,
    });
  } catch (error) {
    console.error('[newsletter] list error:', extractErrorMessage(error));
    return c.json({ error: extractErrorMessage(error) }, 500);
  }
});

app.get('/stats', async (c) => {
  try {
    const all = await kv.getByPrefix(NEWSLETTER_PREFIX);
    const subscribers = (all || []).filter((subscriber: any) => subscriber && subscriber.email);
    const active = subscribers.filter((subscriber: any) => subscriber.active !== false);

    const bySource: Record<string, number> = {};
    for (const subscriber of active) {
      const source = subscriber.source || 'unknown';
      bySource[source] = (bySource[source] || 0) + 1;
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recent = active.filter((subscriber: any) => subscriber.subscribedAt >= sevenDaysAgo);

    const syonetSuccess = active.filter((subscriber: any) => subscriber?.integrations?.syonet?.status === 'success').length;
    const syonetError = active.filter((subscriber: any) => subscriber?.integrations?.syonet?.status === 'error').length;
    const syonetPending = active.filter((subscriber: any) =>
      ['pending_config', 'skipped', ''].includes(String(subscriber?.integrations?.syonet?.status || ''))
    ).length;

    const hubspotSuccess = active.filter((subscriber: any) => subscriber?.integrations?.hubspot?.status === 'success').length;
    const hubspotError = active.filter((subscriber: any) => subscriber?.integrations?.hubspot?.status === 'error').length;
    const hubspotPending = active.filter((subscriber: any) =>
      ['pending_config', 'skipped', ''].includes(String(subscriber?.integrations?.hubspot?.status || ''))
    ).length;

    return c.json({
      total: subscribers.length,
      active: active.length,
      recent_7d: recent.length,
      by_source: bySource,
      integrations: {
        syonet: {
          success: syonetSuccess,
          error: syonetError,
          pending: syonetPending,
        },
        hubspot: {
          success: hubspotSuccess,
          error: hubspotError,
          pending: hubspotPending,
        },
      },
    });
  } catch (error) {
    return c.json({ error: extractErrorMessage(error) }, 500);
  }
});

app.get('/import-magento/status', async (c) => {
  try {
    const status = await kv.get(IMPORT_STATUS_KEY);
    if (!status) return c.json({ status: 'idle' });
    return c.json(status);
  } catch (error) {
    return c.json({ error: extractErrorMessage(error) }, 500);
  }
});

app.post('/import-magento/start', async (c) => {
  try {
    const existing = await kv.get(IMPORT_STATUS_KEY);
    if ((existing as any)?.status === 'running') {
      return c.json({ error: 'Import ja em andamento', status: existing }, 409);
    }

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
  } catch (error) {
    console.error('[newsletter-import] start error:', extractErrorMessage(error));
    return c.json({ error: extractErrorMessage(error) }, 500);
  }
});

app.post('/import-magento/step', async (c) => {
  const startedAt = Date.now();

  try {
    const status = await kv.get(IMPORT_STATUS_KEY) as any;
    if (!status || status.status !== 'running') {
      return c.json({ error: 'Import nao esta rodando. Execute /start primeiro.', status: status?.status || 'idle' }, 400);
    }

    const nextPage = status.current_page + 1;
    if (nextPage > status.total_pages) {
      status.status = 'completed';
      status.completed_at = new Date().toISOString();
      status.elapsed_seconds = Math.round((Date.now() - new Date(status.started_at).getTime()) / 1000);
      await kv.set(IMPORT_STATUS_KEY, status);
      return c.json({ message: 'completed', status });
    }

    console.log(`[newsletter-import] Fetching page ${nextPage}/${status.total_pages}...`);
    const data = await fetchMagento('/V1/customers/search', {
      'searchCriteria[currentPage]': String(nextPage),
      'searchCriteria[pageSize]': String(PAGE_SIZE),
      'searchCriteria[sortOrders][0][field]': 'entity_id',
      'searchCriteria[sortOrders][0][direction]': 'ASC',
    });

    const customers = data?.items || [];
    let imported = 0;
    let skippedNoSubscription = 0;
    let skippedExisting = 0;
    let updated = 0;
    let errors = 0;

    for (const customer of customers) {
      try {
        const email = normalizeEmail(customer.email || '');
        if (!email || !isValidEmail(email)) {
          errors++;
          continue;
        }

        const isSubscribed = customer?.extension_attributes?.is_subscribed;
        if (isSubscribed === false) {
          skippedNoSubscription++;
          continue;
        }

        const name = [customer.firstname || '', customer.lastname || ''].filter(Boolean).join(' ').trim();
        const key = `${NEWSLETTER_PREFIX}${email}`;
        const existing = await kv.get(key) as NewsletterSubscriber | null;

        if (existing) {
          const needsUpdate =
            (!existing.name && !!name) ||
            (!existing.magento_id && !!customer.id) ||
            (!existing.magento_created_at && !!customer.created_at);

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

        const subscriber: NewsletterSubscriber = {
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
      } catch (error) {
        errors++;
        console.error('[newsletter-import] Error processing customer:', extractErrorMessage(error));
      }
    }

    status.current_page = nextPage;
    status.processed += customers.length;
    status.imported += imported;
    status.skipped_no_subscription += skippedNoSubscription;
    status.skipped_existing += skippedExisting;
    status.updated += updated;
    status.errors += errors;
    status.last_step_at = new Date().toISOString();
    status.elapsed_seconds = Math.round((Date.now() - new Date(status.started_at).getTime()) / 1000);

    const stepMs = Date.now() - startedAt;
    const pct = Math.round((status.current_page / status.total_pages) * 100);
    const remaining = status.total_pages - status.current_page;
    const avgMsPerPage = status.elapsed_seconds > 0
      ? (status.elapsed_seconds * 1000) / status.current_page
      : stepMs;
    const etaSeconds = Math.round((remaining * avgMsPerPage) / 1000);
    const etaHuman = etaSeconds >= 60
      ? `${Math.floor(etaSeconds / 60)}m ${etaSeconds % 60}s`
      : `${etaSeconds}s`;

    await kv.set(IMPORT_STATUS_KEY, status);

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
        skipped_no_subscription: skippedNoSubscription,
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
  } catch (error) {
    console.error('[newsletter-import] step error:', extractErrorMessage(error));
    try {
      const status = await kv.get(IMPORT_STATUS_KEY) as any;
      if (status) {
        status.last_error = extractErrorMessage(error);
        status.errors = (status.errors || 0) + 1;
        await kv.set(IMPORT_STATUS_KEY, status);
      }
    } catch {
      // ignore status persistence failures
    }

    return c.json({ error: extractErrorMessage(error), will_retry: true }, 500);
  }
});

app.post('/import-magento/reset', async (c) => {
  try {
    await kv.del(IMPORT_STATUS_KEY);
    return c.json({ ok: true, message: 'Import status resetado' });
  } catch (error) {
    return c.json({ error: extractErrorMessage(error) }, 500);
  }
});

export const newsletter = app;
