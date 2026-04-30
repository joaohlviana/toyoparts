import * as kv from './kv_store.tsx';
import { createClient } from 'jsr:@supabase/supabase-js@2.49.8';
import {
  extractAttributionSnapshot,
  type MarketingAttributionSnapshot,
  type MarketingTrackingEvent,
  toCurrencyNumber,
} from './marketing.tsx';

export type LeadStage = 'clicked' | 'qualified' | 'high_intent' | 'linked' | 'won' | 'lost';
export type OrderSource = 'checkout_web' | 'whatsapp_manual';
export type OfflineJobStatus = 'pending' | 'sent' | 'failed' | 'dead_letter';
export type GoogleAdsHealthState = 'ok' | 'warning' | 'error' | 'blocked';

export interface GoogleAdsConfig {
  auth_mode: 'oauth_refresh_token' | 'service_account';
  manager_customer_id: string | null;
  customer_id: string | null;
  conversion_customer_id: string | null;
  conversion_tracking_status: string | null;
  merchant_center_id: string | null;
  developer_token: string | null;
  oauth_client_id: string | null;
  oauth_client_secret: string | null;
  oauth_refresh_token: string | null;
  service_account_project_id: string | null;
  service_account_client_email: string | null;
  service_account_private_key_id: string | null;
  service_account_private_key: string | null;
  service_account_token_uri: string | null;
  conversion_action_purchase_id: string | null;
  conversion_action_whatsapp_lead_id: string | null;
  conversion_action_whatsapp_closed_id: string | null;
  website_url: string | null;
  pmax_feed_label: string | null;
  pmax_default_daily_budget_brl: number | null;
  pmax_default_target_roas: number | null;
  pmax_base_campaign_id: string | null;
  pmax_base_campaign_name: string | null;
  pmax_base_asset_group_id: string | null;
  pmax_last_provisioned_at: string | null;
  pmax_enabled: boolean;
  merchant_link_status: string | null;
  last_successful_api_check_at: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

export interface GoogleAdsConversionStatus {
  key: 'purchase' | 'whatsapp_lead' | 'whatsapp_closed';
  label: string;
  action_id: string | null;
  exists: boolean;
  active: boolean;
  value_mode: 'dynamic' | 'static' | 'unknown';
  include_in_goals: boolean | null;
  category: string | null;
  last_seen_event_at: string | null;
  last_error: string | null;
}

export interface GoogleAdsHealthReport {
  generated_at: string;
  state: GoogleAdsHealthState;
  readiness: {
    credentials: boolean;
    conversions: boolean;
    merchant: boolean;
    value_tracking: boolean;
    offline_queue: boolean;
    pmax_enabled: boolean;
  };
  checks: Array<{
    key: string;
    label: string;
    status: GoogleAdsHealthState;
    detail: string;
  }>;
  conversions: GoogleAdsConversionStatus[];
  conversion_customer_id: string | null;
  conversion_tracking_status: string | null;
  merchant: {
    links: Array<Record<string, unknown>>;
    invitations: Array<Record<string, unknown>>;
  };
  pmax: {
    campaigns: Array<Record<string, unknown>>;
  };
  queue: {
    pending: number;
    failed: number;
    sent: number;
    dead_letter: number;
    attributed_internal_only: number;
  };
  last_successful_api_check_at: string | null;
  merchant_link_status: string | null;
  errors: string[];
}

export interface WhatsAppLeadRecord {
  lead_id: string;
  clicked_at: string;
  updated_at: string;
  last_clicked_at: string;
  click_count: number;
  sku: string | null;
  message_text: string | null;
  normalized_message_text: string | null;
  source_surface: string | null;
  page_type: string | null;
  page_path: string | null;
  product_price: number | null;
  cart_total: number | null;
  checkout_total: number | null;
  resolved_value: number | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  session_id: string | null;
  anonymous_id: string | null;
  user_id: string | null;
  status: LeadStage;
  score_band: 'low' | 'medium' | 'high';
  score_value: number;
  matched_order_id: string | null;
  attribution_snapshot: MarketingAttributionSnapshot;
}

export interface WhatsAppLeadCandidateMatch {
  lead_id: string;
  score: number;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  lead: WhatsAppLeadRecord;
}

export interface ManualWhatsAppSaleDraft {
  order_id?: string;
  sale_time?: string;
  paid_at?: string;
  sku?: string;
  item_name?: string;
  quantity?: number;
  unit_price?: number;
  total?: number;
  message_text?: string;
  source_surface?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  transaction_id?: string;
  payment_status?: string;
  lead_id?: string | null;
}

export interface OfflineConversionJob {
  job_id: string;
  lead_id: string;
  order_id: string;
  conversion_action: 'Purchase - WhatsApp Closed';
  click_id_type: 'gclid' | 'gbraid' | 'wbraid';
  click_id_value: string;
  conversion_time: string;
  conversion_value: number;
  currency_code: string;
  transaction_id: string;
  status: OfflineJobStatus;
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
}

export const GOOGLE_ADS_CONFIG_KEY = 'meta:google_ads_config';
export const WHATSAPP_LEAD_PREFIX = 'whatsapp_lead:';
export const WHATSAPP_LEAD_FINGERPRINT_PREFIX = 'whatsapp_lead_fp:';
export const WHATSAPP_LEAD_CAPTURE_PREFIX = 'whatsapp_lead_capture:';
export const OFFLINE_CONVERSION_JOB_PREFIX = 'offline_conversion_job:';
export const WHATSAPP_LEAD_INDEX_KEY = 'meta:whatsapp_lead_index';
export const EVENT_LOG_PREFIX = 'event_log:';
const KV_TABLE = 'kv_store_1d6e33e0';
const FAST_META_TABLE = 'order_read_model_meta_1d6e33e0';
const FAST_WHATSAPP_LEAD_PREFIX = 'whatsapp_lead_fast:';
const FAST_WHATSAPP_LEAD_FINGERPRINT_PREFIX = 'whatsapp_lead_fp_fast:';
const FAST_WHATSAPP_LEAD_CAPTURE_PREFIX = 'whatsapp_lead_capture_fast:';
const FAST_STORAGE_BUCKET = 'make-1d6e33e0-order-read-model';
const FAST_STORAGE_WHATSAPP_LEADS_PATH = 'whatsapp-leads/leads.json';
const DIRECT_KV_SCAN_TIMEOUT_MS = Math.max(10000, Number(Deno.env.get('KV_SCAN_TIMEOUT_MS') || 45000));

const TOYOPARTS_MESSAGE_PREFIX = 'ola toyoparts';
let fastStorageBucketReady = false;

function readEnv(name: string): string | null {
  const value = String(Deno.env.get(name) || '').trim();
  return value || null;
}

function sanitizeNullableString(value: unknown): string | null {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function sanitizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function sanitizeNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeMaybeText(value: unknown): string | null {
  const normalized = collapseWhitespace(String(value || '').trim());
  return normalized || null;
}

export function normalizeSku(value: unknown): string | null {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized || null;
}

export function normalizeMessageText(value: unknown): string | null {
  const raw = collapseWhitespace(stripDiacritics(String(value || '').trim().toLowerCase()));
  if (!raw) return null;
  const cleaned = raw
    .replace(/^ol[aá]!?/i, 'ola')
    .replace(/^ola[,!. ]*toyoparts[.! ]*/i, '')
    .replace(/^toyoparts[.! ]*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || raw || null;
}

function getNowIso() {
  return new Date().toISOString();
}

function genId(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function prefixUpperBound(prefix: string): string {
  return `${prefix}\uffff`;
}

function normalizeScoreBand(score: number): 'low' | 'medium' | 'high' {
  if (score >= 80) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

function getLeadStageScore(input: {
  source_surface?: string | null;
  sku?: string | null;
  resolved_value?: number | null;
  checkout_total?: number | null;
  cart_total?: number | null;
}): number {
  let score = 10;
  const source = String(input.source_surface || '').trim().toLowerCase();
  if (input.sku) score += 25;
  if ((input.resolved_value || 0) >= 300) score += 10;
  if ((input.resolved_value || 0) >= 1000) score += 10;
  if ((input.checkout_total || 0) > 0) score += 20;
  else if ((input.cart_total || 0) > 0) score += 12;
  if (source.includes('checkout')) score += 18;
  if (source.includes('shipping')) score += 12;
  if (source.includes('pdp') || source.includes('product')) score += 10;
  if (source.includes('consult')) score += 10;
  return Math.min(100, score);
}

function stageFromScore(score: number): LeadStage {
  if (score >= 75) return 'high_intent';
  if (score >= 35) return 'qualified';
  return 'clicked';
}

function extractMessageFromHref(href?: unknown): string | null {
  const rawHref = String(href || '').trim();
  if (!rawHref) return null;
  try {
    const url = new URL(rawHref);
    const direct = url.searchParams.get('text');
    return normalizeMaybeText(direct);
  } catch {
    return null;
  }
}

function buildLeadFingerprint(input: {
  session_id?: string | null;
  sku?: string | null;
  source_surface?: string | null;
  normalized_message_text?: string | null;
}) {
  const session = sanitizeNullableString(input.session_id) || 'anonymous';
  const sku = normalizeSku(input.sku) || 'no-sku';
  const source = sanitizeNullableString(input.source_surface) || 'unknown';
  const message = normalizeMessageText(input.normalized_message_text) || TOYOPARTS_MESSAGE_PREFIX;
  return `${WHATSAPP_LEAD_FINGERPRINT_PREFIX}${session}:${sku}:${source}:${message}`;
}

function parseMoney(value: unknown): number | null {
  return toCurrencyNumber(value);
}

function createServiceClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service role indisponivel para leitura resiliente do KV.');
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

async function readKvValuesByPrefixDirect(
  prefix: string,
  options?: {
    ascending?: boolean;
    jsonFieldEquals?: {
      field: string;
      value: string;
    };
  },
): Promise<any[]> {
  const supabase = createServiceClient();
  const allValues: any[] = [];
  const batchSize = 500;
  let from = 0;

  while (true) {
    let query = supabase
      .from(KV_TABLE)
      .select('value')
      .like('key', `${prefix}%`);

    if (options?.jsonFieldEquals?.field && options?.jsonFieldEquals?.value) {
      query = query.eq(`value->>${options.jsonFieldEquals.field}`, options.jsonFieldEquals.value);
    }

    query = query
      .order('key', { ascending: options?.ascending ?? true })
      .range(from, from + batchSize - 1);

    const { data, error } = await Promise.race([
      query,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`[performance-marketing] direct KV scan timed out for prefix ${prefix}`)), DIRECT_KV_SCAN_TIMEOUT_MS);
      }),
    ]);

    if (error) {
      throw new Error(error.message || `Falha ao ler prefixo ${prefix}`);
    }

    if (!Array.isArray(data) || data.length === 0) {
      break;
    }

    allValues.push(...data.map((row: any) => row?.value).filter(Boolean));
    if (data.length < batchSize) {
      break;
    }
    from += batchSize;
  }

