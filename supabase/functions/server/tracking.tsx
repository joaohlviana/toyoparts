import { Hono } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2.49.8';
import * as kv from './kv_store.tsx';
import {
  TRACKING_SCHEMA_VERSION,
  type MarketingEventName,
  type MarketingTrackingEvent,
  type MarketingUserData,
  extractAttributionSnapshot,
  toCurrencyNumber,
} from './marketing.tsx';
import { upsertWhatsAppLeadFromEvent } from './performance-marketing.tsx';

const app = new Hono();

const VALID_EVENTS = new Set<MarketingEventName>([
  'page_view',
  'view_item',
  'add_to_cart',
  'remove_from_cart',
  'begin_checkout',
  'purchase_paid',
  'refund',
  'whatsapp_click',
  'whatsapp_banner_lead',
  'search_performed',
  'search_result_click',
  'search_zero_results',
]);

const DEDUP_PREFIX = 'event_dedup:';
const PURCHASE_PREFIX = 'purchase_sent:';
const EVENT_LOG_PREFIX = 'event_log:';
const WHATSAPP_LEAD_CAPTURE_PREFIX = 'whatsapp_lead_capture:';
const KV_TABLE = 'kv_store_1d6e33e0';
const TRACKING_WRITE_TIMEOUT_MS = Math.max(5000, Number(Deno.env.get('TRACKING_WRITE_TIMEOUT_MS') || 12000));

function isValidEventName(value: unknown): value is MarketingEventName {
  return VALID_EVENTS.has(value as MarketingEventName);
}

function createServiceClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service role indisponivel para gravacao resiliente do tracking.');
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

async function writeKvDirect(key: string, value: unknown): Promise<void> {
  const supabase = createServiceClient();
  const query = supabase
    .from(KV_TABLE)
    .upsert({ key, value });

  const { error } = await Promise.race([
    query,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`[tracking] direct KV write timed out for key ${key}`)), TRACKING_WRITE_TIMEOUT_MS);
    }),
  ]);

  if (error) {
    throw new Error(error.message || `Falha ao gravar chave ${key}`);
  }
}

async function setKvValueSafe(key: string, value: unknown, label: string): Promise<void> {
  try {
    await kv.set(key, value);
  } catch (error) {
    console.warn(`[Tracking] kv.set failed for ${label}, trying direct fallback:`, error);
    await writeKvDirect(key, value);
  }
}

async function listKvValuesDirectByPrefix(prefix: string): Promise<any[]> {
  const supabase = createServiceClient();
  const values: any[] = [];
  let from = 0;
  const batchSize = 500;

  while (true) {
    const query = supabase
      .from(KV_TABLE)
      .select('value')
      .like('key', `${prefix}%`)
      .range(from, from + batchSize - 1);

    const { data, error } = await Promise.race([
      query,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`[tracking] direct prefix scan timed out for ${prefix}`)), TRACKING_WRITE_TIMEOUT_MS);
      }),
    ]);

    if (error) {
      throw new Error(error.message || `Falha ao listar prefixo ${prefix}`);
    }

    const rows = (data || []) as Array<{ value: any }>;
    if (!rows.length) break;

    values.push(...rows.map((row) => row?.value).filter(Boolean));

    if (rows.length < batchSize) break;
    from += batchSize;
  }

  return values;
}

function normalizeText(value: unknown): string | undefined {
  const normalized = String(value || '').trim();
  return normalized || undefined;
}

function normalizeCurrency(value: unknown): string {
  return normalizeText(value) || 'BRL';
}

function validateEvent(event: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!event?.event_name) errors.push('event_name required');
  if (!isValidEventName(event?.event_name)) errors.push(`invalid event_name: ${event?.event_name}`);
  if (!event?.event_id) errors.push('event_id required');
  if (!event?.session_id) errors.push('session_id required');

  if (event?.event_name === 'view_item') {
    if (!event?.ecommerce?.items?.[0]?.item_id) errors.push('view_item requires ecommerce.items[0].item_id');
  }

  if (event?.event_name === 'begin_checkout' || event?.event_name === 'purchase_paid') {
    if (!event?.ecommerce?.transaction_id && event?.event_name === 'purchase_paid') {
      errors.push('purchase_paid requires ecommerce.transaction_id');
    }
    if (event?.ecommerce?.value == null) errors.push(`${event.event_name} requires ecommerce.value`);
    if (!event?.ecommerce?.currency) errors.push(`${event.event_name} requires ecommerce.currency`);
  }

  if (event?.event_name === 'purchase_paid') {
    if (!event?.ecommerce?.items?.length) errors.push('purchase_paid requires ecommerce.items[]');
  }

  if (event?.event_name === 'whatsapp_banner_lead') {
    if (!event?.source_surface) errors.push('whatsapp_banner_lead requires source_surface');
    if (event?.resolved_value == null) errors.push('whatsapp_banner_lead requires resolved_value');
  }

  return { valid: errors.length === 0, errors };
}

