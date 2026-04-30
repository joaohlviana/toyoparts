import { Hono } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2.49.8';
import * as meili from './meilisearch.tsx';
import {
  applyCategoryEnrichmentUpdate,
  buildCategoryEnrichmentRows,
  extractCategoryIds,
  normalizeSku,
  resolveInStock,
} from './catalogo.tsx';

const adminApp = new Hono();
const cronApp = new Hono();

const RUNS_TABLE = 'category_engine_runs_1d6e33e0';
const ITEMS_TABLE = 'category_engine_items_1d6e33e0';
const LOGS_TABLE = 'category_engine_logs_1d6e33e0';
const SETTINGS_TABLE = 'category_engine_settings_1d6e33e0';
const KV_TABLE = 'kv_store_1d6e33e0';
const PRODUCT_PREFIX = 'product:';
const MAX_BATCH_SIZE = 50;
const MAX_CONCURRENCY = 5;
const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_RETRY_LIMIT = 5;
const DEFAULT_FALLBACK_ROOT_CATEGORY_ID = '-500';
const DEFAULT_WATERMARK_LOW = 150;
const DEFAULT_WATERMARK_TARGET = 500;
const STALE_ANALYZING_MINUTES = 30;
const CATEGORY_ENGINE_CONFIDENCE = 0.7;
const RETRY_BACKOFF_MINUTES = [5, 30, 120, 720, 1440];
const ACTIVE_RUN_STATUSES = ['queued', 'running', 'paused'];
const PROCESSABLE_ITEM_STATUSES = ['pending', 'retry_wait'];
const TICK_TIME_BUDGET_MS = 110_000;
const TICK_MAX_BATCH_CYCLES = 3;

type RunStatus = 'queued' | 'running' | 'paused' | 'completed' | 'completed_with_errors' | 'failed' | 'canceled';
type ItemStatus = 'pending' | 'analyzing' | 'suggested' | 'applied' | 'retry_wait' | 'failed' | 'skipped';
type DecisionSource = 'toyota' | 'regra' | 'similaridade' | 'ia_forced_choice' | 'fallback_root';
type LogLevel = 'info' | 'warning' | 'error' | 'success';
type LogStage = 'discover' | 'analyze' | 'decide' | 'apply' | 'retry' | 'complete';

interface CategoryEngineSettings {
  id: string;
  enabled: boolean;
  batch_size: number;
  max_concurrency: number;
  retry_limit: number;
  fallback_root_category_id: string;
  cron_enabled: boolean;
  watermark_low: number;
  watermark_target: number;
  updated_at?: string;
}

interface CategoryEngineRun {
  run_id: string;
  status: RunStatus;
  mode: 'continuous';
  started_at: string;
  last_heartbeat_at: string;
  completed_at?: string | null;
  discovered_count: number;
  processed_count: number;
  applied_count: number;
  retry_count: number;
  failed_count: number;
  skipped_count: number;
  low_confidence_auto_applied_count: number;
  current_sku?: string | null;
  source_summary?: Record<string, any>;
  last_error?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface CategoryEngineItem {
  run_id: string;
  sku: string;
  status: ItemStatus;
  attempt_count: number;
  next_retry_at?: string | null;
  current_category_ids?: string[] | null;
  suggested_category_id?: string | null;
  suggested_category_path?: string | null;
  confidence?: number | null;
  decision_source?: DecisionSource | null;
  review_flag?: boolean | null;
  payload_json?: any;
  last_error?: string | null;
  applied_at?: string | null;
  updated_at?: string;
}

function getSupabase() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

function nowIso() {
  return new Date().toISOString();
}

function addMinutesToIso(base: Date, minutes: number) {
  return new Date(base.getTime() + (minutes * 60_000)).toISOString();
}

function clampNumber(value: any, min: number, max: number, fallback: number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(num)));
}

function isMissingRelationError(error: any) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('does not exist') || message.includes('relation') || message.includes('schema cache');
}

function isTransientEngineError(error: any) {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('fetch failed') ||
    message.includes('too many') ||
    message.includes('connection') ||
    message.includes('statement timeout') ||
    message.includes('temporar') ||
    message.includes('openai') ||
    message.includes('toyota')
  );
}

function computeRetryAt(attemptCount: number) {
  const index = Math.max(0, Math.min(RETRY_BACKOFF_MINUTES.length - 1, attemptCount - 1));
  return addMinutesToIso(new Date(), RETRY_BACKOFF_MINUTES[index]);
}

function encodeCursor(payload: Record<string, any>) {
  return btoa(JSON.stringify(payload));
}

function decodeCursor(cursor: string | null) {
  if (!cursor) return null;
  try {
    return JSON.parse(atob(cursor));
  } catch {
    return null;
  }
}

function emptyStatusResponse(extra: Record<string, any> = {}) {
  return {
    ok: true,
    settings: null,
    activeRun: null,
    summary: {
      pending: 0,
      analyzing: 0,
      retry_wait: 0,
      due_retries: 0,
      applied: 0,
      failed: 0,
      skipped: 0,
      review_flag_count: 0,
      discovered: 0,
      processed: 0,
      remaining: 0,
      throughput_per_hour: 0,
    },
    currentItems: [],
    recentLogs: [],
    recentRuns: [],
    eligibleTotal: null,
    health: {
      tablesReady: false,
      cronStrategy: 'vercel_cron',
      message: 'Motor ainda nao configurado no banco',
    },
    ...extra,
  };
}