  return allValues;
}

async function readKvValueDirect(key: string): Promise<any | null> {
  const supabase = createServiceClient();
  const query = supabase
    .from(KV_TABLE)
    .select('value')
    .eq('key', key)
    .maybeSingle();

  const { data, error } = await Promise.race([
    query,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`[performance-marketing] direct KV read timed out for key ${key}`)), DIRECT_KV_SCAN_TIMEOUT_MS);
    }),
  ]);

  if (error) {
    throw new Error(error.message || `Falha ao ler chave ${key}`);
  }

  return data?.value ?? null;
}

async function readFastMetaValue(key: string): Promise<any | null> {
  const supabase = createServiceClient();
  const query = supabase
    .from(FAST_META_TABLE)
    .select('value')
    .eq('key', key)
    .maybeSingle();

  const { data, error } = await Promise.race([
    query,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`[performance-marketing] fast meta read timed out for key ${key}`)), DIRECT_KV_SCAN_TIMEOUT_MS);
    }),
  ]);

  if (error) {
    throw new Error(error.message || `Falha ao ler fast meta ${key}`);
  }

  return data?.value ?? null;
}

async function writeKvValueDirect(key: string, value: unknown): Promise<void> {
  const supabase = createServiceClient();
  const query = supabase
    .from(KV_TABLE)
    .upsert({ key, value });

  const { error } = await Promise.race([
    query,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`[performance-marketing] direct KV write timed out for key ${key}`)), DIRECT_KV_SCAN_TIMEOUT_MS);
    }),
  ]);

  if (error) {
    throw new Error(error.message || `Falha ao gravar chave ${key}`);
  }
}

async function writeFastMetaValue(key: string, value: unknown): Promise<void> {
  const supabase = createServiceClient();
  const query = supabase
    .from(FAST_META_TABLE)
    .upsert({
      key,
      value,
      updated_at: getNowIso(),
    });

  const { error } = await Promise.race([
    query,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`[performance-marketing] fast meta write timed out for key ${key}`)), DIRECT_KV_SCAN_TIMEOUT_MS);
    }),
  ]);

  if (error) {
    throw new Error(error.message || `Falha ao gravar fast meta ${key}`);
  }
}

async function writeKvEntriesDirect(entries: Array<{ key: string; value: unknown }>): Promise<void> {
  if (!entries.length) return;

  const supabase = createServiceClient();
  for (let index = 0; index < entries.length; index += 200) {
    const chunk = entries.slice(index, index + 200);
    const query = supabase
      .from(KV_TABLE)
      .upsert(chunk);

    const { error } = await Promise.race([
      query,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`[performance-marketing] direct KV bulk write timed out at chunk ${index / 200}`)), DIRECT_KV_SCAN_TIMEOUT_MS);
      }),
    ]);

    if (error) {
      throw new Error(error.message || 'Falha ao gravar lote no KV');
    }
  }
}

async function listFastMetaValuesByPrefix(prefix: string): Promise<any[]> {
  const supabase = createServiceClient();
  const allValues: any[] = [];
  const batchSize = 500;
  let from = 0;

  while (true) {
    const query = supabase
      .from(FAST_META_TABLE)
      .select('key, value')
      .gte('key', prefix)
      .lt('key', prefixUpperBound(prefix))
      .order('key', { ascending: true })
      .range(from, from + batchSize - 1);

    const { data, error } = await Promise.race([
      query,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`[performance-marketing] fast meta scan timed out for prefix ${prefix}`)), DIRECT_KV_SCAN_TIMEOUT_MS);
      }),
    ]);

    if (error) {
      throw new Error(error.message || `Falha ao listar fast meta ${prefix}`);
    }

    if (!Array.isArray(data) || data.length === 0) {
      break;
    }

    allValues.push(...data.map((row: any) => row?.value).filter(Boolean));
    if (data.length < batchSize) {
      break;
    }
    from += batchSize;
  }

  return allValues;
}

function isStorageNotFoundError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  return error?.statusCode === 404 || error?.status === 404 || message.includes('not found');
}

async function ensureFastStorageBucket() {
  if (fastStorageBucketReady) return;
  fastStorageBucketReady = true;
}

async function readFastStorageJson<T>(path: string): Promise<T | null> {
  const supabase = createServiceClient();
  await ensureFastStorageBucket();

  const { data, error } = await supabase.storage
    .from(FAST_STORAGE_BUCKET)
    .download(path);

  if (error) {
    const detail = String(error?.message || error?.error || '').trim();
    if (isStorageNotFoundError(error) || (!detail && !error?.statusCode && !error?.status)) return null;
    throw new Error(detail || `Falha ao ler storage ${path}`);
  }

  const text = await data.text();
  if (!text) return null;
  return JSON.parse(text) as T;
}