async function isDuplicate(eventId: string): Promise<boolean> {
  try {
    return !!(await kv.get(`${DEDUP_PREFIX}${eventId}`));
  } catch {
    return false;
  }
}

async function markProcessed(eventId: string): Promise<void> {
  try {
    await setKvValueSafe(`${DEDUP_PREFIX}${eventId}`, {
      processed_at: new Date().toISOString(),
    }, 'event_dedup');
  } catch (error) {
    console.warn(`[Tracking] failed to mark dedup for ${eventId}:`, error);
  }
}

async function isPurchaseSent(transactionId: string): Promise<boolean> {
  try {
    return !!(await kv.get(`${PURCHASE_PREFIX}${transactionId}`));
  } catch {
    return false;
  }
}

async function markPurchaseSent(transactionId: string, eventId: string): Promise<void> {
  try {
    await setKvValueSafe(`${PURCHASE_PREFIX}${transactionId}`, {
      event_id: eventId,
      sent_at: new Date().toISOString(),
    }, 'purchase_sent');
  } catch (error) {
    console.warn(`[Tracking] failed to mark purchase sent for ${transactionId}:`, error);
  }
}

async function logEvent(
  event: MarketingTrackingEvent,
  meta: { source: string; deduped: boolean; relayed_to: string[] },
): Promise<void> {
  try {
    await setKvValueSafe(`${EVENT_LOG_PREFIX}${event.event_id}`, {
      ...event,
      _meta: {
        ...meta,
        logged_at: new Date().toISOString(),
      },
    }, 'event_log');
  } catch (error) {
    console.warn(`[Tracking] failed to log event ${event.event_id}:`, error);
  }
}

function mapEventToMeta(eventName: MarketingEventName): string | null {
  switch (eventName) {
    case 'page_view':
      return 'PageView';
    case 'view_item':
      return 'ViewContent';
    case 'add_to_cart':
      return 'AddToCart';
    case 'begin_checkout':
      return 'InitiateCheckout';
    case 'purchase_paid':
      return 'Purchase';
    case 'search_performed':
      return 'Search';
    case 'whatsapp_banner_lead':
      return 'Lead';
    default:
      return null;
  }
}

