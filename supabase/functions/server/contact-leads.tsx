import { Hono } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2.49.8';
import * as kv from './kv_store.tsx';
import { sendResendEmail } from './resend-mailer.tsx';

const publicApp = new Hono();
const adminApp = new Hono();

const CONTACT_LEAD_PREFIX = 'contact_lead:';
const CONTACT_LEAD_INDEX_KEY = 'meta:contact_lead_index';
const KV_TABLE = 'kv_store_1d6e33e0';
const CONTACT_SYONET_URL = String(
  Deno.env.get('CONTACT_SYONET_URL') || Deno.env.get('NEWSLETTER_SYONET_URL') || '',
).trim();
const CONTACT_SYONET_ANON_KEY = String(
  Deno.env.get('CONTACT_SYONET_ANON_KEY') || Deno.env.get('NEWSLETTER_SYONET_ANON_KEY') || '',
).trim();
const CONTACT_LEADS_SCAN_TIMEOUT_MS = Math.max(
  5000,
  Number(Deno.env.get('CONTACT_LEADS_SCAN_TIMEOUT_MS') || 12000),
);
const CONTACT_LEADS_BATCH_SIZE = Math.max(
  100,
  Number(Deno.env.get('CONTACT_LEADS_BATCH_SIZE') || 250),
);

type ContactChannel = 'whatsapp' | 'email' | 'phone';
type ContactIntegrationStatus = 'success' | 'error' | 'pending_config' | 'skipped';

interface ContactIntegrationState {
  status: ContactIntegrationStatus;
  lastAttemptAt: string;
  lastSuccessAt?: string | null;
  error?: string | null;
  lastPayloadSignature?: string | null;
  leadId?: string | null;
  response?: unknown;
}

interface ContactLeadRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  normalizedPhone: string;
  message: string;
  preferredChannel: ContactChannel;
  source: 'contact_page';
  pagePath: string;
  submittedAt: string;
  updatedAt?: string;
  integrations?: {
    syonet?: ContactIntegrationState;
    hubspot?: ContactIntegrationState;
  };
}

function createServiceClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service role indisponivel para leitura resiliente dos leads.');
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

async function runDirectQuery<T>(promise: Promise<T>, label: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`[contact-leads] ${label} timed out after ${CONTACT_LEADS_SCAN_TIMEOUT_MS}ms`)), CONTACT_LEADS_SCAN_TIMEOUT_MS);
    }),
  ]);
}