async function writeFastStorageJson(path: string, value: unknown): Promise<void> {
  const supabase = createServiceClient();
  await ensureFastStorageBucket();

  const payload = JSON.stringify(value, null, 2);
  const { error } = await supabase.storage
    .from(FAST_STORAGE_BUCKET)
    .upload(path, new TextEncoder().encode(payload), {
      contentType: 'application/json; charset=utf-8',
      cacheControl: '0',
      upsert: true,
    });

  if (error) {
    throw new Error(error.message || `Falha ao gravar storage ${path}`);
  }
}

async function setKvValueSafe(key: string, value: unknown, label: string): Promise<void> {
  try {
    await kv.set(key, value);
  } catch (error) {
    console.warn(`[performance-marketing] kv.set failed for ${label}, trying direct fallback:`, error);
    await writeKvValueDirect(key, value);
  }
}

async function msetKvValuesSafe(keys: string[], values: unknown[], label: string): Promise<void> {
  if (!keys.length) return;
  try {
    await kv.mset(keys, values);
  } catch (error) {
    console.warn(`[performance-marketing] kv.mset failed for ${label}, trying direct fallback:`, error);
    await writeKvEntriesDirect(
      keys.map((key, index) => ({
        key,
        value: values[index],
      })),
    );
  }
}

function sanitizeIdList(value: unknown): string[] {
  const ids = Array.isArray((value as any)?.ids)
    ? (value as any).ids
    : Array.isArray(value)
    ? value
    : [];
  return Array.from(new Set(ids.map((item) => String(item || '').trim()).filter(Boolean)));
}

async function readWhatsAppLeadIndex(): Promise<string[]> {
  const stored = await kv.get(WHATSAPP_LEAD_INDEX_KEY).catch(() => null);
  return sanitizeIdList(stored);
}

async function writeWhatsAppLeadIndex(ids: string[]) {
  const uniqueIds = sanitizeIdList(ids);
  await setKvValueSafe(WHATSAPP_LEAD_INDEX_KEY, {
    ids: uniqueIds,
    updated_at: getNowIso(),
  }, 'whatsapp_lead_index');
}

async function rememberWhatsAppLeadId(leadId: string) {
  const safeLeadId = String(leadId || '').trim();
  if (!safeLeadId) return;
  try {
    const current = await readWhatsAppLeadIndex();
    if (current.includes(safeLeadId)) return;
    await writeWhatsAppLeadIndex([safeLeadId, ...current]);
  } catch (error) {
    console.warn('[performance-marketing] failed to update WhatsApp lead index:', error);
  }
}

async function listWhatsAppLeadsFromIndex(): Promise<WhatsAppLeadRecord[]> {
  const ids = await readWhatsAppLeadIndex();
  if (!ids.length) return [];

  const values: WhatsAppLeadRecord[] = [];
  const chunkSize = 200;
  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const rows = await kv.mget(chunk.map((id) => `${WHATSAPP_LEAD_PREFIX}${id}`)).catch(() => []);
    values.push(
      ...(Array.isArray(rows) ? rows : []).filter((lead: any): lead is WhatsAppLeadRecord => Boolean(lead?.lead_id)),
    );
  }

  return values;
}

async function listWhatsAppLeadsDirect(): Promise<WhatsAppLeadRecord[]> {
  const values = await readKvValuesByPrefixDirect(WHATSAPP_LEAD_PREFIX);
  const leads = (Array.isArray(values) ? values : []).filter((lead: any): lead is WhatsAppLeadRecord => Boolean(lead?.lead_id));
  if (leads.length) {
    await writeWhatsAppLeadIndex(leads.map((lead) => lead.lead_id)).catch((error) => {
      console.warn('[performance-marketing] failed to rebuild WhatsApp lead index:', error);
    });
  }
  return leads;
}

function buildFastWhatsAppLeadKey(leadId: string) {
  return `${FAST_WHATSAPP_LEAD_PREFIX}${leadId}`;
}

function buildFastWhatsAppLeadFingerprintKey(fingerprintKey: string) {
  return `${FAST_WHATSAPP_LEAD_FINGERPRINT_PREFIX}${fingerprintKey}`;
}

async function saveFastWhatsAppLead(lead: WhatsAppLeadRecord) {
  const fingerprintKey = buildLeadFingerprint({
    session_id: lead.session_id,
    sku: lead.sku,
    source_surface: lead.source_surface,
    normalized_message_text: lead.normalized_message_text,
  });

  await writeFastMetaValue(buildFastWhatsAppLeadKey(lead.lead_id), lead);
  await writeFastMetaValue(buildFastWhatsAppLeadFingerprintKey(fingerprintKey), lead.lead_id);
}

async function getFastWhatsAppLead(leadId: string): Promise<WhatsAppLeadRecord | null> {
  const safeLeadId = String(leadId || '').trim();
  if (!safeLeadId) return null;

  const stored = await readFastMetaValue(buildFastWhatsAppLeadKey(safeLeadId)).catch(() => null);
  return stored && stored.lead_id ? stored as WhatsAppLeadRecord : null;
}

async function listFastWhatsAppLeads(): Promise<WhatsAppLeadRecord[]> {
  const values = await listFastMetaValuesByPrefix(FAST_WHATSAPP_LEAD_PREFIX);
  return (Array.isArray(values) ? values : [])
    .filter((lead: any): lead is WhatsAppLeadRecord => Boolean(lead?.lead_id))
    .sort((a, b) => new Date(String(b.last_clicked_at || b.clicked_at || 0)).getTime() - new Date(String(a.last_clicked_at || a.clicked_at || 0)).getTime());
}

async function readStorageWhatsAppLeads(): Promise<WhatsAppLeadRecord[]> {
  const stored = await readFastStorageJson<WhatsAppLeadRecord[]>(FAST_STORAGE_WHATSAPP_LEADS_PATH);
  return (Array.isArray(stored) ? stored : [])
    .filter((lead: any): lead is WhatsAppLeadRecord => Boolean(lead?.lead_id))
    .sort((a, b) => new Date(String(b.last_clicked_at || b.clicked_at || 0)).getTime() - new Date(String(a.last_clicked_at || a.clicked_at || 0)).getTime());
}

async function writeStorageWhatsAppLeads(leads: WhatsAppLeadRecord[]): Promise<void> {
  const normalized = leads
    .filter((lead: any): lead is WhatsAppLeadRecord => Boolean(lead?.lead_id))
    .sort((a, b) => new Date(String(b.last_clicked_at || b.clicked_at || 0)).getTime() - new Date(String(a.last_clicked_at || a.clicked_at || 0)).getTime())
    .slice(0, 500);

  await writeFastStorageJson(FAST_STORAGE_WHATSAPP_LEADS_PATH, normalized);
}

async function getStorageWhatsAppLead(leadId: string): Promise<WhatsAppLeadRecord | null> {
  const safeLeadId = String(leadId || '').trim();
  if (!safeLeadId) return null;

  const leads = await readStorageWhatsAppLeads();
  return leads.find((lead) => lead.lead_id === safeLeadId) || null;
}

async function saveStorageWhatsAppLead(lead: WhatsAppLeadRecord): Promise<void> {
  const leads = await readStorageWhatsAppLeads();
  const next = leads.filter((item) => item.lead_id !== lead.lead_id);
  next.unshift(lead);
  await writeStorageWhatsAppLeads(next);
}