async function loadSettings(supabase = getSupabase()): Promise<CategoryEngineSettings> {
  const defaults: CategoryEngineSettings = {
    id: 'default',
    enabled: true,
    batch_size: DEFAULT_BATCH_SIZE,
    max_concurrency: DEFAULT_CONCURRENCY,
    retry_limit: DEFAULT_RETRY_LIMIT,
    fallback_root_category_id: DEFAULT_FALLBACK_ROOT_CATEGORY_ID,
    cron_enabled: true,
    watermark_low: DEFAULT_WATERMARK_LOW,
    watermark_target: DEFAULT_WATERMARK_TARGET,
  };

  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .upsert(defaults, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) throw error;

  return {
    ...defaults,
    ...data,
    batch_size: clampNumber(data?.batch_size, 1, MAX_BATCH_SIZE, DEFAULT_BATCH_SIZE),
    max_concurrency: clampNumber(data?.max_concurrency, 1, MAX_CONCURRENCY, DEFAULT_CONCURRENCY),
    retry_limit: clampNumber(data?.retry_limit, 1, 10, DEFAULT_RETRY_LIMIT),
    watermark_low: clampNumber(data?.watermark_low, 1, 1_000, DEFAULT_WATERMARK_LOW),
    watermark_target: clampNumber(data?.watermark_target, 1, 2_000, DEFAULT_WATERMARK_TARGET),
    fallback_root_category_id: String(data?.fallback_root_category_id || DEFAULT_FALLBACK_ROOT_CATEGORY_ID),
  };
}

async function appendLog(
  supabase: ReturnType<typeof getSupabase>,
  runId: string,
  level: LogLevel,
  stage: LogStage,
  message: string,
  payload: Record<string, any> = {},
  sku?: string | null,
) {
  await supabase.from(LOGS_TABLE).insert({
    run_id: runId,
    sku: sku || null,
    level,
    stage,
    message,
    payload_json: payload,
    created_at: nowIso(),
  });
}

async function getActiveRun(supabase = getSupabase()): Promise<CategoryEngineRun | null> {
  const { data, error } = await supabase
    .from(RUNS_TABLE)
    .select('*')
    .in('status', ACTIVE_RUN_STATUSES)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as CategoryEngineRun | null;
}

async function getLatestRun(supabase = getSupabase()): Promise<CategoryEngineRun | null> {
  const { data, error } = await supabase
    .from(RUNS_TABLE)
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as CategoryEngineRun | null;
}