function trimText(value: unknown, maxLength = 500): string {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

function parseJsonSafe(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractErrorMessage(error: unknown): string {
  if (!error) return 'Erro desconhecido';
  if (error instanceof Error) return error.message;
  return trimText(error, 400) || 'Erro desconhecido';
}

function sanitizeLeadIdList(value: unknown): string[] {
  const ids = Array.isArray((value as any)?.ids)
    ? (value as any).ids
    : Array.isArray(value)
      ? value
      : [];
  return Array.from(new Set(ids.map((item) => String(item || '').trim()).filter(Boolean)));
}

async function readContactLeadIndex(): Promise<string[]> {
  const stored = await kv.get(CONTACT_LEAD_INDEX_KEY).catch(() => null);
  return sanitizeLeadIdList(stored);
}

async function writeContactLeadIndex(ids: string[]) {
  const uniqueIds = sanitizeLeadIdList(ids);
  await kv.set(CONTACT_LEAD_INDEX_KEY, {
    ids: uniqueIds,
    updated_at: new Date().toISOString(),
  });
}

async function rememberContactLeadId(leadId: string) {
  const safeLeadId = trimText(leadId, 80);
  if (!safeLeadId) return;
  try {
    const current = await readContactLeadIndex();
    if (current.includes(safeLeadId)) return;
    await writeContactLeadIndex([safeLeadId, ...current]);
  } catch (error) {
    console.warn('[contact-leads] failed to update lead index:', extractErrorMessage(error));
  }
}

async function readContactLeadsByKeysDirect(keys: string[]): Promise<ContactLeadRecord[]> {
  if (!keys.length) return [];

  const supabase = createServiceClient();
  const leads: ContactLeadRecord[] = [];

  for (let index = 0; index < keys.length; index += 200) {
    const chunk = keys.slice(index, index + 200);
    const query = supabase
      .from(KV_TABLE)
      .select('value')
      .in('key', chunk);

    const { data, error } = await runDirectQuery(
      query,
      `exact-key-read:${index / 200}`,
    );

    if (error) {
      throw new Error(error.message || 'Falha ao ler leads por chave exata.');
    }

    leads.push(
      ...((data || []) as Array<{ value: ContactLeadRecord }>)
        .map((row) => row?.value)
        .filter((lead): lead is ContactLeadRecord => Boolean(lead?.id)),
    );
  }

  return leads;
}

async function readContactLeadsFromIndex(): Promise<ContactLeadRecord[]> {
  const ids = await readContactLeadIndex();
  if (!ids.length) return [];

  const keys = ids.map((id) => `${CONTACT_LEAD_PREFIX}${id}`);
  const leads = await readContactLeadsByKeysDirect(keys);
  if (leads.length && leads.length !== ids.length) {
    await writeContactLeadIndex(leads.map((lead) => lead.id)).catch(() => {});
  }
  return leads;
}

async function readContactLeadsDirect(): Promise<ContactLeadRecord[]> {
  const supabase = createServiceClient();
  const leads: ContactLeadRecord[] = [];
  let from = 0;

  while (true) {
    const query = supabase
      .from(KV_TABLE)
      .select('value')
      .like('key', `${CONTACT_LEAD_PREFIX}%`)
      .order('key', { ascending: true })
      .range(from, from + CONTACT_LEADS_BATCH_SIZE - 1);

    const { data, error } = await runDirectQuery(
      query,
      `prefix-scan:${from}`,
    );

    if (error) {
      throw new Error(error.message || 'Falha ao carregar leads via leitura direta.');
    }

    const rows = (data || []) as Array<{ value: ContactLeadRecord }>;
    if (!rows.length) break;

    leads.push(
      ...rows
        .map((row) => row?.value)
        .filter((lead): lead is ContactLeadRecord => Boolean(lead?.id)),
    );

    if (rows.length < CONTACT_LEADS_BATCH_SIZE) break;
    from += CONTACT_LEADS_BATCH_SIZE;
  }

  if (leads.length) {
    await writeContactLeadIndex(leads.map((lead) => lead.id)).catch(() => {});
  }

  return leads;
}

async function getContactLeadRecord(id: string): Promise<ContactLeadRecord | null> {
  const safeId = trimText(id, 80);
  if (!safeId) return null;

  const key = `${CONTACT_LEAD_PREFIX}${safeId}`;
  let lead = await kv.get(key).catch(() => null);
  if (!lead) {
    try {
      const direct = await readContactLeadsByKeysDirect([key]);
      lead = direct[0] || null;
    } catch (error) {
      console.warn('[contact-leads] direct lead read failed:', extractErrorMessage(error));
    }
  }

  return lead && lead.id ? lead as ContactLeadRecord : null;
}

function escapeHtml(value: unknown): string {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildPayloadSignature(lead: ContactLeadRecord): string {
  return JSON.stringify({
    name: trimText(lead.name, 120).toLowerCase(),
    email: normalizeEmail(lead.email),
    phone: normalizePhone(lead.phone),
    message: trimText(lead.message, 500).toLowerCase(),
    preferredChannel: lead.preferredChannel,
  });
}

function buildLeadComment(lead: ContactLeadRecord): string {
  const channelLabel = lead.preferredChannel === 'whatsapp'
    ? 'WhatsApp'
    : lead.preferredChannel === 'email'
      ? 'E-mail'
      : 'Telefone';

  const lines = [
    'Lead do Fale Conosco Toyoparts',
    `Canal preferido: ${channelLabel}`,
    lead.pagePath ? `Pagina: ${lead.pagePath}` : '',
    lead.message ? `Mensagem: ${trimText(lead.message, 900)}` : '',
  ].filter(Boolean);

  return lines.join(' | ');
}

function buildSyonetPayload(lead: ContactLeadRecord) {
  const emails = lead.email && isValidEmail(lead.email) ? [lead.email] : [];
  const phones = isValidBrazilPhone(lead.normalizedPhone) ? [{ e164Number: `+55${lead.normalizedPhone}` }] : [];

  return {
    customer: {
      name: trimText(lead.name, 120) || 'Lead Fale Conosco',
      emails,
      phones,
    },
    event: {
      companyId: 2,
      eventGroup: 'OPORTUNIDADE',
      eventType: 'ACESSORIOS E PECAS WEB',
      source: 'INTERNET',
      media: 'GOOGLE',
      comment: buildLeadComment(lead),
    },
    rules: {
      updateMainEmailPhone: true,
    },
  };
}

function hasSyonetContact(lead: ContactLeadRecord): boolean {
  return isValidEmail(lead.email) || isValidBrazilPhone(lead.normalizedPhone);
}

function buildDefaultIntegrationState(
  status: ContactIntegrationStatus,
  extras: Partial<ContactIntegrationState> = {},
): ContactIntegrationState {
  return {
    status,
    lastAttemptAt: new Date().toISOString(),
    ...extras,
  };
}

async function syncLeadToSyonet(
  lead: ContactLeadRecord,
  previousState?: ContactIntegrationState,
): Promise<ContactIntegrationState> {
  const now = new Date().toISOString();
  const signature = buildPayloadSignature(lead);

  if (!hasSyonetContact(lead)) {
    return buildDefaultIntegrationState('skipped', {
      error: 'Syonet exige e-mail valido ou telefone valido com DDD',
      lastPayloadSignature: signature,
    });
  }

  if (previousState?.status === 'success' && previousState?.lastPayloadSignature === signature) {
    return {
      ...previousState,
      lastAttemptAt: now,
    };
  }

  if (!CONTACT_SYONET_URL || !CONTACT_SYONET_ANON_KEY) {
    return buildDefaultIntegrationState('pending_config', {
      error: 'Integracao Syonet nao configurada',
      lastPayloadSignature: signature,
    });
  }

  try {
    const response = await fetch(CONTACT_SYONET_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CONTACT_SYONET_ANON_KEY}`,
        apikey: CONTACT_SYONET_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildSyonetPayload(lead)),
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

async function loadContactLeads(): Promise<ContactLeadRecord[]> {
  let leads: ContactLeadRecord[] = [];

  try {
    leads = await readContactLeadsFromIndex();
  } catch (error) {
    console.warn('[contact-leads] lead index read failed:', extractErrorMessage(error));
  }

  if (!leads.length) {
    try {
      const all = await kv.getByPrefix(CONTACT_LEAD_PREFIX);
      leads = (Array.isArray(all) ? all : [])
        .filter((lead: any): lead is ContactLeadRecord => Boolean(lead?.id));
      if (leads.length) {
        await writeContactLeadIndex(leads.map((lead) => lead.id)).catch(() => {});
      }
    } catch (error) {
      console.warn('[contact-leads] prefix scan failed, trying direct fallback:', extractErrorMessage(error));
    }
  }

  if (!leads.length) {
    try {
      leads = await readContactLeadsDirect();
    } catch (error) {
      console.warn('[contact-leads] direct scan failed:', extractErrorMessage(error));
    }
  }

  return leads
    .filter((lead) => lead && lead.id)
    .sort((left: ContactLeadRecord, right: ContactLeadRecord) =>
      String(right.submittedAt || '').localeCompare(String(left.submittedAt || '')),
    );
}

function buildStats(leads: ContactLeadRecord[]) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recent = leads.filter((lead) => lead.submittedAt >= sevenDaysAgo);
  const whatsapp = leads.filter((lead) => lead.preferredChannel === 'whatsapp').length;
  const email = leads.filter((lead) => lead.preferredChannel === 'email').length;
  const phone = leads.filter((lead) => lead.preferredChannel === 'phone').length;
  const syonetSuccess = leads.filter((lead) => lead.integrations?.syonet?.status === 'success').length;
  const syonetError = leads.filter((lead) => lead.integrations?.syonet?.status === 'error').length;
  const syonetSkipped = leads.filter((lead) => lead.integrations?.syonet?.status === 'skipped').length;
  const syonetPending = leads.filter((lead) =>
    ['pending_config', ''].includes(String(lead.integrations?.syonet?.status || '')),
  ).length;
  const hubspotSuccess = leads.filter((lead) => lead.integrations?.hubspot?.status === 'success').length;
  const hubspotError = leads.filter((lead) => lead.integrations?.hubspot?.status === 'error').length;
  const hubspotPending = leads.filter((lead) =>
    ['pending_config', 'skipped', ''].includes(String(lead.integrations?.hubspot?.status || '')),
  ).length;

  return {
    total: leads.length,
    recent_7d: recent.length,
    by_channel: {
      whatsapp,
      email,
      phone,
    },
    integrations: {
      syonet: {
        success: syonetSuccess,
        error: syonetError,
        pending: syonetPending,
        skipped: syonetSkipped,
      },
      hubspot: {
        success: hubspotSuccess,
        error: hubspotError,
        pending: hubspotPending,
      },
    },
  };
}

async function sendContactConfirmationEmail(lead: ContactLeadRecord) {
  const safeEmail = normalizeEmail(lead.email);
  if (!safeEmail || !isValidEmail(safeEmail)) {
    return { sent: false, reason: 'invalid_email' };
  }

  const channelLabel = lead.preferredChannel === 'whatsapp'
    ? 'WhatsApp'
    : lead.preferredChannel === 'email'
      ? 'E-mail'
      : 'Telefone';

  const safeName = escapeHtml(trimText(lead.name, 120) || 'Cliente');
  const safeMessage = escapeHtml(trimText(lead.message, 700));
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e2e8f0;">
            <tr>
              <td style="padding:28px 32px;background:#fff5f5;border-bottom:1px solid #fecaca;">
                <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#EB0A1E;">Fale Conosco Toyoparts</p>
                <h1 style="margin:10px 0 0;font-size:28px;line-height:1.2;color:#0f172a;">Seu contato foi enviado com sucesso.</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 14px;font-size:16px;line-height:1.8;color:#334155;">Olá, <strong>${safeName}</strong>.</p>
                <p style="margin:0 0 14px;font-size:16px;line-height:1.8;color:#334155;">Recebemos sua mensagem na Toyoparts e ela já foi encaminhada para o nosso atendimento.</p>
                <div style="margin:24px 0;padding:18px 20px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0;">
                  <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#64748b;">Canal escolhido</p>
                  <p style="margin:0;font-size:15px;font-weight:600;color:#0f172a;">${channelLabel}</p>
                </div>
                ${lead.message ? `<div style="margin:24px 0;padding:18px 20px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0;">
                  <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#64748b;">Resumo enviado</p>
                  <p style="margin:0;font-size:15px;line-height:1.7;color:#334155;">${safeMessage}</p>
                </div>` : ''}
                <p style="margin:0;font-size:14px;line-height:1.8;color:#64748b;">Se quiser complementar alguma informação, basta responder este e-mail. O retorno vai direto para <a href="mailto:atendimento@toyoparts.com.br" style="color:#EB0A1E;text-decoration:none;font-weight:600;">atendimento@toyoparts.com.br</a>.</p>
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
      subject: 'Recebemos seu contato na Toyoparts',
      html,
      includeInternalBcc: true,
    });

    return { sent: true, id: data?.id || null };
  } catch (error) {
    console.error('[contact-leads] confirmation email error:', extractErrorMessage(error));
    return { sent: false, reason: extractErrorMessage(error) };
  }
}

publicApp.post('/submit', async (c) => {
  try {
    const body = await c.req.json();

    const name = trimText(body.name, 120);
    const email = normalizeEmail(body.email || '');
    const phone = trimText(body.phone, 40);
    const normalizedPhone = normalizePhone(phone);
    const message = trimText(body.message, 1500);
    const preferredChannel: ContactChannel = body.preferredChannel === 'email'
      ? 'email'
      : body.preferredChannel === 'phone'
        ? 'phone'
        : 'whatsapp';
    const pagePath = trimText(body.pagePath, 200) || '/fale-conosco';

    if (!name && !email && !phone && !message) {
      return c.json({ error: 'Preencha ao menos um campo para registrar o contato.' }, 400);
    }

    const lead: ContactLeadRecord = {
      id: crypto.randomUUID(),
      name,
      email,
      phone,
      normalizedPhone,
      message,
      preferredChannel,
      source: 'contact_page',
      pagePath,
      submittedAt: new Date().toISOString(),
    };

    lead.integrations = {
      syonet: await syncLeadToSyonet(lead),
    };

    await kv.set(`${CONTACT_LEAD_PREFIX}${lead.id}`, lead);
    await rememberContactLeadId(lead.id);

    const confirmationEmail = await sendContactConfirmationEmail(lead);

    return c.json({
      ok: true,
      leadId: lead.id,
      message: 'Contato registrado com sucesso.',
      integrations: lead.integrations,
      confirmation_email: confirmationEmail,
    });
  } catch (error) {
    console.error('[contact-leads] submit error:', extractErrorMessage(error));
    return c.json({ error: extractErrorMessage(error) }, 500);
  }
});

adminApp.get('/leads', async (c) => {
  try {
    const leads = await loadContactLeads();
    return c.json({
      total: leads.length,
      leads,
    });
  } catch (error) {
    return c.json({ error: extractErrorMessage(error) }, 500);
  }
});

adminApp.get('/stats', async (c) => {
  try {
    const leads = await loadContactLeads();
    return c.json(buildStats(leads));
  } catch (error) {
    return c.json({ error: extractErrorMessage(error) }, 500);
  }
});

adminApp.post('/:id/retry-syonet', async (c) => {
  try {
    const id = trimText(c.req.param('id'), 80);
    if (!id) return c.json({ error: 'Lead invalido' }, 400);

    const key = `${CONTACT_LEAD_PREFIX}${id}`;
    const existing = await getContactLeadRecord(id);
    if (!existing) return c.json({ error: 'Lead nao encontrado' }, 404);

    const updated: ContactLeadRecord = {
      ...existing,
      updatedAt: new Date().toISOString(),
      integrations: {
        ...existing.integrations,
        syonet: await syncLeadToSyonet(existing, existing.integrations?.syonet),
      },
    };

    await kv.set(key, updated);

    return c.json({
      ok: true,
      lead: updated,
    });
  } catch (error) {
    return c.json({ error: extractErrorMessage(error) }, 500);
  }
});

export const contactLeads = publicApp;
export const contactLeadsAdmin = adminApp;