async function sha256Hex(value: string): Promise<string> {
  const normalized = value.trim().toLowerCase();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

async function buildMetaUserData(event: MarketingTrackingEvent, userData?: MarketingUserData) {
  const payload: Record<string, unknown> = {};

  const email = normalizeText(userData?.email);
  const phone = normalizeText(userData?.phone);
  const firstName = normalizeText(userData?.first_name);
  const lastName = normalizeText(userData?.last_name);
  const externalId = normalizeText(userData?.external_id || event.user_id || event.anonymous_id);

  if (email) payload.em = [await sha256Hex(email)];
  if (phone) payload.ph = [await sha256Hex(normalizePhone(phone))];
  if (firstName) payload.fn = [await sha256Hex(firstName)];
  if (lastName) payload.ln = [await sha256Hex(lastName)];
  if (externalId) payload.external_id = [await sha256Hex(externalId)];

  if (event.attribution?.fbp) payload.fbp = event.attribution.fbp;
  if (event.attribution?.fbc) payload.fbc = event.attribution.fbc;
  if (userData?.client_user_agent || event.properties?.user_agent) {
    payload.client_user_agent = normalizeText(userData?.client_user_agent || event.properties?.user_agent);
  }
  if (userData?.client_ip_address) {
    payload.client_ip_address = userData.client_ip_address;
  }

  return payload;
}

function buildMetaCustomData(event: MarketingTrackingEvent) {
  const customData: Record<string, unknown> = {};
  const currency = normalizeCurrency(event.ecommerce?.currency);
  const value = toCurrencyNumber(event.ecommerce?.value ?? event.resolved_value);

  if (value != null) customData.value = value;
  if (currency) customData.currency = currency;

  if (event.ecommerce?.transaction_id) customData.order_id = event.ecommerce.transaction_id;
  if (event.ecommerce?.items?.length) {
    customData.contents = event.ecommerce.items.map((item) => ({
      id: item.item_id,
      quantity: item.quantity || 1,
      item_price: toCurrencyNumber(item.price) || undefined,
    }));
    customData.content_ids = event.ecommerce.items.map((item) => item.item_id);
    customData.content_type = 'product';
    customData.num_items = event.ecommerce.items.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
  }

  if (event.event_name === 'whatsapp_banner_lead') {
    customData.lead_channel = 'whatsapp_banner';
    customData.banner_id = event.banner_id || undefined;
    customData.source_surface = event.source_surface || undefined;
    customData.linked_product_sku = event.linked_product_sku || undefined;
  }

  if (event.event_name === 'search_performed') {
    customData.search_string = normalizeText(event.properties?.query);
  }

  return customData;
}

async function sendToMetaConversionsApi(
  event: MarketingTrackingEvent,
  userData?: MarketingUserData,
): Promise<boolean> {
  const pixelId = (Deno.env.get('META_PIXEL_ID') || '').trim();
  const accessToken = (Deno.env.get('META_ACCESS_TOKEN') || '').trim();
  const metaEventName = mapEventToMeta(event.event_name);

  if (!pixelId || !accessToken || !metaEventName) return false;

  try {
    const body = {
      data: [
        {
          event_name: metaEventName,
          event_time: Math.floor(new Date(event.event_time).getTime() / 1000),
          event_id: event.event_id,
          action_source: 'website',
          event_source_url: event.page_url || event.attribution?.landing_page || undefined,
          user_data: await buildMetaUserData(event, userData),
          custom_data: buildMetaCustomData(event),
        },
      ],
      ...(Deno.env.get('META_TEST_EVENT_CODE')
        ? { test_event_code: Deno.env.get('META_TEST_EVENT_CODE') }
        : {}),
    };

    const response = await fetch(`https://graph.facebook.com/v20.0/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      console.warn(`[Tracking] Meta CAPI failed for ${event.event_name}: ${response.status} ${text}`);
      return false;
    }

    return true;
  } catch (error) {
    console.warn(`[Tracking] Meta CAPI error for ${event.event_name}:`, error);
    return false;
  }
}

async function relayEvent(
  event: MarketingTrackingEvent,
  userData?: MarketingUserData,
): Promise<string[]> {
  const relayedTo: string[] = [];

  if (event.consent?.ads === false) return relayedTo;

  const metaRelayed = await sendToMetaConversionsApi(event, userData);
  if (metaRelayed) relayedTo.push('meta_capi');

  return relayedTo;
}

function normalizeTrackingEvent(input: any): MarketingTrackingEvent {
  const attribution = extractAttributionSnapshot(input?.attribution || input);
  const ecommerceValue = toCurrencyNumber(input?.ecommerce?.value);
  const resolvedValue = toCurrencyNumber(input?.resolved_value);

  return {
    event_name: input.event_name,
    event_id: normalizeText(input.event_id) || crypto.randomUUID(),
    event_time: normalizeText(input.event_time) || new Date().toISOString(),
    schema_version: TRACKING_SCHEMA_VERSION,
    session_id: normalizeText(input.session_id) || attribution.session_id || 'anonymous',
    anonymous_id: normalizeText(input.anonymous_id) || attribution.anonymous_id,
    user_id: normalizeText(input.user_id) || attribution.user_id,
    page_url: normalizeText(input.page_url),
    page_path: normalizeText(input.page_path),
    page_title: normalizeText(input.page_title),
    page_type: normalizeText(input.page_type),
    referrer: normalizeText(input.referrer) || attribution.referrer,
    source_surface: normalizeText(input.source_surface),
    banner_id: normalizeText(input.banner_id),
    linked_product_sku: normalizeText(input.linked_product_sku),
    quantity: Number.isFinite(Number(input.quantity)) ? Number(input.quantity) : undefined,
    resolved_value: resolvedValue ?? undefined,
    resolved_value_source: normalizeText(input.resolved_value_source),
    campaign_goal:
      input.campaign_goal === 'purchase_paid' || input.campaign_goal === 'whatsapp_banner_lead'
        ? input.campaign_goal
        : undefined,
    properties: input.properties && typeof input.properties === 'object' ? input.properties : {},
    attribution,
    consent: input.consent && typeof input.consent === 'object'
      ? {
          ads: input.consent.ads !== false,
          analytics: input.consent.analytics !== false,
          timestamp: normalizeText(input.consent.timestamp) || new Date().toISOString(),
        }
      : {
          ads: true,
          analytics: true,
          timestamp: new Date().toISOString(),
        },
    ecommerce: input.ecommerce && typeof input.ecommerce === 'object'
      ? {
          currency: normalizeCurrency(input.ecommerce.currency),
          value: ecommerceValue ?? undefined,
          transaction_id: normalizeText(input.ecommerce.transaction_id),
          items: Array.isArray(input.ecommerce.items)
            ? input.ecommerce.items
                .map((item: any) => ({
                  item_id: normalizeText(item?.item_id || item?.sku) || '',
                  name: normalizeText(item?.name),
                  price: toCurrencyNumber(item?.price) ?? undefined,
                  quantity: Number.isFinite(Number(item?.quantity)) ? Number(item.quantity) : undefined,
                  category: normalizeText(item?.category),
                  brand: normalizeText(item?.brand),
                }))
                .filter((item) => item.item_id)
            : [],
        }
      : undefined,
    user_data: input.user_data && typeof input.user_data === 'object'
      ? {
          email: normalizeText(input.user_data.email),
          phone: normalizeText(input.user_data.phone),
          first_name: normalizeText(input.user_data.first_name),
          last_name: normalizeText(input.user_data.last_name),
          external_id: normalizeText(input.user_data.external_id),
          client_user_agent: normalizeText(input.user_data.client_user_agent),
          client_ip_address: normalizeText(input.user_data.client_ip_address),
        }
      : undefined,
  };
}

export async function recordServerEvent(
  input: any,
  options?: { source?: string; userData?: MarketingUserData; allowProtectedEvents?: boolean },
) {
  const event = normalizeTrackingEvent(input);
  const debugPersist = input?.debug_persist === true;
  const validation = validateEvent(event);

  if (!validation.valid) {
    return {
      ok: false as const,
      status: 400,
      body: { error: 'Validation failed', details: validation.errors },
    };
  }

  if (!options?.allowProtectedEvents && event.event_name === 'purchase_paid') {
    return {
      ok: false as const,
      status: 403,
      body: {
        error: 'purchase_paid must be recorded server-side from payment confirmation.',
      },
    };
  }

  if (event.event_name === 'whatsapp_banner_lead') {
    const relayedTo = await relayEvent(event, options?.userData || event.user_data);
    let leadId: string | null = null;
    let persistError: string | null = null;

    try {
      const lead = await upsertWhatsAppLeadFromEvent(event);
      leadId = lead.lead_id;
    } catch (error: any) {
      persistError = String(error?.message || error || 'unknown_error');
      console.warn('[Tracking] operational WhatsApp lead persistence failed:', error);
    }

    return {
      ok: true as const,
      status: 200,
      body: {
        status: 'ok',
        event_id: event.event_id,
        event_name: event.event_name,
        relayed_to: relayedTo,
        whatsapp_lead_id: leadId,
        ...(input?.debug_persist === true
          ? {
              debug_state: {
                persisted_lead_id: leadId,
                persist_error: persistError,
              },
            }
          : {}),
      },
    };
  }

  if (await isDuplicate(event.event_id)) {
    return {
      ok: true as const,
      status: 200,
      body: {
        status: 'deduplicated',
        event_id: event.event_id,
        event_name: event.event_name,
      },
    };
  }

  if (event.event_name === 'purchase_paid' && event.ecommerce?.transaction_id) {
    if (await isPurchaseSent(event.ecommerce.transaction_id)) {
      return {
        ok: true as const,
        status: 200,
        body: {
          status: 'already_sent',
          transaction_id: event.ecommerce.transaction_id,
          event_id: event.event_id,
        },
      };
    }
  }

  const relayedTo = await relayEvent(event, options?.userData || event.user_data);
  await logEvent(event, {
    source: options?.source || 'server',
    deduped: false,
    relayed_to: relayedTo,
  });

  let whatsappLead: { lead_id: string; source_surface: string | null } | null = null;
  let whatsappCaptureError: string | null = null;
  let whatsappLeadError: string | null = null;

  if (event.event_name === 'whatsapp_banner_lead') {
    try {
      try {
        await setKvValueSafe(`${WHATSAPP_LEAD_CAPTURE_PREFIX}${event.event_id}`, {
          ...event,
          _captured_at: new Date().toISOString(),
        }, 'whatsapp_lead_capture');
      } catch (captureError) {
        whatsappCaptureError = String((captureError as any)?.message || captureError || 'unknown_capture_error');
        console.warn('[Tracking] failed to persist whatsapp lead capture backup:', captureError);
      }

      const lead = await upsertWhatsAppLeadFromEvent(event);
      whatsappLead = {
        lead_id: lead.lead_id,
        source_surface: lead.source_surface,
      };
      console.log(`[Tracking] whatsapp lead synced | lead_id=${lead.lead_id} | sku=${lead.sku || 'n/a'}`);
    } catch (leadError) {
      whatsappLeadError = String((leadError as any)?.message || leadError || 'unknown_error');
      console.warn('[Tracking] failed to sync whatsapp lead:', leadError);
    }
  }

  await markProcessed(event.event_id);

  if (event.event_name === 'purchase_paid' && event.ecommerce?.transaction_id) {
    await markPurchaseSent(event.ecommerce.transaction_id, event.event_id);
  }

  console.log(
    `[Tracking] ${event.event_name} | session=${event.session_id.slice(0, 8)} | event_id=${event.event_id.slice(0, 12)} | relayed=${relayedTo.join(',') || 'none'}`,
  );

  let debugState: Record<string, unknown> | null = null;
  if (debugPersist && event.event_name === 'whatsapp_banner_lead') {
    debugState = {
      persisted_lead_id: whatsappLead?.lead_id || null,
      persisted_source_surface: whatsappLead?.source_surface || null,
      capture_error: whatsappCaptureError,
      persist_error: whatsappLeadError,
    };
  }

  return {
    ok: true as const,
    status: 200,
    body: {
      status: 'ok',
      event_id: event.event_id,
      event_name: event.event_name,
      relayed_to: relayedTo,
      ...(debugPersist ? { debug_state: debugState } : {}),
    },
  };
}

export async function recordPurchasePaidFromOrder(params: {
  order: any;
  transactionId: string;
  eventId?: string;
  gatewayEvent?: string;
  paidAt?: string;
}) {
  const order = params.order || {};
  const attribution = extractAttributionSnapshot(order.attribution_snapshot || order.attribution || {});
  const currency = 'BRL';
  const items = Array.isArray(order.items)
    ? order.items
        .map((item: any) => ({
          item_id: normalizeText(item?.sku || item?.id) || '',
          name: normalizeText(item?.name || item?.description),
          price: toCurrencyNumber(item?.price || item?.unitPrice) ?? undefined,
          quantity: Number.isFinite(Number(item?.quantity || item?.qty)) ? Number(item.quantity || item.qty) : 1,
          brand: 'Toyota',
        }))
        .filter((item) => item.item_id)
    : [];

  const result = await recordServerEvent(
    {
      event_name: 'purchase_paid',
      event_id: params.eventId || `purchase-paid-${params.transactionId}`,
      event_time: params.paidAt || new Date().toISOString(),
      session_id: attribution.session_id || 'server',
      anonymous_id: attribution.anonymous_id,
      user_id: attribution.user_id,
      page_url: attribution.landing_page,
      page_path: attribution.landing_page,
      referrer: attribution.referrer,
      attribution,
      consent: {
        ads: true,
        analytics: true,
        timestamp: new Date().toISOString(),
      },
      campaign_goal: 'purchase_paid',
      properties: {
        order_id: order.orderId,
        payment_provider: order.payment_provider || 'asaas',
        gateway_event: params.gatewayEvent,
      },
      ecommerce: {
        currency,
        value: toCurrencyNumber(order?.totals?.total) ?? 0,
        transaction_id: params.transactionId,
        items,
      },
      user_data: {
        email: normalizeText(order?.customer?.email),
        phone: normalizeText(order?.customer?.phone),
        external_id: normalizeText(order?.customer?.id || order?.orderId),
        client_user_agent: normalizeText(order?.attribution_snapshot?.user_agent),
      },
    },
    {
      source: 'webhook',
      allowProtectedEvents: true,
    },
  );

  return result;
}

app.post('/track', async (c) => {
  try {
    const body = await c.req.json();
    const eventName = body?.event_name;

    if (eventName === 'purchase_paid') {
      return c.json(
        {
          error: 'purchase_paid must be sent by the server after payment confirmation.',
        },
        403,
      );
    }

    const result = await recordServerEvent(body, {
      source: 'client',
    });
    return c.json(result.body, result.status as any);
  } catch (error: any) {
    console.error('[Tracking] /track error:', error);
    return c.json({ error: `Tracking error: ${error.message}` }, 500);
  }
});

app.post('/purchase-confirmed', async (c) => {
  try {
    const body = await c.req.json();
    const transactionId = normalizeText(body?.transaction_id || body?.payment_id || body?.order_id);
    if (!transactionId) {
      return c.json({ error: 'transaction_id required' }, 400);
    }

    const attribution = extractAttributionSnapshot(body?.attribution || {});
    const result = await recordServerEvent(
      {
        event_name: 'purchase_paid',
        event_id: normalizeText(body?.event_id) || `purchase-paid-${transactionId}`,
        event_time: normalizeText(body?.paid_at) || new Date().toISOString(),
        session_id: attribution.session_id || normalizeText(body?.session_id) || 'server',
        anonymous_id: attribution.anonymous_id,
        user_id: attribution.user_id || normalizeText(body?.user_id),
        page_url: normalizeText(body?.page_url) || attribution.landing_page,
        page_path: normalizeText(body?.page_path),
        referrer: normalizeText(body?.referrer) || attribution.referrer,
        attribution,
        consent: { ads: true, analytics: true, timestamp: new Date().toISOString() },
        campaign_goal: 'purchase_paid',
        properties: body?.properties && typeof body.properties === 'object' ? body.properties : {},
        ecommerce: {
          currency: normalizeCurrency(body?.currency),
          value: toCurrencyNumber(body?.value) ?? 0,
          transaction_id: transactionId,
          items: Array.isArray(body?.items)
            ? body.items.map((item: any) => ({
                item_id: normalizeText(item?.sku || item?.item_id) || '',
                name: normalizeText(item?.name),
                price: toCurrencyNumber(item?.price) ?? undefined,
                quantity: Number.isFinite(Number(item?.quantity)) ? Number(item.quantity) : 1,
                category: normalizeText(item?.category),
                brand: normalizeText(item?.brand),
              }))
            : [],
        },
        user_data: body?.user_data && typeof body.user_data === 'object' ? body.user_data : {},
      },
      {
        source: 'webhook',
        allowProtectedEvents: true,
      },
    );

    return c.json(result.body, result.status as any);
  } catch (error: any) {
    console.error('[Tracking] /purchase-confirmed error:', error);
    return c.json({ error: `Purchase confirmation error: ${error.message}` }, 500);
  }
});

app.post('/refund', async (c) => {
  try {
    const body = await c.req.json();
    const transactionId = normalizeText(body?.transaction_id);
    if (!transactionId) {
      return c.json({ error: 'transaction_id required' }, 400);
    }

    const result = await recordServerEvent(
      {
        event_name: 'refund',
        event_id: normalizeText(body?.event_id) || `refund-${transactionId}-${Date.now()}`,
        event_time: new Date().toISOString(),
        session_id: 'server',
        ecommerce: {
          transaction_id: transactionId,
          value: toCurrencyNumber(body?.value) ?? 0,
          currency: 'BRL',
        },
        properties: {
          reason: normalizeText(body?.reason),
        },
      },
      {
        source: 'server',
        allowProtectedEvents: true,
      },
    );

    return c.json(result.body, result.status as any);
  } catch (error: any) {
    console.error('[Tracking] /refund error:', error);
    return c.json({ error: error.message }, 500);
  }
});

app.get('/stats', async (c) => {
  try {
    let logs = await kv.getByPrefix(EVENT_LOG_PREFIX).catch(() => []);
    let purchases = await kv.getByPrefix(PURCHASE_PREFIX).catch(() => []);

    if (!Array.isArray(logs) || !logs.length) {
      logs = await listKvValuesDirectByPrefix(EVENT_LOG_PREFIX).catch(() => []);
    }

    if (!Array.isArray(purchases) || !purchases.length) {
      purchases = await listKvValuesDirectByPrefix(PURCHASE_PREFIX).catch(() => []);
    }

    const eventCounts: Record<string, number> = {};
    for (const log of logs || []) {
      const value = log?.value || log;
      const eventName = String(value?.event_name || 'unknown');
      eventCounts[eventName] = (eventCounts[eventName] || 0) + 1;
    }

    return c.json({
      total_events_logged: logs?.length || 0,
      total_purchases_confirmed: purchases?.length || 0,
      event_counts: eventCounts,
    });
  } catch (error: any) {
    return c.json(
      { error: error.message, total_events_logged: 0, total_purchases_confirmed: 0 },
      500,
    );
  }
});

export { app as tracking };
