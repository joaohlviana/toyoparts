import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';
import * as meili from './meilisearch.tsx';
import { fetchMagento } from './magento.tsx';
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

export const meiliSync = new Hono();

// ─── Tuning Constants ────────────────────────────────────────────────────────
const SYNC_KEY = 'meili:sync:products';
const SYNC_META_KEY = 'meili:sync:meta';
const MEILI_DOC_PREFIX = 'meili_doc:';

// v2 OPTIMIZED: 100 produtos por página Magento (era 10)
// Magento REST API suporta pageSize até 300, mas 100 é safe para payload/timeout
const MAGENTO_PAGE_SIZE = 100;

// v2 OPTIMIZED: buscar até 3 páginas Magento EM PARALELO por step
// = 300 produtos/step vs 10 anterior (30× mais por step)
const PAGES_PER_STEP = 3;

// v2: Quantos docs por request ao MeiliSearch (MeiliSearch aceita 10k+)
const MEILI_BATCH_SIZE = 500;

// Supabase KV upsert batch limit (PostgREST max_rows = 1000)
const KV_UPSERT_BATCH = 500;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ─── Helpers ─────────────────────────────────���───────────────────────────────

async function fetchAttributeOptions(attributeCode: string) {
  try {
    const res = await fetchMagento(`/V1/products/attributes/${attributeCode}/options`);
    const map: Record<string, string> = {};
    if (Array.isArray(res)) {
      res.forEach((opt: any) => {
        if (opt.value && opt.label) map[String(opt.value)] = opt.label;
      });
    }
    return map;
  } catch (e) {
    console.warn(`Failed to fetch options for ${attributeCode}:`, e);
    return {};
  }
}

async function fetchAllCategories() {
  try {
    const res = await fetchMagento('/V1/categories/list', {
      'searchCriteria[pageSize]': '0'
    });
    
    const map: Record<string, string> = {};
    const parentMap: Record<string, string> = {};
    
    if (res.items && Array.isArray(res.items)) {
      res.items.forEach((cat: any) => {
        map[String(cat.id)] = cat.name;
        if (cat.parent_id) {
          parentMap[String(cat.id)] = String(cat.parent_id);
        }
      });
    }
    return { map, parentMap };
  } catch (e) {
    console.warn('Failed to fetch categories:', e);
    return { map: {}, parentMap: {} };
  }
}

// ─── Fire-and-forget KV backup (non-blocking) ───────────────────────────────
function kvBackupAsync(documents: any[]) {
  if (documents.length === 0) return;
  
  // Fire-and-forget: don't await, don't block the step
  (async () => {
    try {
      // Chunk into safe batches for PostgREST
      for (let i = 0; i < documents.length; i += KV_UPSERT_BATCH) {
        const batch = documents.slice(i, i + KV_UPSERT_BATCH);
        const updates = batch
          .filter((doc: any) => doc.sku)
          .map((doc: any) => ({
            key: `${MEILI_DOC_PREFIX}${doc.sku}`,
            value: { ...doc }
          }));
        
        if (updates.length > 0) {
          const { error } = await supabase.from('kv_store_1d6e33e0').upsert(updates);
          if (error) console.warn(`[SYNC] KV backup batch error: ${error.message}`);
        }
      }
    } catch (e: any) {
      console.warn(`[SYNC] KV backup fire-and-forget error: ${e.message}`);
    }
  })();
}

// ─── Fetch multiple Magento pages in parallel ────────────────────────────────
async function fetchMagentoPages(
  startPage: number,
  pageCount: number,
  pageSize: number,
): Promise<{ items: any[]; totalFetched: number; pagesRead: number; totalCount: number }> {
  const pages = Array.from({ length: pageCount }, (_, i) => startPage + i);
  
  const results = await Promise.allSettled(
    pages.map(async (page) => {
      const query = {
        'searchCriteria[pageSize]': String(pageSize),
        'searchCriteria[currentPage]': String(page),
        'fields': 'items[sku,name,price,status,type_id,created_at,updated_at,extension_attributes,custom_attributes,media_gallery_entries],total_count'
      };
      return fetchMagento('/V1/products', query);
    })
  );

  const allItems: any[] = [];
  let totalCount = 0;
  let pagesRead = 0;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const res = result.value;
      const items = res.items || [];
      allItems.push(...items);
      totalCount = Math.max(totalCount, res.total_count || 0);
      pagesRead++;
    } else {
      console.warn(`[SYNC] Page fetch failed: ${result.reason?.message || result.reason}`);
    }
  }

  return { items: allItems, totalFetched: allItems.length, pagesRead, totalCount };
}