async function upsertStorageWhatsAppLeadFromEvent(
  next: WhatsAppLeadRecord,
  fingerprintKey: string,
): Promise<WhatsAppLeadRecord> {
  const leads = await readStorageWhatsAppLeads();
  const existing = leads.find((lead) => buildLeadFingerprint({
    session_id: lead.session_id,
    sku: lead.sku,
    source_surface: lead.source_surface,
    normalized_message_text: lead.normalized_message_text,
  }) === fingerprintKey);

  const storedLead = existing ? mergeRecoveredLead(existing, next) : next;
  const remaining = leads.filter((lead) => lead.lead_id !== storedLead.lead_id);
  remaining.unshift(storedLead);
  await writeStorageWhatsAppLeads(remaining);
  return storedLead;
}

async function upsertFastWhatsAppLeadFromEvent(
  event: MarketingTrackingEvent,
  next: WhatsAppLeadRecord,
  fingerprintKey: string,
): Promise<WhatsAppLeadRecord> {
  const fastFingerprintKey = buildFastWhatsAppLeadFingerprintKey(fingerprintKey);
  const existingLeadId = await readFastMetaValue(fastFingerprintKey).catch(() => null);

  if (existingLeadId) {
    const existing = await getFastWhatsAppLead(String(existingLeadId || ''));
    if (existing?.lead_id) {
      const merged = mergeRecoveredLead(existing, next);
      await saveFastWhatsAppLead(merged);
      await writeFastMetaValue(`${FAST_WHATSAPP_LEAD_CAPTURE_PREFIX}${event.event_id}`, {
        ...event,
        lead_id: merged.lead_id,
        _captured_at: getNowIso(),
      });
      return merged;
    }
  }

  await saveFastWhatsAppLead(next);
  await writeFastMetaValue(`${FAST_WHATSAPP_LEAD_CAPTURE_PREFIX}${event.event_id}`, {
    ...event,
    lead_id: next.lead_id,
    _captured_at: getNowIso(),
  });
  return next;
}

async function readDedicatedWhatsAppLeadCaptureEvents(): Promise<any[]> {
  let events: any[] = [];

  try {
    const captureRows = await kv.getByPrefix(WHATSAPP_LEAD_CAPTURE_PREFIX);
    events = Array.isArray(captureRows) ? captureRows : [];
  } catch (error) {
    console.warn('[performance-marketing] WhatsApp lead capture prefix scan failed:', error);
  }

  if (!events.length) {
    try {
      const directCaptures = await readKvValuesByPrefixDirect(WHATSAPP_LEAD_CAPTURE_PREFIX, {
        ascending: false,
      });
      events = Array.isArray(directCaptures) ? directCaptures : [];
    } catch (error) {
      console.warn('[performance-marketing] direct WhatsApp lead capture scan failed:', error);
    }
  }

  return events
    .filter((event: any) => event && event.event_name === 'whatsapp_banner_lead')
    .sort((a: any, b: any) => new Date(a.event_time || a._captured_at || 0).getTime() - new Date(b.event_time || b._captured_at || 0).getTime());
}

type WhatsAppLeadRecoveryState = {
  byLeadId: Map<string, WhatsAppLeadRecord>;
  fingerprintToLeadId: Map<string, string>;
};

function mergeRecoveredLead(existing: WhatsAppLeadRecord, next: WhatsAppLeadRecord): WhatsAppLeadRecord {
  return {
    ...existing,
    click_count: Number(existing.click_count || 0) + 1,
    updated_at: getNowIso(),
    last_clicked_at: next.last_clicked_at,
    message_text: existing.message_text || next.message_text,
    normalized_message_text: existing.normalized_message_text || next.normalized_message_text,
    product_price: existing.product_price ?? next.product_price,
    cart_total: existing.cart_total ?? next.cart_total,
    checkout_total: existing.checkout_total ?? next.checkout_total,
    resolved_value: existing.resolved_value ?? next.resolved_value,
    gclid: existing.gclid || next.gclid,
    gbraid: existing.gbraid || next.gbraid,
    wbraid: existing.wbraid || next.wbraid,
    attribution_snapshot: {
      ...(existing.attribution_snapshot || {}),
      ...(next.attribution_snapshot || {}),
    },
  };
}

function applyRecoveryEvent(state: WhatsAppLeadRecoveryState, rawEvent: any) {
  if (!rawEvent || rawEvent.event_name !== 'whatsapp_banner_lead') return;
  const next = buildWhatsAppLeadFromEvent(rawEvent);
  const fingerprintKey = buildLeadFingerprint({
    session_id: next.session_id,
    sku: next.sku,
    source_surface: next.source_surface,
    normalized_message_text: next.normalized_message_text,
  });
  const existingLeadId = state.fingerprintToLeadId.get(fingerprintKey);

  if (existingLeadId) {
    const existing = state.byLeadId.get(existingLeadId);
    if (existing) {
      state.byLeadId.set(existingLeadId, mergeRecoveredLead(existing, next));
      return;
    }
  }

  state.byLeadId.set(next.lead_id, next);
  state.fingerprintToLeadId.set(fingerprintKey, next.lead_id);
}

async function readTrackingEventsForRecovery(): Promise<any[]> {
  let logs: any[] = [];

  try {
    logs = await readDedicatedWhatsAppLeadCaptureEvents();
  } catch (error) {
    console.warn('[performance-marketing] dedicated WhatsApp lead capture recovery failed:', error);
  }

  if (!logs.length) {
    try {
      const filteredLogs = await readKvValuesByPrefixDirect(EVENT_LOG_PREFIX, {
        ascending: false,
        jsonFieldEquals: {
          field: 'event_name',
          value: 'whatsapp_banner_lead',
        },
      });
      logs = Array.isArray(filteredLogs) ? filteredLogs : [];
    } catch (error) {
      console.warn('[performance-marketing] direct filtered event log scan failed:', error);
    }
  }

  if (!logs.length) {
    try {
      const kvLogs = await kv.getByPrefix(EVENT_LOG_PREFIX);
      logs = Array.isArray(kvLogs) ? kvLogs : [];
    } catch (error) {
      console.warn('[performance-marketing] event log prefix scan failed, trying direct fallback:', error);
    }
  }

  if (!logs.length) {
    try {
      const directLogs = await readKvValuesByPrefixDirect(EVENT_LOG_PREFIX);
      logs = Array.isArray(directLogs) ? directLogs : [];
    } catch (error) {
      console.warn('[performance-marketing] direct event log scan failed:', error);
    }
  }

  return logs
    .filter((event: any) => event && event.event_name === 'whatsapp_banner_lead')
    .sort((a: any, b: any) => new Date(a.event_time || 0).getTime() - new Date(b.event_time || 0).getTime());
}

async function recoverWhatsAppLeadsFromEventLogs(): Promise<WhatsAppLeadRecord[]> {
  const events = await readTrackingEventsForRecovery();
  if (!events.length) return [];

  const state: WhatsAppLeadRecoveryState = {
    byLeadId: new Map<string, WhatsAppLeadRecord>(),
    fingerprintToLeadId: new Map<string, string>(),
  };

  for (const event of events) {
    applyRecoveryEvent(state, event);
  }

  const leads = Array.from(state.byLeadId.values());
  if (!leads.length) return [];

  const leadKeys = leads.map((lead) => `${WHATSAPP_LEAD_PREFIX}${lead.lead_id}`);
  const leadValues = leads.map((lead) => lead);
  await msetKvValuesSafe(leadKeys, leadValues, 'recover_whatsapp_leads');

  const fpKeys = Array.from(state.fingerprintToLeadId.keys());
  const fpValues = fpKeys.map((key) => state.fingerprintToLeadId.get(key));
  if (fpKeys.length) {
    await msetKvValuesSafe(fpKeys, fpValues, 'recover_whatsapp_fingerprints');
  }

  await writeWhatsAppLeadIndex(leads.map((lead) => lead.lead_id));
  return leads;
}