async function refreshRunMetrics(supabase: ReturnType<typeof getSupabase>, runId: string) {
  const countByStatus = async (status: ItemStatus) => {
    const { count, error } = await supabase
      .from(ITEMS_TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('run_id', runId)
      .eq('status', status);
    if (error) throw error;
    return count || 0;
  };

  const countDueRetries = async () => {
    const { count, error } = await supabase
      .from(ITEMS_TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('run_id', runId)
      .eq('status', 'retry_wait')
      .lte('next_retry_at', nowIso());
    if (error) throw error;
    return count || 0;
  };

  const countReviewFlags = async () => {
    const { count, error } = await supabase
      .from(ITEMS_TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('run_id', runId)
      .eq('status', 'applied')
      .eq('review_flag', true);
    if (error) throw error;
    return count || 0;
  };

  const countTotal = async () => {
    const { count, error } = await supabase
      .from(ITEMS_TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('run_id', runId);
    if (error) throw error;
    return count || 0;
  };

  const [pending, analyzing, retryWait, applied, failed, skipped, dueRetries, reviewFlags, discovered] = await Promise.all([
    countByStatus('pending'),
    countByStatus('analyzing'),
    countByStatus('retry_wait'),
    countByStatus('applied'),
    countByStatus('failed'),
    countByStatus('skipped'),
    countDueRetries(),
    countReviewFlags(),
    countTotal(),
  ]);

  const processed = applied + failed + skipped;
  const retryCount = retryWait;

  const { data: updated, error } = await supabase
    .from(RUNS_TABLE)
    .update({
      discovered_count: discovered,
      processed_count: processed,
      applied_count: applied,
      retry_count: retryCount,
      failed_count: failed,
      skipped_count: skipped,
      low_confidence_auto_applied_count: reviewFlags,
      last_heartbeat_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq('run_id', runId)
    .select('*')
    .single();

  if (error) throw error;

  return {
    run: updated as CategoryEngineRun,
    summary: {
      pending,
      analyzing,
      retry_wait: retryWait,
      due_retries: dueRetries,
      applied,
      failed,
      skipped,
      review_flag_count: reviewFlags,
      discovered,
      processed,
      remaining: pending + analyzing + retryWait,
    },
  };
}

async function countEligibleProducts() {
  if (!meili.isConfigured()) return null;
  try {
    const result = await meili.search('', {
      limit: 1,
      offset: 0,
      filter: ['status = 1', 'in_stock = true', 'category_ids IS EMPTY'],
      facets: [],
    });
    return result?.totalHits ?? result?.estimatedTotalHits ?? null;
  } catch {
    return null;
  }
}

async function discoverEligibleSkus(
  limit: number,
  excludeSkus: Set<string>,
): Promise<{ skus: string[]; source: string; totalCandidates: number | null }> {
  const target = Math.max(0, limit);
  if (!target) return { skus: [], source: 'none', totalCandidates: 0 };

  if (meili.isConfigured()) {
    const selected: string[] = [];
    const seen = new Set<string>();
    let offset = 0;
    let totalCandidates: number | null = null;

    while (selected.length < target && offset < 2_500) {
      const pageLimit = Math.min(200, target - selected.length + excludeSkus.size);
      const result = await meili.search('', {
        limit: pageLimit,
        offset,
        filter: ['status = 1', 'in_stock = true', 'category_ids IS EMPTY'],
        sort: ['created_at:desc'],
        facets: [],
      });

      const hits = Array.isArray(result?.hits) ? result.hits : [];
      totalCandidates = result?.totalHits ?? result?.estimatedTotalHits ?? totalCandidates;
      if (!hits.length) break;

      for (const hit of hits) {
        const sku = normalizeSku(hit?.sku || '');
        if (!sku || seen.has(sku) || excludeSkus.has(sku)) continue;
        seen.add(sku);
        selected.push(sku);
        if (selected.length >= target) break;
      }

      if (hits.length < pageLimit) break;
      offset += hits.length;
    }

    if (selected.length > 0) {
      return { skus: selected.slice(0, target), source: 'meilisearch', totalCandidates };
    }
  }

  const supabase = getSupabase();
  const selected: string[] = [];
  const seen = new Set<string>();
  const batchSize = 400;
  const upperBound = `${PRODUCT_PREFIX}\uffff`;
  let cursorKey: string | null = null;
  let scanned = 0;

  while (selected.length < target && scanned < 5_000) {
    let query = supabase
      .from(KV_TABLE)
      .select('key, value')
      .gte('key', PRODUCT_PREFIX)
      .lt('key', upperBound)
      .order('key', { ascending: true })
      .limit(batchSize);

    if (cursorKey) query = query.gt('key', cursorKey);

    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;

    scanned += data.length;
    cursorKey = data[data.length - 1]?.key || null;

    for (const row of data) {
      const product = row?.value;
      const sku = normalizeSku(product?.sku || '');
      if (!sku || seen.has(sku) || excludeSkus.has(sku)) continue;
      if (!(String(product?.status || '') === '1' || product?.status === 1)) continue;
      if (!resolveInStock(product)) continue;
      if (extractCategoryIds(product).length > 0) continue;
      seen.add(sku);
      selected.push(sku);
      if (selected.length >= target) break;
    }

    if (!cursorKey) break;
  }

  return {
    skus: selected.slice(0, target),
    source: 'kv_bounded_fallback',
    totalCandidates: selected.length,
  };
}

async function createRun(
  supabase: ReturnType<typeof getSupabase>,
  settings: CategoryEngineSettings,
  seedNow = true,
): Promise<CategoryEngineRun | null> {
  const now = nowIso();
  const runId = crypto.randomUUID();

  try {
    const { data, error } = await supabase
      .from(RUNS_TABLE)
      .insert({
        run_id: runId,
        status: 'queued',
        mode: 'continuous',
        started_at: now,
        last_heartbeat_at: now,
        discovered_count: 0,
        processed_count: 0,
        applied_count: 0,
        retry_count: 0,
        failed_count: 0,
        skipped_count: 0,
        low_confidence_auto_applied_count: 0,
        source_summary: {},
        current_sku: null,
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single();

    if (error) throw error;

    const run = data as CategoryEngineRun;
    if (seedNow) {
      await refillRunBuffer(supabase, run.run_id, settings);
      await supabase.from(RUNS_TABLE).update({ status: 'running', updated_at: nowIso() }).eq('run_id', run.run_id);
      await appendLog(supabase, run.run_id, 'info', 'discover', 'Motor iniciado com nova fila', { source: 'start' });
      const { run: refreshedRun } = await refreshRunMetrics(supabase, run.run_id);
      return refreshedRun;
    }

    return run;
  } catch (error: any) {
    const message = String(error?.message || error || '');
    if (message.toLowerCase().includes('uq_category_engine_active_run_1d6e33e0')) {
      return await getActiveRun(supabase);
    }
    throw error;
  }
}

async function getRunSkuSet(supabase: ReturnType<typeof getSupabase>, runId: string) {
  const { data, error } = await supabase
    .from(ITEMS_TABLE)
    .select('sku')
    .eq('run_id', runId)
    .limit(10_000);
  if (error) throw error;
  return new Set((data || []).map((row: any) => normalizeSku(row?.sku || '')).filter(Boolean));
}

async function mergeRunSourceSummary(
  supabase: ReturnType<typeof getSupabase>,
  run: CategoryEngineRun,
  source: string,
  added: number,
) {
  const current = typeof run.source_summary === 'object' && run.source_summary ? run.source_summary : {};
  const sourceCounts = typeof current?.source_counts === 'object' && current.source_counts ? current.source_counts : {};
  const next = {
    ...current,
    last_source: source,
    last_seeded_count: added,
    source_counts: {
      ...sourceCounts,
      [source]: Number(sourceCounts[source] || 0) + added,
    },
  };

  const { data, error } = await supabase
    .from(RUNS_TABLE)
    .update({ source_summary: next, updated_at: nowIso() })
    .eq('run_id', run.run_id)
    .select('*')
    .single();

  if (error) throw error;
  return data as CategoryEngineRun;
}

async function refillRunBuffer(
  supabase: ReturnType<typeof getSupabase>,
  runId: string,
  settings: CategoryEngineSettings,
) {
  const { summary } = await refreshRunMetrics(supabase, runId);
  if (summary.remaining >= settings.watermark_low) return { seeded: 0, source: 'buffer-ok' };

  const run = await supabase.from(RUNS_TABLE).select('*').eq('run_id', runId).single();
  if (run.error) throw run.error;

  const existingSkus = await getRunSkuSet(supabase, runId);
  const need = Math.max(0, settings.watermark_target - summary.remaining);
  if (!need) return { seeded: 0, source: 'buffer-ok' };

  const discovered = await discoverEligibleSkus(need, existingSkus);
  const insertable = discovered.skus
    .map((sku) => normalizeSku(sku))
    .filter((sku) => sku && !existingSkus.has(sku))
    .slice(0, need);

  if (!insertable.length) return { seeded: 0, source: discovered.source };

  const now = nowIso();
  const rows = insertable.map((sku) => ({
    run_id: runId,
    sku,
    status: 'pending' as ItemStatus,
    attempt_count: 0,
    next_retry_at: null,
    current_category_ids: [],
    suggested_category_id: null,
    suggested_category_path: null,
    confidence: 0,
    decision_source: null,
    review_flag: false,
    payload_json: {},
    last_error: null,
    applied_at: null,
    updated_at: now,
  }));

  const { error } = await supabase
    .from(ITEMS_TABLE)
    .upsert(rows, { onConflict: 'run_id,sku', ignoreDuplicates: true });

  if (error) throw error;

  const updatedRun = await mergeRunSourceSummary(supabase, run.data as CategoryEngineRun, discovered.source, insertable.length);
  await appendLog(supabase, runId, 'info', 'discover', `Fila reabastecida com ${insertable.length} SKU(s)`, {
    source: discovered.source,
    total_candidates: discovered.totalCandidates,
  });
  await refreshRunMetrics(supabase, runId);
  return { seeded: insertable.length, source: discovered.source, run: updatedRun };
}

async function recoverStaleAnalyzingItems(
  supabase: ReturnType<typeof getSupabase>,
  runId: string,
  settings: CategoryEngineSettings,
) {
  const staleCutoff = new Date(Date.now() - STALE_ANALYZING_MINUTES * 60_000).toISOString();
  const { data, error } = await supabase
    .from(ITEMS_TABLE)
    .select('*')
    .eq('run_id', runId)
    .eq('status', 'analyzing')
    .lt('updated_at', staleCutoff)
    .limit(settings.batch_size);

  if (error) throw error;
  if (!data?.length) return 0;

  let recovered = 0;
  for (const item of data as CategoryEngineItem[]) {
    const nextStatus: ItemStatus = item.attempt_count >= settings.retry_limit ? 'failed' : 'retry_wait';
    const nextRetryAt = nextStatus === 'retry_wait' ? computeRetryAt(item.attempt_count || 1) : null;
    const { error: updateError } = await supabase
      .from(ITEMS_TABLE)
      .update({
        status: nextStatus,
        next_retry_at: nextRetryAt,
        last_error: 'Item recuperado apos execucao interrompida',
        updated_at: nowIso(),
      })
      .eq('run_id', runId)
      .eq('sku', item.sku)
      .eq('status', 'analyzing');

    if (!updateError) {
      recovered += 1;
      await appendLog(
        supabase,
        runId,
        nextStatus === 'failed' ? 'error' : 'warning',
        'retry',
        nextStatus === 'failed'
          ? 'SKU esgotou tentativas apos recuperacao de item travado'
          : 'SKU recolocado em retry apos recuperacao de item travado',
        { attempt_count: item.attempt_count, next_retry_at: nextRetryAt },
        item.sku,
      );
    }
  }

  return recovered;
}

async function claimItemsForProcessing(
  supabase: ReturnType<typeof getSupabase>,
  runId: string,
  batchSize: number,
) {
  const dueRetryQuery = supabase
    .from(ITEMS_TABLE)
    .select('*')
    .eq('run_id', runId)
    .eq('status', 'retry_wait')
    .lte('next_retry_at', nowIso())
    .order('next_retry_at', { ascending: true })
    .order('updated_at', { ascending: true })
    .limit(batchSize);

  const pendingQuery = supabase
    .from(ITEMS_TABLE)
    .select('*')
    .eq('run_id', runId)
    .eq('status', 'pending')
    .order('updated_at', { ascending: true })
    .limit(batchSize);

  const [{ data: retryData, error: retryError }, { data: pendingData, error: pendingError }] = await Promise.all([
    dueRetryQuery,
    pendingQuery,
  ]);

  if (retryError) throw retryError;
  if (pendingError) throw pendingError;

  const candidates = [
    ...((retryData || []) as CategoryEngineItem[]),
    ...((pendingData || []) as CategoryEngineItem[]),
  ].slice(0, batchSize);

  const claimed: CategoryEngineItem[] = [];
  const now = nowIso();

  for (const item of candidates) {
    const { data, error } = await supabase
      .from(ITEMS_TABLE)
      .update({
        status: 'analyzing',
        next_retry_at: null,
        attempt_count: Number(item.attempt_count || 0) + 1,
        updated_at: now,
      })
      .eq('run_id', runId)
      .eq('sku', item.sku)
      .eq('status', item.status)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    if (data) claimed.push(data as CategoryEngineItem);
  }

  return claimed;
}

function classifyDecisionSource(row: any, usedFallbackRoot: boolean): DecisionSource {
  if (usedFallbackRoot) return 'fallback_root';
  if (row?.suggestion?.method === 'ia') return 'ia_forced_choice';
  if (row?.toyotaFound && Number(row?.suggestion?.confidence || 0) >= 0.94) return 'toyota';
  if (row?.suggestion?.method === 'similaridade') return 'similaridade';
  return 'regra';
}

function buildAutomaticFields(row: any) {
  const fields = ['category'];
  if (row?.toyotaFound && row?.fieldSuggestions?.weight?.applyDefault) {
    fields.push('weight');
  }
  return fields;
}

async function markItemOutcome(
  supabase: ReturnType<typeof getSupabase>,
  runId: string,
  sku: string,
  patch: Record<string, any>,
) {
  const { error } = await supabase
    .from(ITEMS_TABLE)
    .update({
      ...patch,
      updated_at: nowIso(),
    })
    .eq('run_id', runId)
    .eq('sku', sku);
  if (error) throw error;
}

async function processClaimedItems(
  supabase: ReturnType<typeof getSupabase>,
  run: CategoryEngineRun,
  settings: CategoryEngineSettings,
  items: CategoryEngineItem[],
) {
  if (!items.length) return { applied: 0, failed: 0, skipped: 0, retried: 0 };

  const skus = items.map((item) => item.sku);
  await supabase.from(RUNS_TABLE).update({ current_sku: skus[0], status: 'running', updated_at: nowIso() }).eq('run_id', run.run_id);
  await appendLog(supabase, run.run_id, 'info', 'analyze', `Analisando lote de ${skus.length} SKU(s)`, { skus });

  const preview = await buildCategoryEnrichmentRows(skus, true);
  const rowsBySku = new Map((preview.rows || []).map((row: any) => [normalizeSku(row?.sku || ''), row]));
  const categoryOptions = Array.isArray(preview.categories) ? preview.categories : [];
  const fallbackCategory = categoryOptions.find((item: any) => String(item?.id || '') === String(settings.fallback_root_category_id || DEFAULT_FALLBACK_ROOT_CATEGORY_ID))
    || categoryOptions[0]
    || null;

  const chunks: CategoryEngineItem[][] = [];
  const concurrency = clampNumber(settings.max_concurrency, 1, MAX_CONCURRENCY, DEFAULT_CONCURRENCY);
  for (let i = 0; i < items.length; i += concurrency) {
    chunks.push(items.slice(i, i + concurrency));
  }

  const totals = { applied: 0, failed: 0, skipped: 0, retried: 0 };

  for (const chunk of chunks) {
    const results = await Promise.all(chunk.map(async (item) => {
      const row = rowsBySku.get(normalizeSku(item.sku));

      if (!row) {
        await markItemOutcome(supabase, run.run_id, item.sku, {
          status: 'failed',
          last_error: 'Linha de enriquecimento nao foi gerada para o SKU',
        });
        await appendLog(supabase, run.run_id, 'error', 'analyze', 'Linha de enriquecimento nao foi gerada para o SKU', {}, item.sku);
        return 'failed' as const;
      }

      if (!row.productFound) {
        await markItemOutcome(supabase, run.run_id, item.sku, {
          status: 'skipped',
          last_error: 'Produto nao encontrado no catalogo local',
          payload_json: { row },
        });
        await appendLog(supabase, run.run_id, 'warning', 'apply', 'Produto ignorado porque nao existe no catalogo local', {}, item.sku);
        return 'skipped' as const;
      }

      if (Array.isArray(row?.product?.category_ids) && row.product.category_ids.length > 0) {
        await markItemOutcome(supabase, run.run_id, item.sku, {
          status: 'skipped',
          last_error: 'Produto ja recebeu categoria antes desta execucao',
          current_category_ids: row.product.category_ids,
          payload_json: { row },
        });
        await appendLog(supabase, run.run_id, 'info', 'apply', 'Produto ignorado porque ja possui categoria', {
          category_ids: row.product.category_ids,
        }, item.sku);
        return 'skipped' as const;
      }

      const suggestedCategoryId = String(row?.suggestion?.categoryId || '').trim();
      const effectiveCategoryId = suggestedCategoryId && categoryOptions.some((category: any) => String(category.id) === suggestedCategoryId)
        ? suggestedCategoryId
        : String(fallbackCategory?.id || '').trim();

      if (!effectiveCategoryId) {
        const message = 'Nenhuma categoria valida disponivel para aplicacao automatica';
        await markItemOutcome(supabase, run.run_id, item.sku, {
          status: 'failed',
          last_error: message,
          payload_json: { row },
        });
        await appendLog(supabase, run.run_id, 'error', 'decide', message, {}, item.sku);
        return 'failed' as const;
      }

      const usedFallbackRoot = effectiveCategoryId !== suggestedCategoryId;
      const reviewFlag = usedFallbackRoot
        || !row.toyotaFound
        || row.status === 'needs_review'
        || row.status === 'error'
        || Number(row?.suggestion?.confidence || 0) < CATEGORY_ENGINE_CONFIDENCE;
      const decisionSource = classifyDecisionSource(row, usedFallbackRoot);
      const fields = buildAutomaticFields(row);

      try {
        const applyResult = await applyCategoryEnrichmentUpdate(
          null,
          { sku: item.sku, fields, categoryId: effectiveCategoryId },
          categoryOptions,
          row,
        );

        if (!applyResult?.success) {
          throw new Error(applyResult?.error || 'Falha ao aplicar categoria');
        }

        await markItemOutcome(supabase, run.run_id, item.sku, {
          status: 'applied',
          last_error: null,
          current_category_ids: row?.product?.category_ids || [],
          suggested_category_id: effectiveCategoryId,
          suggested_category_path: categoryOptions.find((category: any) => String(category.id) === effectiveCategoryId)?.path || null,
          confidence: Number(row?.suggestion?.confidence || 0),
          decision_source: decisionSource,
          review_flag: reviewFlag,
          payload_json: {
            row,
            engineDecision: {
              categoryId: effectiveCategoryId,
              fields,
              reviewFlag,
              decisionSource,
              usedFallbackRoot,
            },
          },
          applied_at: nowIso(),
        });

        await appendLog(supabase, run.run_id, reviewFlag ? 'warning' : 'success', 'apply', 'SKU atualizado automaticamente com sucesso', {
          category_id: effectiveCategoryId,
          fields,
          review_flag: reviewFlag,
          decision_source: decisionSource,
        }, item.sku);
        return 'applied' as const;
      } catch (error: any) {
        const message = String(error?.message || error || 'Falha ao aplicar SKU');
        const shouldRetry = isTransientEngineError(error) && Number(item.attempt_count || 0) < settings.retry_limit;

        if (shouldRetry) {
          const nextRetryAt = computeRetryAt(Number(item.attempt_count || 0));
          await markItemOutcome(supabase, run.run_id, item.sku, {
            status: 'retry_wait',
            last_error: message,
            next_retry_at: nextRetryAt,
            suggested_category_id: effectiveCategoryId,
            suggested_category_path: categoryOptions.find((category: any) => String(category.id) === effectiveCategoryId)?.path || null,
            confidence: Number(row?.suggestion?.confidence || 0),
            decision_source: decisionSource,
            review_flag: reviewFlag,
            payload_json: {
              row,
              engineDecision: {
                categoryId: effectiveCategoryId,
                fields,
                reviewFlag,
                decisionSource,
                usedFallbackRoot,
              },
            },
          });
          await appendLog(supabase, run.run_id, 'warning', 'retry', 'SKU enviado para nova tentativa automatica', {
            error: message,
            next_retry_at: nextRetryAt,
            attempt_count: item.attempt_count,
          }, item.sku);
          return 'retried' as const;
        }

        await markItemOutcome(supabase, run.run_id, item.sku, {
          status: 'failed',
          last_error: message,
          suggested_category_id: effectiveCategoryId,
          suggested_category_path: categoryOptions.find((category: any) => String(category.id) === effectiveCategoryId)?.path || null,
          confidence: Number(row?.suggestion?.confidence || 0),
          decision_source: decisionSource,
          review_flag: reviewFlag,
          payload_json: {
            row,
            engineDecision: {
              categoryId: effectiveCategoryId,
              fields,
              reviewFlag,
              decisionSource,
              usedFallbackRoot,
            },
          },
        });
        await appendLog(supabase, run.run_id, 'error', 'apply', 'SKU falhou e saiu da fila automatica', {
          error: message,
          attempt_count: item.attempt_count,
        }, item.sku);
        return 'failed' as const;
      }
    }));

    for (const outcome of results) {
      if (outcome === 'applied') totals.applied += 1;
      if (outcome === 'failed') totals.failed += 1;
      if (outcome === 'skipped') totals.skipped += 1;
      if (outcome === 'retried') totals.retried += 1;
    }
  }

  await supabase.from(RUNS_TABLE).update({ current_sku: null, updated_at: nowIso() }).eq('run_id', run.run_id);
  return totals;
}

async function maybeCompleteRun(
  supabase: ReturnType<typeof getSupabase>,
  run: CategoryEngineRun,
  settings: CategoryEngineSettings,
) {
  const metrics = await refreshRunMetrics(supabase, run.run_id);
  if (metrics.summary.remaining > 0 || metrics.summary.due_retries > 0) {
    return { run: metrics.run, completed: false };
  }

  const refill = await refillRunBuffer(supabase, run.run_id, settings);
  if (refill.seeded > 0) {
    const refreshed = await refreshRunMetrics(supabase, run.run_id);
    return { run: refreshed.run, completed: false };
  }

  const finalStatus: RunStatus = metrics.summary.failed > 0 ? 'completed_with_errors' : 'completed';
  const { data, error } = await supabase
    .from(RUNS_TABLE)
    .update({
      status: finalStatus,
      completed_at: nowIso(),
      current_sku: null,
      updated_at: nowIso(),
    })
    .eq('run_id', run.run_id)
    .select('*')
    .single();
  if (error) throw error;

  await appendLog(supabase, run.run_id, finalStatus === 'completed' ? 'success' : 'warning', 'complete', 'Execucao automatica encerrada', {
    status: finalStatus,
  });

  return { run: data as CategoryEngineRun, completed: true };
}

async function runCategoryEngineTick(source = 'manual') {
  const tickStartedAt = Date.now();
  const supabase = getSupabase();
  const settings = await loadSettings(supabase);
  if (!settings.enabled || !settings.cron_enabled) {
    return {
      ok: true,
      source,
      status: 'disabled',
      message: 'Motor desabilitado nas configuracoes',
    };
  }

  let run = await getActiveRun(supabase);
  if (!run) {
    const discovered = await discoverEligibleSkus(1, new Set());
    if (!discovered.skus.length) {
      return {
        ok: true,
        source,
        status: 'idle',
        message: 'Nao ha produtos elegiveis sem categoria neste momento',
      };
    }
    run = await createRun(supabase, settings, true);
  }

  if (!run) {
    return {
      ok: true,
      source,
      status: 'idle',
      message: 'Nenhum run ativo foi criado',
    };
  }

  if (run.status === 'paused') {
    return {
      ok: true,
      source,
      status: 'paused',
      run_id: run.run_id,
      message: 'Run pausado manualmente',
    };
  }

  await recoverStaleAnalyzingItems(supabase, run.run_id, settings);
  await refillRunBuffer(supabase, run.run_id, settings);
  const processedSummary = { applied: 0, failed: 0, skipped: 0, retried: 0 };
  let totalClaimed = 0;
  let cycles = 0;

  while (cycles < TICK_MAX_BATCH_CYCLES && (Date.now() - tickStartedAt) < TICK_TIME_BUDGET_MS) {
    const currentRun = await getActiveRun(supabase);
    if (!currentRun || currentRun.run_id !== run.run_id || currentRun.status === 'paused') break;

    await refillRunBuffer(supabase, run.run_id, settings);
    const claimed = await claimItemsForProcessing(supabase, run.run_id, settings.batch_size);
    if (!claimed.length) break;

    totalClaimed += claimed.length;
    cycles += 1;

    const cycleResult = await processClaimedItems(supabase, run, settings, claimed);
    processedSummary.applied += cycleResult.applied;
    processedSummary.failed += cycleResult.failed;
    processedSummary.skipped += cycleResult.skipped;
    processedSummary.retried += cycleResult.retried;

    if ((Date.now() - tickStartedAt) >= TICK_TIME_BUDGET_MS) break;
  }

  const completion = await maybeCompleteRun(supabase, run, settings);
  const metrics = await refreshRunMetrics(supabase, run.run_id);

  return {
    ok: true,
    source,
    run_id: run.run_id,
    claimed_count: totalClaimed,
    cycles,
    processed: processedSummary,
    run_status: completion.run.status,
    summary: metrics.summary,
  };
}

async function getRunSummary(supabase: ReturnType<typeof getSupabase>, runId: string | null) {
  if (!runId) {
    return emptyStatusResponse().summary;
  }

  const { summary, run } = await refreshRunMetrics(supabase, runId);
  const durationMs = Math.max(1, new Date(nowIso()).getTime() - new Date(run.started_at || nowIso()).getTime());
  const throughputPerHour = summary.processed > 0 ? Number(((summary.processed / durationMs) * 3_600_000).toFixed(1)) : 0;
  return {
    ...summary,
    throughput_per_hour: throughputPerHour,
  };
}

async function buildStatusResponse() {
  const supabase = getSupabase();

  try {
    const settings = await loadSettings(supabase);
    const activeRun = await getActiveRun(supabase);
    const targetRun = activeRun || await getLatestRun(supabase);
    const summary = await getRunSummary(supabase, targetRun?.run_id || null);
    const eligibleTotal = await countEligibleProducts();

    const [currentItemsRes, logsRes, runsRes] = await Promise.all([
      targetRun
        ? supabase
            .from(ITEMS_TABLE)
            .select('*')
            .eq('run_id', targetRun.run_id)
            .in('status', ['analyzing', 'pending', 'retry_wait'])
            .order('updated_at', { ascending: false })
            .limit(8)
        : Promise.resolve({ data: [], error: null } as any),
      targetRun
        ? supabase
            .from(LOGS_TABLE)
            .select('*')
            .eq('run_id', targetRun.run_id)
            .order('created_at', { ascending: false })
            .limit(12)
        : Promise.resolve({ data: [], error: null } as any),
      supabase
        .from(RUNS_TABLE)
        .select('*')
        .order('started_at', { ascending: false })
        .limit(8),
    ]);

    if (currentItemsRes.error) throw currentItemsRes.error;
    if (logsRes.error) throw logsRes.error;
    if (runsRes.error) throw runsRes.error;

    return {
      ok: true,
      settings,
      activeRun,
      summary,
      currentItems: currentItemsRes.data || [],
      recentLogs: logsRes.data || [],
      recentRuns: runsRes.data || [],
      eligibleTotal,
      health: {
        tablesReady: true,
        cronStrategy: 'vercel_cron',
        message: activeRun ? 'Motor monitorado em polling' : 'Motor pronto para iniciar',
      },
    };
  } catch (error: any) {
    if (isMissingRelationError(error)) {
      return emptyStatusResponse({
        ok: false,
        error: 'As tabelas do motor de categorias ainda nao foram criadas no banco.',
      });
    }
    throw error;
  }
}

adminApp.get('/status', async (c) => {
  try {
    return c.json(await buildStatusResponse());
  } catch (error: any) {
    console.error('[category-engine/status]', error?.message || error);
    return c.json({ error: error?.message || 'Falha ao carregar status do motor' }, 500);
  }
});

adminApp.post('/start', async (c) => {
  try {
    const supabase = getSupabase();
    const settings = await loadSettings(supabase);
    let activeRun = await getActiveRun(supabase);

    if (!activeRun) {
      activeRun = await createRun(supabase, settings, true);
    } else if (activeRun.status === 'paused') {
      const { error } = await supabase.from(RUNS_TABLE).update({ status: 'running', updated_at: nowIso() }).eq('run_id', activeRun.run_id);
      if (error) throw error;
      await appendLog(supabase, activeRun.run_id, 'info', 'discover', 'Run retomado pelo comando iniciar', {});
    }

    const tick = await runCategoryEngineTick('manual_start');
    return c.json({
      ok: true,
      action: 'start',
      tick,
      status: await buildStatusResponse(),
    });
  } catch (error: any) {
    console.error('[category-engine/start]', error?.message || error);
    return c.json({ error: error?.message || 'Falha ao iniciar o motor' }, 500);
  }
});

adminApp.post('/pause', async (c) => {
  try {
    const supabase = getSupabase();
    const activeRun = await getActiveRun(supabase);
    if (!activeRun) return c.json({ ok: true, action: 'pause', status: await buildStatusResponse() });

    const { error } = await supabase
      .from(RUNS_TABLE)
      .update({ status: 'paused', current_sku: null, updated_at: nowIso() })
      .eq('run_id', activeRun.run_id);
    if (error) throw error;

    await appendLog(supabase, activeRun.run_id, 'warning', 'complete', 'Run pausado manualmente', {});

    return c.json({ ok: true, action: 'pause', status: await buildStatusResponse() });
  } catch (error: any) {
    console.error('[category-engine/pause]', error?.message || error);
    return c.json({ error: error?.message || 'Falha ao pausar o motor' }, 500);
  }
});

adminApp.post('/resume', async (c) => {
  try {
    const supabase = getSupabase();
    const activeRun = await getActiveRun(supabase);
    if (!activeRun) {
      return c.json({ ok: true, action: 'resume', tick: await runCategoryEngineTick('manual_resume_new'), status: await buildStatusResponse() });
    }

    const { error } = await supabase
      .from(RUNS_TABLE)
      .update({ status: 'running', updated_at: nowIso() })
      .eq('run_id', activeRun.run_id);
    if (error) throw error;
    await appendLog(supabase, activeRun.run_id, 'info', 'discover', 'Run retomado manualmente', {});

    const tick = await runCategoryEngineTick('manual_resume');
    return c.json({ ok: true, action: 'resume', tick, status: await buildStatusResponse() });
  } catch (error: any) {
    console.error('[category-engine/resume]', error?.message || error);
    return c.json({ error: error?.message || 'Falha ao retomar o motor' }, 500);
  }
});

adminApp.post('/stop', async (c) => {
  try {
    const supabase = getSupabase();
    const activeRun = await getActiveRun(supabase);
    if (!activeRun) return c.json({ ok: true, action: 'stop', status: await buildStatusResponse() });

    await supabase
      .from(ITEMS_TABLE)
      .update({
        status: 'skipped',
        last_error: 'Run cancelado manualmente',
        updated_at: nowIso(),
      })
      .eq('run_id', activeRun.run_id)
      .in('status', ['pending', 'retry_wait', 'analyzing']);

    const { error } = await supabase
      .from(RUNS_TABLE)
      .update({
        status: 'canceled',
        completed_at: nowIso(),
        current_sku: null,
        updated_at: nowIso(),
      })
      .eq('run_id', activeRun.run_id);
    if (error) throw error;

    await appendLog(supabase, activeRun.run_id, 'warning', 'complete', 'Run cancelado manualmente', {});

    return c.json({ ok: true, action: 'stop', status: await buildStatusResponse() });
  } catch (error: any) {
    console.error('[category-engine/stop]', error?.message || error);
    return c.json({ error: error?.message || 'Falha ao parar o motor' }, 500);
  }
});

adminApp.post('/requeue-failures', async (c) => {
  try {
    const supabase = getSupabase();
    const targetRun = await getActiveRun(supabase) || await getLatestRun(supabase);
    if (!targetRun) return c.json({ ok: true, action: 'requeue-failures', status: await buildStatusResponse() });

    const { error } = await supabase
      .from(ITEMS_TABLE)
      .update({
        status: 'pending',
        next_retry_at: null,
        last_error: null,
        updated_at: nowIso(),
      })
      .eq('run_id', targetRun.run_id)
      .eq('status', 'failed');

    if (error) throw error;

    if (targetRun.status === 'completed' || targetRun.status === 'completed_with_errors' || targetRun.status === 'failed' || targetRun.status === 'canceled') {
      await supabase
        .from(RUNS_TABLE)
        .update({
          status: 'running',
          completed_at: null,
          updated_at: nowIso(),
        })
        .eq('run_id', targetRun.run_id);
    }

    await appendLog(supabase, targetRun.run_id, 'info', 'retry', 'Falhas reenfileiradas manualmente', {});

    return c.json({ ok: true, action: 'requeue-failures', tick: await runCategoryEngineTick('manual_requeue'), status: await buildStatusResponse() });
  } catch (error: any) {
    console.error('[category-engine/requeue-failures]', error?.message || error);
    return c.json({ error: error?.message || 'Falha ao reenfileirar falhas' }, 500);
  }
});

adminApp.get('/runs', async (c) => {
  try {
    const supabase = getSupabase();
    const limit = clampNumber(c.req.query('limit') || 20, 1, 100, 20);
    const { data, error } = await supabase
      .from(RUNS_TABLE)
      .select('*')
      .order('started_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return c.json({ items: data || [], total: data?.length || 0 });
  } catch (error: any) {
    console.error('[category-engine/runs]', error?.message || error);
    return c.json({ error: error?.message || 'Falha ao carregar historico do motor' }, 500);
  }
});

adminApp.get('/items', async (c) => {
  try {
    const supabase = getSupabase();
    const limit = clampNumber(c.req.query('limit') || 50, 1, 200, 50);
    const runId = String(c.req.query('run_id') || '').trim();
    const targetRun = runId ? { run_id: runId } as CategoryEngineRun : (await getActiveRun(supabase) || await getLatestRun(supabase));
    if (!targetRun) return c.json({ items: [], nextCursor: null, total: 0 });

    const statusFilter = String(c.req.query('status') || '').trim();
    const reviewFlagFilter = String(c.req.query('review_flag') || '').trim();
    const cursor = decodeCursor(c.req.query('cursor'));

    let query = supabase
      .from(ITEMS_TABLE)
      .select('*', { count: 'exact' })
      .eq('run_id', targetRun.run_id)
      .order('updated_at', { ascending: false })
      .order('sku', { ascending: false })
      .limit(limit + 1);

    if (statusFilter) {
      query = query.in('status', statusFilter.split(',').map((value) => value.trim()).filter(Boolean));
    }
    if (reviewFlagFilter === 'true' || reviewFlagFilter === 'false') {
      query = query.eq('review_flag', reviewFlagFilter === 'true');
    }
    if (cursor?.updated_at) {
      query = query.lt('updated_at', String(cursor.updated_at));
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const items = (data || []) as CategoryEngineItem[];
    const hasMore = items.length > limit;
    const trimmed = hasMore ? items.slice(0, limit) : items;
    const last = trimmed[trimmed.length - 1];

    return c.json({
      items: trimmed,
      total: count || trimmed.length,
      nextCursor: hasMore && last ? encodeCursor({ updated_at: last.updated_at, sku: last.sku }) : null,
    });
  } catch (error: any) {
    console.error('[category-engine/items]', error?.message || error);
    return c.json({ error: error?.message || 'Falha ao carregar itens do motor' }, 500);
  }
});

adminApp.get('/logs', async (c) => {
  try {
    const supabase = getSupabase();
    const limit = clampNumber(c.req.query('limit') || 50, 1, 200, 50);
    const runId = String(c.req.query('run_id') || '').trim();
    const targetRun = runId ? { run_id: runId } as CategoryEngineRun : (await getActiveRun(supabase) || await getLatestRun(supabase));
    if (!targetRun) return c.json({ items: [], nextCursor: null, total: 0 });

    const cursor = decodeCursor(c.req.query('cursor'));
    let query = supabase
      .from(LOGS_TABLE)
      .select('*', { count: 'exact' })
      .eq('run_id', targetRun.run_id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    if (cursor?.created_at) {
      query = query.lt('created_at', String(cursor.created_at));
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const items = data || [];
    const hasMore = items.length > limit;
    const trimmed = hasMore ? items.slice(0, limit) : items;
    const last = trimmed[trimmed.length - 1];

    return c.json({
      items: trimmed,
      total: count || trimmed.length,
      nextCursor: hasMore && last ? encodeCursor({ created_at: last.created_at, id: last.id }) : null,
    });
  } catch (error: any) {
    console.error('[category-engine/logs]', error?.message || error);
    return c.json({ error: error?.message || 'Falha ao carregar logs do motor' }, 500);
  }
});

cronApp.post('/tick', async (c) => {
  try {
    return c.json(await runCategoryEngineTick('cron'));
  } catch (error: any) {
    console.error('[category-engine/tick]', error?.message || error);
    return c.json({ error: error?.message || 'Falha ao executar tick do motor' }, 500);
  }
});

cronApp.get('/tick', async (c) => {
  try {
    return c.json(await runCategoryEngineTick('cron_get'));
  } catch (error: any) {
    console.error('[category-engine/tick:get]', error?.message || error);
    return c.json({ error: error?.message || 'Falha ao executar tick do motor' }, 500);
  }
});

export const categoryEngineAdmin = adminApp;
export const categoryEngineCron = cronApp;