// ─── Duration & ETA formatters ───────────────────────────────────────────────
function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m${s > 0 ? `${s}s` : ''}`;
  return `${Math.floor(m / 60)}h${m % 60}m`;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// 1. Start Sync
meiliSync.post('/start', async (c) => {
  try {
    const t0 = Date.now();
    const force = c.req.query('force') === '1';
    console.log(`[SYNC v2] Starting... (force=${force})`);

    // Check if already running
    if (!force) {
      const existing = await kv.get(SYNC_KEY);
      if (existing?.status === 'running') {
        const elapsed = Date.now() - new Date(existing.started_at).getTime();
        if (elapsed < 10 * 60 * 1000) {
          return c.json({
            message: 'Sync already running. Use ?force=1 to restart.',
            status: existing,
            _hint: '?force=1'
          }, 409);
        }
        console.warn('[SYNC v2] Stale running state detected, forcing restart');
      }
    }

    // 1. Fetch Total (lightweight call — 1 product)
    let total = 0;
    try {
      const res = await fetchMagento('/V1/products', {
        'searchCriteria[pageSize]': '1',
        'searchCriteria[currentPage]': '1'
      });
      total = res.total_count || 0;
      console.log(`[SYNC v2] Total products: ${total}`);
    } catch (e) {
      console.error('Error fetching total products:', e);
      throw new Error('Failed to connect to Magento to get product count');
    }

    // 2. Fetch Metadata (Categories & Attributes) — PARALLEL
    console.log('[SYNC v2] Fetching metadata (categories, attributes)...');
    const [categoriesData, modelosMap, anosMap, colorsMap] = await Promise.all([
      fetchAllCategories(),
      fetchAttributeOptions('modelo'),
      fetchAttributeOptions('ano'),
      fetchAttributeOptions('color')
    ]);

    const meta = {
      categories: categoriesData.map,
      categoryParents: categoriesData.parentMap,
      modelos: modelosMap,
      anos: anosMap,
      colors: colorsMap,
      updated_at: new Date().toISOString()
    };

    // Save metadata to KV
    await kv.set(SYNC_META_KEY, meta);

    const totalPages = Math.ceil(total / MAGENTO_PAGE_SIZE);
    const estimatedSteps = Math.ceil(totalPages / PAGES_PER_STEP);

    // 3. Initialize Status
    const status = {
      status: 'running',
      started_at: new Date().toISOString(),
      total,
      total_pages: totalPages,
      estimated_steps: estimatedSteps,
      processed: 0,
      indexed: 0,
      skipped: 0,
      current_page: 1,
      step_count: 0,
      errors: 0,
      magento_page_size: MAGENTO_PAGE_SIZE,
      pages_per_step: PAGES_PER_STEP,
      docs_per_second: 0,
      eta_seconds: 0,
      eta_human: '...',
    };

    await kv.set(SYNC_KEY, status);

    // 4. Ensure Index Exists & Settings are Applied
    const setupResult = await meili.setupIndexIfNeeded();
    console.log(`[SYNC v2] Index setup: ${setupResult.reason} (skipped=${setupResult.skipped})`);

    const setupMs = Date.now() - t0;
    console.log(`[SYNC v2] ✅ Start complete in ${setupMs}ms. ${total} products, ~${estimatedSteps} steps, ${totalPages} pages`);

    return c.json({
      message: 'Sync started successfully',
      status,
      setup_ms: setupMs,
      config: {
        magento_page_size: MAGENTO_PAGE_SIZE,
        pages_per_step: PAGES_PER_STEP,
        meili_batch_size: MEILI_BATCH_SIZE,
        estimated_steps: estimatedSteps,
      },
      index_setup: setupResult,
      meta_stats: {
        categories: Object.keys(categoriesData.map).length,
        categoryParents: Object.keys(categoriesData.parentMap).length,
        modelos: Object.keys(modelosMap).length,
        anos: Object.keys(anosMap).length,
        colors: Object.keys(colorsMap).length,
      },
    });
  } catch (e: any) {
    console.error('[SYNC v2] Start error:', e);
    await kv.set(SYNC_KEY, {
      status: 'error',
      error: e.message,
      failed_at: new Date().toISOString(),
    }).catch(() => {});
    return c.json({ error: e.message }, 500);
  }
});

// 2. Sync Step — TURBO: 3 pages × 100 products = 300 products per step
meiliSync.post('/step', async (c) => {
  const stepT0 = Date.now();
  let status = await kv.get(SYNC_KEY);
  
  if (!status) {
    return c.json({ message: 'No sync running', status: 'idle' }, 400);
  }

  if (status.status !== 'running') {
    return c.json({ message: 'Sync not running', status: status.status }, 200);
  }

  try {
    const page = status.current_page || 1;
    const stepNum = (status.step_count || 0) + 1;

    // ─── 1. Load Metadata from KV (only once — cached in closure per step) ───
    let meta = await kv.get(SYNC_META_KEY);
    
    if (!meta) {
      console.warn('[SYNC v2] Metadata missing! Refetching...');
      const [categoriesData, modelosMap, anosMap, colorsMap] = await Promise.all([
        fetchAllCategories(),
        fetchAttributeOptions('modelo'),
        fetchAttributeOptions('ano'),
        fetchAttributeOptions('color')
      ]);
      meta = {
        categories: categoriesData.map,
        categoryParents: categoriesData.parentMap,
        modelos: modelosMap,
        anos: anosMap,
        colors: colorsMap,
      };
      await kv.set(SYNC_META_KEY, meta);
    }
    
    const maps = {
      categories: new Map(Object.entries(meta?.categories || {})),
      categoryParents: new Map(Object.entries(meta?.categoryParents || {})),
      modelos: new Map(Object.entries(meta?.modelos || {})),
      anos: new Map(Object.entries(meta?.anos || {})),
      colors: new Map(Object.entries(meta?.colors || {}))
    };

    // ─── 2. Fetch Products — PARALLEL multi-page fetch ───────────────────────
    const magentoT0 = Date.now();
    const { items, totalFetched, pagesRead, totalCount } = await fetchMagentoPages(
      page,
      PAGES_PER_STEP,
      MAGENTO_PAGE_SIZE,
    );
    const magentoMs = Date.now() - magentoT0;

    // ─── 3. Transform ALL products ──────────────────────────────────────────
    const transformT0 = Date.now();
    const documents: any[] = [];
    let skippedCount = 0;

    for (const item of items) {
      try {
        const doc = meili.transformProduct(item, maps);
        if (doc.id) {
          documents.push(doc);
        } else {
          skippedCount++;
        }
      } catch (e: any) {
        skippedCount++;
        console.warn(`[SYNC v2] Transform error for SKU ${item?.sku}: ${e.message}`);
      }
    }
    const transformMs = Date.now() - transformT0;

    // ─── 4. Index to MeiliSearch — single batch request ─────────────────────
    let meiliMs = 0;
    let meiliTaskUids: number[] = [];

    if (documents.length > 0) {
      const meiliT0 = Date.now();
      
      // MeiliSearch handles up to 10k docs per request. 
      // For 300 docs, single request is optimal.
      const indexResult = await meili.indexDocuments(documents);
      meiliTaskUids = indexResult.taskUids;
      meiliMs = Date.now() - meiliT0;

      // ─── 5. KV Backup — FIRE-AND-FORGET (non-blocking) ──────────────────
      kvBackupAsync(documents);
    }

    // ─── 6. Update Status ───────────────────────────────────────────────────
    const processed = (status.processed || 0) + totalFetched;
    const indexed = (status.indexed || 0) + documents.length;
    const skipped = (status.skipped || 0) + skippedCount;
    const nextPage = page + pagesRead;

    // Detect completion
    // Complete if: fetched < expected OR we've processed >= total
    const expectedForStep = PAGES_PER_STEP * MAGENTO_PAGE_SIZE;
    const isComplete = totalFetched < expectedForStep || 
                       (totalCount > 0 && processed >= totalCount) ||
                       totalFetched === 0;

    // Performance metrics
    const elapsedSec = Math.max(1, Math.round((Date.now() - new Date(status.started_at).getTime()) / 1000));
    const docsPerSecond = Math.round(indexed / elapsedSec);
    const remaining = Math.max(0, (totalCount || status.total || 0) - processed);
    const etaSeconds = docsPerSecond > 0 ? Math.round(remaining / docsPerSecond) : 0;
    const stepMs = Date.now() - stepT0;

    const newStatus = {
      ...status,
      processed,
      indexed,
      skipped,
      current_page: nextPage,
      step_count: stepNum,
      status: isComplete ? 'completed' : 'running',
      updated_at: new Date().toISOString(),
      docs_per_second: docsPerSecond,
      eta_seconds: etaSeconds,
      eta_human: fmtDuration(etaSeconds),
      elapsed_seconds: elapsedSec,
      elapsed_human: fmtDuration(elapsedSec),
      total: Math.max(status.total || 0, totalCount), // update if Magento corrects total
    };

    if (isComplete) {
      newStatus.completed_at = new Date().toISOString();
    }

    await kv.set(SYNC_KEY, newStatus);

    // ─── 7. Logging ─────────────────────────────────────────────────────────
    console.log([
      `[SYNC v2] Step ${stepNum}:`,
      `${totalFetched} fetched (${pagesRead} pages),`,
      `${documents.length} indexed, ${skippedCount} skipped`,
      `| Magento ${magentoMs}ms, Transform ${transformMs}ms, Meili ${meiliMs}ms`,
      `| Total ${stepMs}ms`,
      `| ${processed}/${newStatus.total} (${Math.round((processed / Math.max(1, newStatus.total)) * 100)}%)`,
      `| ${docsPerSecond} docs/s, ETA ${fmtDuration(etaSeconds)}`,
      isComplete ? '| ✅ COMPLETE' : '',
    ].join(' '));

    return c.json({
      message: isComplete ? 'completed' : 'step_done',
      status: newStatus,
      step: {
        number: stepNum,
        items_fetched: totalFetched,
        items_indexed: documents.length,
        items_skipped: skippedCount,
        pages_read: pagesRead,
        magento_ms: magentoMs,
        transform_ms: transformMs,
        meili_ms: meiliMs,
        total_ms: stepMs,
        meili_task_uids: meiliTaskUids,
      },
      performance: {
        docs_per_second: docsPerSecond,
        eta_seconds: etaSeconds,
        eta_human: fmtDuration(etaSeconds),
        elapsed_seconds: elapsedSec,
        elapsed_human: fmtDuration(elapsedSec),
      },
    });

  } catch (e: any) {
    console.error('[SYNC v2] Step error:', e);
    
    const errors = (status.errors || 0) + 1;
    const errorStatus = {
      ...status,
      status: errors >= 5 ? 'error' : 'running', // tolerate up to 5 errors before stopping
      errors,
      last_error: e.message,
      last_error_at: new Date().toISOString(),
    };
    
    // If too many errors, mark as error and stop
    if (errors >= 5) {
      errorStatus.status = 'error';
      console.error(`[SYNC v2] Too many errors (${errors}), marking as failed`);
    }
    
    await kv.set(SYNC_KEY, errorStatus).catch(() => {});
    
    return c.json({
      error: e.message,
      errors_total: errors,
      will_retry: errors < 5,
    }, 500);
  }
});

// 3. Status
meiliSync.get('/status', async (c) => {
  const status = await kv.get(SYNC_KEY);
  if (!status) return c.json({ status: 'idle' });

  // Enrich with runtime metrics
  if (status.status === 'running' && status.started_at) {
    const elapsedMs = Date.now() - new Date(status.started_at).getTime();
    status._elapsed_minutes = Math.round(elapsedMs / 60000);
    status.elapsed_seconds = Math.round(elapsedMs / 1000);
    status.elapsed_human = fmtDuration(Math.round(elapsedMs / 1000));

    // Stale detection
    if (elapsedMs > 10 * 60 * 1000) {
      status._warning = 'Possibly stale. Use POST /start?force=1';
      status._stale = true;
    }

    // Recalculate ETA with live elapsed
    const indexed = status.indexed || 0;
    const total = status.total || 0;
    if (indexed > 0 && total > 0) {
      const dps = Math.round(indexed / Math.max(1, status.elapsed_seconds));
      const remaining = Math.max(0, total - (status.processed || 0));
      status.docs_per_second = dps;
      status.eta_seconds = dps > 0 ? Math.round(remaining / dps) : 0;
      status.eta_human = fmtDuration(status.eta_seconds);
    }
  }

  return c.json(status);
});

// 4. Reset
meiliSync.post('/reset', async (c) => {
  try {
    await kv.del(SYNC_KEY);
    console.log('[SYNC v2] Status reset');
    return c.json({ message: 'Reset successful', status: 'idle' });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});