export const DEFAULT_GOOGLE_ADS_CONFIG: GoogleAdsConfig = {
  auth_mode: (readEnv('GOOGLE_ADS_AUTH_MODE') as 'oauth_refresh_token' | 'service_account' | null) || 'oauth_refresh_token',
  manager_customer_id: readEnv('GOOGLE_ADS_MANAGER_CUSTOMER_ID'),
  customer_id: readEnv('GOOGLE_ADS_CUSTOMER_ID'),
  conversion_customer_id: readEnv('GOOGLE_ADS_CONVERSION_CUSTOMER_ID'),
  conversion_tracking_status: readEnv('GOOGLE_ADS_CONVERSION_TRACKING_STATUS'),
  merchant_center_id: readEnv('GOOGLE_ADS_MERCHANT_CENTER_ID'),
  developer_token: readEnv('GOOGLE_ADS_DEVELOPER_TOKEN'),
  oauth_client_id: readEnv('GOOGLE_ADS_CLIENT_ID'),
  oauth_client_secret: readEnv('GOOGLE_ADS_CLIENT_SECRET'),
  oauth_refresh_token: readEnv('GOOGLE_ADS_REFRESH_TOKEN'),
  service_account_project_id: readEnv('GOOGLE_ADS_SERVICE_ACCOUNT_PROJECT_ID'),
  service_account_client_email: readEnv('GOOGLE_ADS_SERVICE_ACCOUNT_CLIENT_EMAIL'),
  service_account_private_key_id: readEnv('GOOGLE_ADS_SERVICE_ACCOUNT_PRIVATE_KEY_ID'),
  service_account_private_key: readEnv('GOOGLE_ADS_SERVICE_ACCOUNT_PRIVATE_KEY'),
  service_account_token_uri: readEnv('GOOGLE_ADS_SERVICE_ACCOUNT_TOKEN_URI') || 'https://oauth2.googleapis.com/token',
  conversion_action_purchase_id: readEnv('GOOGLE_ADS_CONVERSION_ACTION_PURCHASE_ID'),
  conversion_action_whatsapp_lead_id: readEnv('GOOGLE_ADS_CONVERSION_ACTION_WHATSAPP_LEAD_ID'),
  conversion_action_whatsapp_closed_id: readEnv('GOOGLE_ADS_CONVERSION_ACTION_WHATSAPP_CLOSED_ID'),
  website_url: readEnv('GOOGLE_ADS_WEBSITE_URL') || 'https://www.toyoparts.com.br',
  pmax_feed_label: readEnv('GOOGLE_ADS_PMAX_FEED_LABEL'),
  pmax_default_daily_budget_brl: sanitizeNullableNumber(readEnv('GOOGLE_ADS_PMAX_DAILY_BUDGET_BRL')) ?? 150,
  pmax_default_target_roas: sanitizeNullableNumber(readEnv('GOOGLE_ADS_PMAX_TARGET_ROAS')),
  pmax_base_campaign_id: readEnv('GOOGLE_ADS_PMAX_BASE_CAMPAIGN_ID'),
  pmax_base_campaign_name: readEnv('GOOGLE_ADS_PMAX_BASE_CAMPAIGN_NAME') || 'Toyoparts | PMax Retail Base',
  pmax_base_asset_group_id: readEnv('GOOGLE_ADS_PMAX_BASE_ASSET_GROUP_ID'),
  pmax_last_provisioned_at: null,
  pmax_enabled: sanitizeBoolean(readEnv('GOOGLE_ADS_PMAX_ENABLED'), false),
  merchant_link_status: readEnv('GOOGLE_ADS_MERCHANT_LINK_STATUS'),
  last_successful_api_check_at: null,
  updated_at: null,
  updated_by: null,
};

export function sanitizeGoogleAdsConfig(
  raw: any,
  fallback: GoogleAdsConfig = DEFAULT_GOOGLE_ADS_CONFIG,
): GoogleAdsConfig {
  const rawAuthMode = sanitizeNullableString(raw?.auth_mode);
  const authMode = rawAuthMode === 'service_account' || rawAuthMode === 'oauth_refresh_token'
    ? rawAuthMode
    : fallback.auth_mode;
  return {
    auth_mode: authMode,
    manager_customer_id: sanitizeNullableString(raw?.manager_customer_id) ?? fallback.manager_customer_id,
    customer_id: sanitizeNullableString(raw?.customer_id) ?? fallback.customer_id,
    conversion_customer_id:
      sanitizeNullableString(raw?.conversion_customer_id) ?? fallback.conversion_customer_id,
    conversion_tracking_status:
      sanitizeNullableString(raw?.conversion_tracking_status) ?? fallback.conversion_tracking_status,
    merchant_center_id: sanitizeNullableString(raw?.merchant_center_id) ?? fallback.merchant_center_id,
    developer_token: sanitizeNullableString(raw?.developer_token) ?? fallback.developer_token,
    oauth_client_id: sanitizeNullableString(raw?.oauth_client_id) ?? fallback.oauth_client_id,
    oauth_client_secret: sanitizeNullableString(raw?.oauth_client_secret) ?? fallback.oauth_client_secret,
    oauth_refresh_token: sanitizeNullableString(raw?.oauth_refresh_token) ?? fallback.oauth_refresh_token,
    service_account_project_id:
      sanitizeNullableString(raw?.service_account_project_id) ?? fallback.service_account_project_id,
    service_account_client_email:
      sanitizeNullableString(raw?.service_account_client_email) ?? fallback.service_account_client_email,
    service_account_private_key_id:
      sanitizeNullableString(raw?.service_account_private_key_id) ?? fallback.service_account_private_key_id,
    service_account_private_key:
      sanitizeNullableString(raw?.service_account_private_key) ?? fallback.service_account_private_key,
    service_account_token_uri:
      sanitizeNullableString(raw?.service_account_token_uri) ?? fallback.service_account_token_uri,
    conversion_action_purchase_id:
      sanitizeNullableString(raw?.conversion_action_purchase_id) ?? fallback.conversion_action_purchase_id,
    conversion_action_whatsapp_lead_id:
      sanitizeNullableString(raw?.conversion_action_whatsapp_lead_id) ?? fallback.conversion_action_whatsapp_lead_id,
    conversion_action_whatsapp_closed_id:
      sanitizeNullableString(raw?.conversion_action_whatsapp_closed_id) ?? fallback.conversion_action_whatsapp_closed_id,
    website_url: sanitizeNullableString(raw?.website_url) ?? fallback.website_url,
    pmax_feed_label: sanitizeNullableString(raw?.pmax_feed_label) ?? fallback.pmax_feed_label,
    pmax_default_daily_budget_brl:
      sanitizeNullableNumber(raw?.pmax_default_daily_budget_brl) ?? fallback.pmax_default_daily_budget_brl,
    pmax_default_target_roas:
      sanitizeNullableNumber(raw?.pmax_default_target_roas) ?? fallback.pmax_default_target_roas,
    pmax_base_campaign_id:
      sanitizeNullableString(raw?.pmax_base_campaign_id) ?? fallback.pmax_base_campaign_id,
    pmax_base_campaign_name:
      sanitizeNullableString(raw?.pmax_base_campaign_name) ?? fallback.pmax_base_campaign_name,
    pmax_base_asset_group_id:
      sanitizeNullableString(raw?.pmax_base_asset_group_id) ?? fallback.pmax_base_asset_group_id,
    pmax_last_provisioned_at:
      sanitizeNullableString(raw?.pmax_last_provisioned_at) ?? fallback.pmax_last_provisioned_at,
    pmax_enabled: sanitizeBoolean(raw?.pmax_enabled, fallback.pmax_enabled),
    merchant_link_status: sanitizeNullableString(raw?.merchant_link_status) ?? fallback.merchant_link_status,
    last_successful_api_check_at:
      sanitizeNullableString(raw?.last_successful_api_check_at) ?? fallback.last_successful_api_check_at,
    updated_at: sanitizeNullableString(raw?.updated_at),
    updated_by: sanitizeNullableString(raw?.updated_by),
  };
}

export async function getGoogleAdsConfig(): Promise<GoogleAdsConfig> {
  let stored: any = null;
  let primaryError: any = null;

  try {
    stored = await kv.get(GOOGLE_ADS_CONFIG_KEY);
  } catch (error: any) {
    primaryError = error;
  }

  if (!stored && primaryError) {
    try {
      stored = await readKvValueDirect(GOOGLE_ADS_CONFIG_KEY);
    } catch (fallbackError: any) {
      const detail =
        String(fallbackError?.message || '').trim() ||
        String(primaryError?.message || '').trim() ||
        'erro desconhecido';
      throw new Error(`Falha ao carregar configuracao Google Ads: ${detail}`);
    }
  }

  return sanitizeGoogleAdsConfig(stored || {});
}

export async function saveGoogleAdsConfig(raw: any, updatedBy = 'admin'): Promise<GoogleAdsConfig> {
  const existing = await getGoogleAdsConfig();
  const next = sanitizeGoogleAdsConfig(raw, existing);
  const saved = {
    ...next,
    updated_at: getNowIso(),
    updated_by: updatedBy,
  };
  await kv.set(GOOGLE_ADS_CONFIG_KEY, saved);
  return saved;
}

export function redactGoogleAdsConfig(config: GoogleAdsConfig) {
  const mask = (value: string | null) => {
    const safe = String(value || '').trim();
    if (!safe) return null;
    if (safe.length <= 8) return `${safe.slice(0, 2)}***`;
    return `${safe.slice(0, 4)}***${safe.slice(-4)}`;
  };

  return {
    ...config,
    developer_token: mask(config.developer_token),
    oauth_client_secret: mask(config.oauth_client_secret),
    oauth_refresh_token: mask(config.oauth_refresh_token),
    service_account_private_key_id: mask(config.service_account_private_key_id),
    service_account_private_key: mask(config.service_account_private_key),
  };
}

export function buildWhatsAppLeadFromEvent(event: MarketingTrackingEvent): WhatsAppLeadRecord {
  const now = getNowIso();
  const messageText =
    normalizeMaybeText((event.properties || {}).message_text) ||
    extractMessageFromHref((event.properties || {}).href) ||
    normalizeMaybeText((event.properties || {}).whatsapp_message);
  const normalizedMessage = normalizeMessageText(messageText);
  const resolvedValue = parseMoney(event.resolved_value);
  const checkoutTotal = parseMoney((event.properties || {}).checkout_total);
  const cartTotal = parseMoney((event.properties || {}).cart_total);
  const productPrice =
    parseMoney((event.properties || {}).product_price) ||
    parseMoney((event.properties || {}).linked_product_price) ||
    parseMoney(event.ecommerce?.items?.[0]?.price);
  const scoreValue = getLeadStageScore({
    source_surface: event.source_surface,
    sku: event.linked_product_sku,
    resolved_value: resolvedValue,
    checkout_total: checkoutTotal,
    cart_total: cartTotal,
  });
  const status = stageFromScore(scoreValue);
  const attribution = extractAttributionSnapshot(event.attribution || {});

  return {
    lead_id: genId('wl_'),
    clicked_at: event.event_time || now,
    updated_at: now,
    last_clicked_at: event.event_time || now,
    click_count: 1,
    sku: normalizeSku(event.linked_product_sku),
    message_text: messageText,
    normalized_message_text: normalizedMessage,
    source_surface: sanitizeNullableString(event.source_surface),
    page_type: sanitizeNullableString(event.page_type),
    page_path: sanitizeNullableString(event.page_path),
    product_price: productPrice,
    cart_total: cartTotal,
    checkout_total: checkoutTotal,
    resolved_value: resolvedValue,
    gclid: sanitizeNullableString(attribution.gclid),
    gbraid: sanitizeNullableString(attribution.gbraid),
    wbraid: sanitizeNullableString(attribution.wbraid),
    utm_source: sanitizeNullableString(attribution.utm_source),
    utm_medium: sanitizeNullableString(attribution.utm_medium),
    utm_campaign: sanitizeNullableString(attribution.utm_campaign),
    utm_content: sanitizeNullableString(attribution.utm_content),
    utm_term: sanitizeNullableString(attribution.utm_term),
    session_id: sanitizeNullableString(event.session_id),
    anonymous_id: sanitizeNullableString(event.anonymous_id),
    user_id: sanitizeNullableString(event.user_id),
    status,
    score_band: normalizeScoreBand(scoreValue),
    score_value: scoreValue,
    matched_order_id: null,
    attribution_snapshot: attribution,
  };
}

export async function upsertWhatsAppLeadFromEvent(event: MarketingTrackingEvent): Promise<WhatsAppLeadRecord> {
  const next = buildWhatsAppLeadFromEvent(event);
  const fingerprintKey = buildLeadFingerprint({
    session_id: next.session_id,
    sku: next.sku,
    source_surface: next.source_surface,
    normalized_message_text: next.normalized_message_text,
  });
  let fastLead: WhatsAppLeadRecord | null = null;
  let storageLead: WhatsAppLeadRecord | null = null;

  try {
    fastLead = await upsertFastWhatsAppLeadFromEvent(event, next, fingerprintKey);
  } catch (error) {
    console.warn('[performance-marketing] fast WhatsApp lead persistence failed:', error);
  }

  try {
    storageLead = await upsertStorageWhatsAppLeadFromEvent(fastLead || next, fingerprintKey);
  } catch (error) {
    console.warn('[performance-marketing] storage WhatsApp lead persistence failed:', error);
  }

  try {
    const existingLeadId = await kv.get(fingerprintKey).catch(() => null);

    if (existingLeadId) {
      const existing = await kv.get(`${WHATSAPP_LEAD_PREFIX}${existingLeadId}`).catch(() => null);
      if (existing && existing.lead_id) {
        const merged: WhatsAppLeadRecord = {
          ...existing,
          click_count: Number(existing.click_count || 0) + 1,
          updated_at: getNowIso(),
          last_clicked_at: next.last_clicked_at,
          message_text: existing.message_text || next.message_text,
          normalized_message_text: existing.normalized_message_text || next.normalized_message_text,
          product_price: existing.product_price ?? next.product_price,
          cart_total: existing.cart_total ?? next.cart_total,
          checkout_total: existing.checkout_total ?? next.checkout_total,
          resolved_value: existing.resolved_value ?? next.resolved_value,
          gclid: existing.gclid || next.gclid,
          gbraid: existing.gbraid || next.gbraid,
          wbraid: existing.wbraid || next.wbraid,
          attribution_snapshot: {
            ...(existing.attribution_snapshot || {}),
            ...(next.attribution_snapshot || {}),
          },
        };
        await setKvValueSafe(`${WHATSAPP_LEAD_PREFIX}${merged.lead_id}`, merged, 'update_whatsapp_lead');
        await rememberWhatsAppLeadId(merged.lead_id);
        return merged;
      }
    }

    await setKvValueSafe(`${WHATSAPP_LEAD_PREFIX}${next.lead_id}`, next, 'create_whatsapp_lead');
    await setKvValueSafe(fingerprintKey, next.lead_id, 'whatsapp_fingerprint');
    await rememberWhatsAppLeadId(next.lead_id);
    return next;
  } catch (error) {
    console.warn('[performance-marketing] kv WhatsApp lead persistence failed, using fast fallback:', error);
    if (fastLead) return fastLead;
    if (storageLead) return storageLead;
    throw error;
  }
}

export async function persistWhatsAppLeadOperational(event: MarketingTrackingEvent): Promise<WhatsAppLeadRecord> {
  const next = buildWhatsAppLeadFromEvent(event);
  const fingerprintKey = buildLeadFingerprint({
    session_id: next.session_id,
    sku: next.sku,
    source_surface: next.source_surface,
    normalized_message_text: next.normalized_message_text,
  });
  let storageErrorMessage: string | null = null;

  try {
    const stored = await upsertStorageWhatsAppLeadFromEvent(next, fingerprintKey);
    try {
      await upsertFastWhatsAppLeadFromEvent(event, stored, fingerprintKey);
    } catch (error) {
      console.warn('[performance-marketing] fast WhatsApp operational backup failed:', error);
    }
    return stored;
  } catch (storageError) {
    storageErrorMessage = String((storageError as any)?.message || storageError || 'unknown_storage_error');
    console.warn('[performance-marketing] storage WhatsApp operational persistence failed:', storageError);
  }

  try {
    return await upsertFastWhatsAppLeadFromEvent(event, next, fingerprintKey);
  } catch (fastError) {
    const fastErrorMessage = String((fastError as any)?.message || fastError || 'unknown_fast_error');
    throw new Error(`storage=${storageErrorMessage || 'n/a'} | fast=${fastErrorMessage}`);
  }
}

export async function getWhatsAppLead(leadId: string): Promise<WhatsAppLeadRecord | null> {
  const safe = String(leadId || '').trim();
  if (!safe) return null;
  let lead = await kv.get(`${WHATSAPP_LEAD_PREFIX}${safe}`).catch(() => null);
  if (!lead) {
    try {
      lead = await readKvValueDirect(`${WHATSAPP_LEAD_PREFIX}${safe}`);
    } catch (error) {
      console.warn('[performance-marketing] direct WhatsApp lead read failed:', error);
    }
  }
  if (!lead) {
    try {
      lead = await getFastWhatsAppLead(safe);
    } catch (error) {
      console.warn('[performance-marketing] fast WhatsApp lead read failed:', error);
    }
  }
  if (!lead) {
    try {
      lead = await getStorageWhatsAppLead(safe);
    } catch (error) {
      console.warn('[performance-marketing] storage WhatsApp lead read failed:', error);
    }
  }
  return lead && lead.lead_id ? lead as WhatsAppLeadRecord : null;
}

export async function listWhatsAppLeads(): Promise<WhatsAppLeadRecord[]> {
  let leads: WhatsAppLeadRecord[] = [];

  try {
    leads = await listWhatsAppLeadsFromIndex();
  } catch (error) {
    console.warn('[performance-marketing] WhatsApp lead index read failed:', error);
  }

  if (!leads.length) {
    try {
      leads = await listFastWhatsAppLeads();
    } catch (error) {
      console.warn('[performance-marketing] fast WhatsApp lead scan failed:', error);
    }
  }

  if (!leads.length) {
    try {
      leads = await readStorageWhatsAppLeads();
    } catch (error) {
      console.warn('[performance-marketing] storage WhatsApp lead scan failed:', error);
    }
  }

  if (!leads.length) {
    try {
      const rawLeads = await kv.getByPrefix(WHATSAPP_LEAD_PREFIX);
      leads = (Array.isArray(rawLeads) ? rawLeads : []).filter((lead: any): lead is WhatsAppLeadRecord => Boolean(lead?.lead_id));
      if (leads.length) {
        await writeWhatsAppLeadIndex(leads.map((lead) => lead.lead_id)).catch(() => {});
      }
    } catch (error) {
      console.warn('[performance-marketing] WhatsApp lead prefix scan failed, trying direct fallback:', error);
    }
  }

  if (!leads.length) {
    try {
      leads = await listWhatsAppLeadsDirect();
    } catch (error) {
      console.warn('[performance-marketing] direct WhatsApp lead scan failed:', error);
    }
  }

  if (!leads.length) {
    try {
      leads = await recoverWhatsAppLeadsFromEventLogs();
    } catch (error) {
      console.warn('[performance-marketing] WhatsApp lead recovery from event logs failed:', error);
    }
  }

  return leads
    .filter((lead: any) => lead && lead.lead_id)
    .sort((a: any, b: any) => new Date(b.last_clicked_at || b.clicked_at || 0).getTime() - new Date(a.last_clicked_at || a.clicked_at || 0).getTime());
}

export async function saveWhatsAppLead(lead: WhatsAppLeadRecord) {
  let savedSomewhere = false;
  let lastError: any = null;

  try {
    await setKvValueSafe(`${WHATSAPP_LEAD_PREFIX}${lead.lead_id}`, lead, 'save_whatsapp_lead');
    await rememberWhatsAppLeadId(lead.lead_id);
    savedSomewhere = true;
  } catch (error) {
    lastError = error;
    console.warn('[performance-marketing] kv WhatsApp lead save failed:', error);
  }

  try {
    await saveFastWhatsAppLead(lead);
    savedSomewhere = true;
  } catch (error) {
    lastError = error;
    console.warn('[performance-marketing] fast WhatsApp lead save failed:', error);
  }

  try {
    await saveStorageWhatsAppLead(lead);
    savedSomewhere = true;
  } catch (error) {
    lastError = error;
    console.warn('[performance-marketing] storage WhatsApp lead save failed:', error);
  }

  if (!savedSomewhere && lastError) {
    throw lastError;
  }
}

function stringSimilarity(a: string | null, b: string | null): number {
  const left = normalizeMessageText(a) || '';
  const right = normalizeMessageText(b) || '';
  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftTokens = new Set(left.split(' ').filter(Boolean));
  const rightTokens = new Set(right.split(' ').filter(Boolean));
  const union = new Set([...leftTokens, ...rightTokens]);
  if (!union.size) return 0;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }

  return overlap / union.size;
}

function minutesBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  const first = new Date(String(a || '')).getTime();
  const second = new Date(String(b || '')).getTime();
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  return Math.abs(first - second) / 60000;
}

function buildCandidateScore(lead: WhatsAppLeadRecord, sale: ManualWhatsAppSaleDraft) {
  let score = 0;
  const reasons: string[] = [];
  const saleSku = normalizeSku(sale.sku);
  const leadSku = normalizeSku(lead.sku);
  if (saleSku && leadSku && saleSku === leadSku) {
    score += 50;
    reasons.push('SKU igual');
  }

  const similarity = stringSimilarity(lead.message_text, sale.message_text);
  if (similarity >= 0.99) {
    score += 30;
    reasons.push('mensagem idêntica');
  } else if (similarity >= 0.6) {
    score += 20;
    reasons.push('mensagem muito parecida');
  }

  const minutes = minutesBetween(lead.last_clicked_at || lead.clicked_at, sale.sale_time || sale.paid_at);
  if (minutes != null) {
    if (minutes <= 10) {
      score += 25;
      reasons.push('clique em até 10 min');
    } else if (minutes <= 30) {
      score += 15;
      reasons.push('clique em até 30 min');
    } else if (minutes <= 120) {
      score += 8;
      reasons.push('clique em até 2h');
    }
  }

  const source = String(lead.source_surface || '').toLowerCase();
  if (source.includes('checkout') || source.includes('shipping') || source.includes('pdp') || source.includes('product')) {
    score += 10;
    reasons.push('surface forte');
  }

  const leadValue = Number(lead.checkout_total || lead.cart_total || lead.product_price || lead.resolved_value || 0);
  const saleValue = Number(sale.total || 0);
  if (leadValue > 0 && saleValue > 0) {
    const diff = Math.abs(leadValue - saleValue);
    const ratio = diff / Math.max(leadValue, saleValue);
    if (ratio <= 0.1) {
      score += 10;
      reasons.push('valor próximo');
    } else if (ratio <= 0.25) {
      score += 6;
      reasons.push('valor compatível');
    }
  }

  return {
    score,
    reasons,
    confidence: score >= 80 ? 'high' : score >= 45 ? 'medium' : 'low',
  } as const;
}

export async function findLeadCandidatesForSale(
  sale: ManualWhatsAppSaleDraft,
): Promise<WhatsAppLeadCandidateMatch[]> {
  const allLeads = await listWhatsAppLeads();
  return allLeads
    .filter((lead) => !lead.matched_order_id)
    .map((lead) => {
      const scored = buildCandidateScore(lead, sale);
      return {
        lead_id: lead.lead_id,
        score: scored.score,
        confidence: scored.confidence,
        reasons: scored.reasons,
        lead,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.lead.last_clicked_at || b.lead.clicked_at).getTime() - new Date(a.lead.last_clicked_at || a.lead.clicked_at).getTime();
    })
    .slice(0, 12);
}

export function sanitizeManualWhatsAppSaleDraft(raw: any): ManualWhatsAppSaleDraft {
  return {
    order_id: sanitizeNullableString(raw?.order_id) || undefined,
    sale_time: sanitizeNullableString(raw?.sale_time) || undefined,
    paid_at: sanitizeNullableString(raw?.paid_at) || undefined,
    sku: normalizeSku(raw?.sku) || undefined,
    item_name: sanitizeNullableString(raw?.item_name) || undefined,
    quantity: Number.isFinite(Number(raw?.quantity)) ? Number(raw.quantity) : 1,
    unit_price: parseMoney(raw?.unit_price) ?? undefined,
    total: parseMoney(raw?.total) ?? undefined,
    message_text: sanitizeNullableString(raw?.message_text) || undefined,
    source_surface: sanitizeNullableString(raw?.source_surface) || undefined,
    customer_name: sanitizeNullableString(raw?.customer_name) || undefined,
    customer_email: sanitizeNullableString(raw?.customer_email) || undefined,
    customer_phone: sanitizeNullableString(raw?.customer_phone) || undefined,
    transaction_id: sanitizeNullableString(raw?.transaction_id) || undefined,
    payment_status: sanitizeNullableString(raw?.payment_status) || 'paid',
    lead_id: sanitizeNullableString(raw?.lead_id),
  };
}

export function buildAttributionSnapshotFromLead(lead?: WhatsAppLeadRecord | null): MarketingAttributionSnapshot {
  return {
    ...(lead?.attribution_snapshot || {}),
    gclid: sanitizeNullableString(lead?.gclid) || undefined,
    gbraid: sanitizeNullableString(lead?.gbraid) || undefined,
    wbraid: sanitizeNullableString(lead?.wbraid) || undefined,
    utm_source: sanitizeNullableString(lead?.utm_source) || undefined,
    utm_medium: sanitizeNullableString(lead?.utm_medium) || undefined,
    utm_campaign: sanitizeNullableString(lead?.utm_campaign) || undefined,
    utm_content: sanitizeNullableString(lead?.utm_content) || undefined,
    utm_term: sanitizeNullableString(lead?.utm_term) || undefined,
    session_id: sanitizeNullableString(lead?.session_id) || undefined,
    anonymous_id: sanitizeNullableString(lead?.anonymous_id) || undefined,
    user_id: sanitizeNullableString(lead?.user_id) || undefined,
  };
}

export function getUsefulClickIdentifier(lead?: WhatsAppLeadRecord | null) {
  if (!lead) return null;
  if (lead.gclid) return { type: 'gclid' as const, value: lead.gclid };
  if (lead.gbraid) return { type: 'gbraid' as const, value: lead.gbraid };
  if (lead.wbraid) return { type: 'wbraid' as const, value: lead.wbraid };
  return null;
}

export async function listOfflineConversionJobs(): Promise<OfflineConversionJob[]> {
  let jobs: OfflineConversionJob[] = [];
  try {
    const prefixRows = await kv.getByPrefix(OFFLINE_CONVERSION_JOB_PREFIX);
    jobs = (Array.isArray(prefixRows) ? prefixRows : []).filter((job: any): job is OfflineConversionJob => Boolean(job?.job_id));
  } catch (error) {
    console.warn('[performance-marketing] offline conversion prefix scan failed, trying direct fallback:', error);
  }

  if (!jobs.length) {
    try {
      const directRows = await readKvValuesByPrefixDirect(OFFLINE_CONVERSION_JOB_PREFIX);
      jobs = (Array.isArray(directRows) ? directRows : []).filter((job: any): job is OfflineConversionJob => Boolean(job?.job_id));
    } catch (error) {
      console.warn('[performance-marketing] direct offline conversion scan failed:', error);
    }
  }

  return jobs
    .filter((job: any) => job && job.job_id)
    .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
}

export async function getOfflineConversionJob(jobId: string): Promise<OfflineConversionJob | null> {
  const safe = String(jobId || '').trim();
  if (!safe) return null;
  const job = await kv.get(`${OFFLINE_CONVERSION_JOB_PREFIX}${safe}`).catch(() => null);
  return job && job.job_id ? job as OfflineConversionJob : null;
}

export async function saveOfflineConversionJob(job: OfflineConversionJob) {
  await setKvValueSafe(`${OFFLINE_CONVERSION_JOB_PREFIX}${job.job_id}`, job, 'save_offline_conversion_job');
}

export async function enqueueOfflineConversionJob(params: {
  lead: WhatsAppLeadRecord;
  order: any;
  conversion_value: number;
  transaction_id: string;
}): Promise<OfflineConversionJob | null> {
  const clickIdentifier = getUsefulClickIdentifier(params.lead);
  if (!clickIdentifier) return null;

  const existingJobs = await listOfflineConversionJobs();
  const duplicate = existingJobs.find((job) =>
    job.order_id === String(params.order?.orderId || '') &&
    job.transaction_id === params.transaction_id &&
    job.conversion_action === 'Purchase - WhatsApp Closed',
  );
  if (duplicate) return duplicate;

  const now = getNowIso();
  const job: OfflineConversionJob = {
    job_id: genId('ocj_'),
    lead_id: params.lead.lead_id,
    order_id: String(params.order?.orderId || '').trim(),
    conversion_action: 'Purchase - WhatsApp Closed',
    click_id_type: clickIdentifier.type,
    click_id_value: clickIdentifier.value,
    conversion_time: sanitizeNullableString(params.order?.paid_at || params.order?.updatedAt || now) || now,
    conversion_value: Number(Number(params.conversion_value || 0).toFixed(2)),
    currency_code: 'BRL',
    transaction_id: params.transaction_id,
    status: 'pending',
    attempts: 0,
    last_error: null,
    created_at: now,
    updated_at: now,
    sent_at: null,
  };
  await saveOfflineConversionJob(job);
  return job;
}

export function summarizeOfflineJobs(jobs: OfflineConversionJob[], linkedOrders: any[] = []) {
  const summary = {
    pending: 0,
    failed: 0,
    sent: 0,
    dead_letter: 0,
    attributed_internal_only: 0,
  };

  for (const job of jobs) {
    summary[job.status] += 1;
  }

  for (const order of linkedOrders) {
    if (String(order?.order_source || '') !== 'whatsapp_manual') continue;
    if (!order?.lead_id) continue;
    const hasUsefulId = Boolean(
      order?.attribution_snapshot?.gclid ||
      order?.attribution_snapshot?.gbraid ||
      order?.attribution_snapshot?.wbraid,
    );
    const hasJob = jobs.some((job) => job.order_id === order.orderId);
    if (!hasUsefulId && !hasJob) summary.attributed_internal_only += 1;
  }

  return summary;
}
