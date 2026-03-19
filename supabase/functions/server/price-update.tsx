import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';
import * as meili from './meilisearch.tsx';
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

export const priceUpdate = new Hono();

const MAGENTO_TOKEN    = (Deno.env.get('MAGENTO_TOKEN') || '').trim();
const MAGENTO_BASE_URL = 'https://www.toyoparts.com.br';

const SKU_CACHE_KEY    = 'price-update:site-skus-v2';
const SKU_CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

// ─── Supabase client (for direct KV batch operations) ────────────────────────
const supabaseAdmin = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// ─── Magento helper ──────────────────────────────────────────────────────────

interface MagentoResult {
  ok      : boolean;
  status  : number;
  data    : any;
  rawText : string;
}

async function magentoPostRaw(path: string, body: any): Promise<MagentoResult> {
  if (!MAGENTO_TOKEN) throw new Error('MAGENTO_TOKEN não configurado no servidor.');
  const url        = `${MAGENTO_BASE_URL}/rest${path}`;
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 35_000);
  try {
    const res = await fetch(url, {
      method : 'POST',
      headers: { 'Authorization': `Bearer ${MAGENTO_TOKEN}`, 'Content-Type': 'application/json' },
      body   : JSON.stringify(body),
      signal : controller.signal,
    });
    clearTimeout(timeout);
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* noop */ }
    return { ok: res.ok, status: res.status, data: json, rawText: text };
  } finally { clearTimeout(timeout); }
}

async function magentoPost(path: string, body: any): Promise<any> {
  const r = await magentoPostRaw(path, body);
  if (!r.ok) {
    throw new Error(`Magento POST ${path} → HTTP ${r.status}: ${r.data?.message ?? r.rawText.slice(0, 300)}`);
  }
  return r.data;
}

async function magentoGet(path: string): Promise<any> {
  if (!MAGENTO_TOKEN) throw new Error('MAGENTO_TOKEN não configurado no servidor.');
  const url = `${MAGENTO_BASE_URL}/rest${path}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${MAGENTO_TOKEN}` },
    signal : AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* noop */ }
  if (!res.ok) throw new Error(`Magento GET ${path} → HTTP ${res.status}: ${json?.message ?? text.slice(0, 300)}`);
  return json;
}

// ─── Fallback: send items individually to isolate bad SKUs ───────────────────

interface FallbackResult {
  okSkus      : string[];
  errorEntries: any[];
  failedSkus  : Array<{ sku: string; error: string }>;
}

async function fallbackIndividual(
  path: string,
  items: Array<Record<string, any>>,
  runId: string,
  batchIndex: number,
  label: string,
): Promise<FallbackResult> {
  const MINI = 20;
  const okSkus      : string[] = [];
  const errorEntries: any[]    = [];
  const failedSkus  : Array<{ sku: string; error: string }> = [];

  for (let i = 0; i < items.length; i += MINI) {
    const slice = items.slice(i, i + MINI);
    const r = await magentoPostRaw(path, { prices: slice });

    if (r.ok) {
      const perItemErrors: any[] = Array.isArray(r.data) ? r.data : [];
      const errSkuSet = new Set<string>(perItemErrors.map((e: any) => e?.sku ?? e?.parameters?.sku).filter(Boolean));
      for (const it of slice) {
        if (errSkuSet.has(it.sku)) errorEntries.push(perItemErrors.find((e: any) => (e?.sku ?? e?.parameters?.sku) === it.sku));
        else okSkus.push(it.sku);
      }
    } else if (r.status === 400 && slice.length > 1) {
      for (const single of slice) {
        const sr = await magentoPostRaw(path, { prices: [single] });
        if (sr.ok) {
          const perErr: any[] = Array.isArray(sr.data) ? sr.data : [];
          if (perErr.length > 0) errorEntries.push(perErr[0]);
          else okSkus.push(single.sku);
        } else {
          const msg = sr.data?.message ?? sr.rawText.slice(0, 200);
          console.error(`[price-update/batch] ${label} individual sku=${single.sku} run=${runId} batch=${batchIndex}: HTTP ${sr.status} ${msg}`);
          failedSkus.push({ sku: single.sku, error: `${label} HTTP ${sr.status}: ${msg}` });
        }
      }
    } else {
      const msg = r.data?.message ?? r.rawText.slice(0, 200);
      console.error(`[price-update/batch] ${label} mini-batch run=${runId} batch=${batchIndex}: HTTP ${r.status} ${msg}`);
      for (const it of slice) failedSkus.push({ sku: it.sku, error: `${label} HTTP ${r.status}: ${msg}` });
    }
  }
  return { okSkus, errorEntries, failedSkus };
}

// ─── GET /site-skus ───────────────────────────────────────────────────────────
// Retorna todos os SKUs do site (normalizados) com cache KV de 10 min.

priceUpdate.get('/site-skus', async (c) => {
  try {
    // --- Cache hit? ---
    const cached = await kv.get(SKU_CACHE_KEY);
    if (cached && typeof cached === 'object') {
      const { skus, skuInfo, cachedAt } = cached as {
        skus: string[];
        skuInfo: Record<string, { active: boolean; inStock: boolean }>;
        cachedAt: number;
      };
      if (Array.isArray(skus) && Date.now() - cachedAt < SKU_CACHE_TTL_MS) {
        console.log(`[price-update/site-skus] cache hit — ${skus.length} SKUs`);
        return c.json({ skus, skuInfo, fromCache: true, count: skus.length });
      }
    }

    // --- Paginar Meilisearch ---
    const allItems: Array<{ sku: string; active: boolean; inStock: boolean }> = [];
    const limit              = 2_000;
    let offset               = 0;
    let hasMore              = true;

    while (hasMore) {
      const result: any = await meili.meiliRequest(
        'POST',
        `/indexes/toyoparts/search`,
        { q: '', limit, offset, attributesToRetrieve: ['sku', 'status', 'in_stock'] },
        30_000,
      );

      const hits: any[] = result.hits ?? [];
      for (const hit of hits) {
        if (hit.sku) {
          const norm = String(hit.sku).trim().toUpperCase().replace(/\s+/g, '');
          if (norm) {
            allItems.push({
              sku     : norm,
              active  : hit.status === 1 || hit.status === '1',
              inStock : hit.in_stock === true || hit.in_stock === 'true',
            });
          }
        }
      }

      hasMore  = hits.length === limit;
      offset  += limit;
      console.log(`[price-update/site-skus] offset=${offset} total=${allItems.length}`);
    }

    // Dedup — último vence (mantém metadata mais recente)
    const skuMap = new Map<string, { active: boolean; inStock: boolean }>();
    for (const item of allItems) {
      skuMap.set(item.sku, { active: item.active, inStock: item.inStock });
    }

    const unique   = [...skuMap.keys()];
    const skuInfo  : Record<string, { active: boolean; inStock: boolean }> = {};
    for (const [sku, info] of skuMap) {
      skuInfo[sku] = info;
    }

    // --- Salvar cache ---
    await kv.set(SKU_CACHE_KEY, { skus: unique, skuInfo, cachedAt: Date.now() });
    console.log(`[price-update/site-skus] cached ${unique.length} SKUs únicos`);

    return c.json({ skus: unique, skuInfo, fromCache: false, count: unique.length });
  } catch (err: any) {
    console.error('[price-update/site-skus] Erro:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ─── POST /run/start ──────────────────────────────────────────────────────────

priceUpdate.post('/run/start', async (c) => {
  try {
    const body  = await c.req.json();
    const runId = `pru_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await kv.set(`price-update:run:${runId}`, {
      runId,
      startedAt   : new Date().toISOString(),
      matchedCount: body.matchedCount  ?? 0,
      missingCount: body.missingCount  ?? 0,
      totalBatches: body.totalBatches  ?? 0,
      status      : 'running',
    });
    console.log(`[price-update/run/start] runId=${runId}`);
    return c.json({ runId });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── POST /batch ─────────────────────────────────────────────────────────────
// Body: { runId, batchIndex, items: [{ sku, price, special_price }] }
// Atualiza base-price e special-price no Magento em bulk.
// Em caso de HTTP 400, faz fallback para envio individual isolando SKUs inválidos.

priceUpdate.post('/batch', async (c) => {
  try {
    const { runId, batchIndex, items } = await c.req.json() as {
      runId      : string;
      batchIndex : number;
      items      : Array<{ sku: string; price: number; special_price: number }>;
    };

    if (!items?.length) {
      return c.json({ updated: [], notFound: [], failed: [], skipped: true });
    }

    // --- Idempotência ---
    const batchKey = `price-update:batch:${runId}:${batchIndex}`;
    const already  = await kv.get(batchKey);
    if (already) {
      console.log(`[price-update/batch] idempotent — run=${runId} batch=${batchIndex}`);
      return c.json({ ...(already as object), idempotent: true });
    }

    const updated  : string[]                             = [];
    const notFound : string[]                             = [];
    const failed   : Array<{ sku: string; error: string }> = [];

    // ── 1) Base prices ────────────────────────────────────────────────────────
    const basePriceItems = items.map(i => ({ price: i.price, store_id: 0, sku: i.sku }));
    let baseErrors: any[] = [];
    let baseFallbackUsed = false;

    const baseRes = await magentoPostRaw('/V1/products/base-prices', { prices: basePriceItems });

    if (baseRes.ok) {
      if (Array.isArray(baseRes.data)) baseErrors = baseRes.data;
    } else if (baseRes.status === 400) {
      console.log(`[price-update/batch] base-prices 400 — fallback individual run=${runId} batch=${batchIndex} (${items.length} items)`);
      baseFallbackUsed = true;
      const fb = await fallbackIndividual('/V1/products/base-prices', basePriceItems, runId, batchIndex, 'base-price');
      baseErrors = fb.errorEntries;
      fb.failedSkus.forEach(f => failed.push(f));
    } else {
      const msg = baseRes.data?.message ?? baseRes.rawText.slice(0, 300);
      console.error(`[price-update/batch] base-prices fatal run=${runId} batch=${batchIndex}: HTTP ${baseRes.status} ${msg}`);
      items.forEach(i => failed.push({ sku: i.sku, error: `base-price HTTP ${baseRes.status}: ${msg}` }));
      const result = { updated, notFound, failed };
      await kv.set(batchKey, result);
      return c.json(result);
    }

    const baseFailedSet = new Set<string>(
      baseErrors.map((e: any) => e?.sku ?? e?.parameters?.sku).filter(Boolean)
    );
    const failedSkuSet = new Set<string>(failed.map(f => f.sku));

    // Classify base-price errors
    for (const e of baseErrors) {
      const sku = e?.sku ?? e?.parameters?.sku;
      if (!sku || failedSkuSet.has(sku)) continue;
      const msg  = String(e?.message ?? 'base-price validation error');
      const isNF = /not exist|not found|doesn.t exist/i.test(msg);
      if (isNF) notFound.push(sku);
      else      failed.push({ sku, error: msg });
      failedSkuSet.add(sku);
    }

    // ── 2) Special prices ─────────────────────────────────────────────────────
    const specialItems = items
      .filter(i => !baseFailedSet.has(i.sku) && !failedSkuSet.has(i.sku))
      .map(i => ({
        price     : i.special_price,
        store_id  : 0,
        sku       : i.sku,
        price_from: '2020-01-01 00:00:00',
        price_to  : '2099-12-31 23:59:59',
      }));

    let specialErrors: any[] = [];

    if (specialItems.length > 0) {
      const specRes = await magentoPostRaw('/V1/products/special-price', { prices: specialItems });

      if (specRes.ok) {
        if (Array.isArray(specRes.data)) specialErrors = specRes.data;
      } else if (specRes.status === 400) {
        console.log(`[price-update/batch] special-price 400 — fallback individual run=${runId} batch=${batchIndex} (${specialItems.length} items)`);
        const fb = await fallbackIndividual('/V1/products/special-price', specialItems, runId, batchIndex, 'special-price');
        specialErrors = fb.errorEntries;
        fb.failedSkus.forEach(f => failed.push(f));
      } else {
        const msg = specRes.data?.message ?? specRes.rawText.slice(0, 300);
        console.error(`[price-update/batch] special-price fatal run=${runId} batch=${batchIndex}: HTTP ${specRes.status} ${msg}`);
        specialItems
          .filter(i => !failedSkuSet.has(i.sku))
          .forEach(i => {
            failed.push({ sku: i.sku, error: `special-price HTTP ${specRes.status}: ${msg}` });
            failedSkuSet.add(i.sku);
          });
      }
    }

    const specialFailedSet = new Set<string>(
      specialErrors.map((e: any) => e?.sku ?? e?.parameters?.sku).filter(Boolean)
    );
    for (const e of specialErrors) {
      const sku = e?.sku ?? e?.parameters?.sku;
      if (!sku || failedSkuSet.has(sku)) continue;
      failed.push({ sku, error: e?.message ?? 'special-price validation error' });
      failedSkuSet.add(sku);
    }

    // ── 3) Consolidar resultados ───────────────────────────────────────────────
    for (const item of items) {
      if (failedSkuSet.has(item.sku)) continue;
      if (notFound.includes(item.sku)) continue;
      if (baseFailedSet.has(item.sku)) continue;
      if (specialFailedSet.has(item.sku)) continue;
      updated.push(item.sku);
    }

    // ── 4) PROPAGAR preços para Meilisearch + KV (visibilidade imediata no site) ─
    // SEM ISTO, o site continuaria mostrando preços antigos até a próxima sync.
    let meiliTaskUid: number | null = null;
    if (updated.length > 0) {
      const itemsMap = new Map(items.map(i => [i.sku, i]));

      // 4a) Meilisearch — partial document update (PUT = merge, não substitui)
      // IMPORTANTE: o primary key no Meili é sanitizeSku(sku), NÃO o SKU cru.
      // sanitizeSku remove caracteres inválidos (pontos, vírgulas, espaços, +).
      // Se usar o SKU cru como `id`, o PUT cria documento fantasma ou falha silenciosamente.
      try {
        const meiliDocs = updated.map(sku => {
          const it = itemsMap.get(sku)!;
          const meiliId = meili.sanitizeSku(sku) || sku;
          return {
            id            : meiliId, // primary key sanitizado — deve bater com o index
            price         : it.price,
            special_price : it.special_price,
            has_promotion : true,
          };
        });
        const meiliRes: any = await meili.meiliRequest(
          'PUT',
          '/indexes/toyoparts/documents',
          meiliDocs,
          30_000,
        );
        meiliTaskUid = meiliRes?.taskUid ?? null;
        console.log(`[price-update/batch] propagated ${updated.length} prices to Meilisearch (taskUid=${meiliTaskUid})`);
      } catch (meiliErr: any) {
        // Não falha o batch por causa do Meili — os preços JÁ estão no Magento
        console.error(`[price-update/batch] Meili propagation error (non-fatal): ${meiliErr.message}`);
      }

      // 4b) KV store — atualiza product:SKU com novos preços para o PDP
      try {
        const sb     = supabaseAdmin();
        const kvKeys = updated.map(sku => `product:${sku}`);

        // Buscar em chunks de 200 (limite do IN do PostgREST)
        const KV_CHUNK = 200;
        for (let ki = 0; ki < kvKeys.length; ki += KV_CHUNK) {
          const keySlice = kvKeys.slice(ki, ki + KV_CHUNK);
          const { data: rows } = await sb
            .from('kv_store_1d6e33e0')
            .select('key, value')
            .in('key', keySlice);

          if (rows && rows.length > 0) {
            const upserts = rows.map((row: any) => {
              const sku  = row.key.replace('product:', '');
              const item = itemsMap.get(sku);
              // Merge: atualiza APENAS os campos de preço, preserva todo o resto
              const merged = {
                ...row.value,
                price         : item?.price ?? row.value.price,
                special_price : item?.special_price ?? row.value.special_price,
              };
              // Também atualizar o custom_attribute special_price se existir
              if (Array.isArray(merged.custom_attributes) && item) {
                const spIdx = merged.custom_attributes.findIndex(
                  (a: any) => a.attribute_code === 'special_price'
                );
                if (spIdx >= 0) {
                  merged.custom_attributes[spIdx].value = String(item.special_price);
                } else {
                  merged.custom_attributes.push({
                    attribute_code: 'special_price',
                    value: String(item.special_price),
                  });
                }
                // Garantir special_from_date e special_to_date
                const fromIdx = merged.custom_attributes.findIndex(
                  (a: any) => a.attribute_code === 'special_from_date'
                );
                if (fromIdx >= 0) {
                  merged.custom_attributes[fromIdx].value = '2020-01-01 00:00:00';
                } else {
                  merged.custom_attributes.push({
                    attribute_code: 'special_from_date',
                    value: '2020-01-01 00:00:00',
                  });
                }
                const toIdx = merged.custom_attributes.findIndex(
                  (a: any) => a.attribute_code === 'special_to_date'
                );
                if (toIdx >= 0) {
                  merged.custom_attributes[toIdx].value = '2099-12-31 23:59:59';
                } else {
                  merged.custom_attributes.push({
                    attribute_code: 'special_to_date',
                    value: '2099-12-31 23:59:59',
                  });
                }
              }
              return { key: row.key, value: merged };
            });
            await sb.from('kv_store_1d6e33e0').upsert(upserts);
          }
        }
        console.log(`[price-update/batch] propagated ${updated.length} prices to KV store`);
      } catch (kvErr: any) {
        console.error(`[price-update/batch] KV propagation error (non-fatal): ${kvErr.message}`);
      }
    }

    const result = { updated, notFound, failed, meiliTaskUid };
    await kv.set(batchKey, result);
    console.log(
      `[price-update/batch] run=${runId} batch=${batchIndex} ` +
      `updated=${updated.length} notFound=${notFound.length} failed=${failed.length}` +
      (baseFallbackUsed ? ' (used fallback)' : '')
    );
    return c.json(result);

  } catch (err: any) {
    console.error('[price-update/batch] Unhandled:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ─── POST /run/finish ─────────────────────────────────────────────────────────

priceUpdate.post('/run/finish', async (c) => {
  try {
    const { runId, ...stats } = await c.req.json();
    const meta = await kv.get(`price-update:run:${runId}`);
    if (meta) {
      await kv.set(`price-update:run:${runId}`, {
        ...(meta as object),
        ...stats,
        finishedAt: new Date().toISOString(),
        status    : 'done',
      });
    }
    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── POST /wait-meili-tasks ───────────────────────────────────────────────────
// Aguarda a conclusão de um ou mais tasks do Meilisearch antes de verificar.
// Body: { taskUids: number[] }
// Poll com backoff até todas as tasks estarem "succeeded" ou "failed", ou timeout de 60s.

priceUpdate.post('/wait-meili-tasks', async (c) => {
  try {
    const { taskUids } = await c.req.json() as { taskUids: number[] };
    if (!taskUids?.length) return c.json({ ok: true, waited: 0 });

    const TIMEOUT_MS = 60_000;
    const POLL_INTERVAL = 1_000;
    const start = Date.now();
    const pending = new Set(taskUids);
    const results: Record<number, string> = {};

    while (pending.size > 0 && (Date.now() - start) < TIMEOUT_MS) {
      for (const uid of [...pending]) {
        try {
          const task: any = await meili.meiliRequest('GET', `/tasks/${uid}`, undefined, 10_000);
          const status = task?.status ?? 'unknown';
          if (status === 'succeeded' || status === 'failed' || status === 'canceled') {
            pending.delete(uid);
            results[uid] = status;
            if (status === 'failed') {
              console.error(`[wait-meili-tasks] task ${uid} failed: ${task?.error?.message ?? 'unknown'}`);
            }
          }
        } catch (err: any) {
          console.error(`[wait-meili-tasks] error polling task ${uid}: ${err.message}`);
          // Don't remove from pending — retry next poll
        }
      }
      if (pending.size > 0) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
      }
    }

    const timedOut = pending.size > 0;
    if (timedOut) {
      console.warn(`[wait-meili-tasks] timed out after ${TIMEOUT_MS}ms, still pending: ${[...pending].join(',')}`);
      for (const uid of pending) results[uid] = 'timeout';
    }

    console.log(`[wait-meili-tasks] completed in ${Date.now() - start}ms: ${JSON.stringify(results)}`);
    return c.json({ ok: !timedOut, results, elapsed: Date.now() - start });
  } catch (err: any) {
    console.error('[wait-meili-tasks] Unhandled:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ─── POST /verify-prices ──────────────────────────────────────────────────────
// Verifica preços atuais no Meilisearch e opcionalmente no Magento (amostra).
// Body: { items: [{ sku, expectedPrice, expectedSpecialPrice }], sampleMagento?: number }
// Retorna discrepâncias entre o preço esperado e o preço atual.
//
// NOTA: Usa paginação com search (case-insensitive) em vez de /documents/fetch
// porque o primary key no Meili é sanitizeSku(sku) que pode diferir do SKU
// normalizado (uppercase) enviado pelo frontend. /documents/fetch exige match
// exato do ID e falharia silenciosamente (retornando 96%+ "ausente").

priceUpdate.post('/verify-prices', async (c) => {
  try {
    const { items, sampleMagento = 0 } = await c.req.json() as {
      items         : Array<{ sku: string; expectedPrice: number; expectedSpecialPrice: number }>;
      sampleMagento?: number;
    };

    if (!items?.length) return c.json({ mismatches: [], checked: 0, ok: 0 });

    const TOLERANCE = 0.02; // R$ 0,02 de tolerância para arredondamento

    // ── 1) Construir mapa de preços do Meili via paginação (case-insensitive) ──
    // Paginar TODOS os docs do índice e indexar por SKU normalizado.
    // Para 20k+ produtos isso leva ~5-10 requests de 2000 cada.
    const meiliDocs = new Map<string, { price: number; special_price: number | null }>();
    const PAGE_SIZE = 2_000;
    let offset = 0;
    let hasMore = true;

    // Construir set dos SKUs que precisamos verificar para early-exit
    const targetSkus = new Set(items.map(it => it.sku));
    let foundAll = false;

    while (hasMore && !foundAll) {
      try {
        const res: any = await meili.meiliRequest(
          'POST',
          `/indexes/toyoparts/search`,
          {
            q: '',
            limit: PAGE_SIZE,
            offset,
            attributesToRetrieve: ['sku', 'price', 'special_price'],
          },
          30_000,
        );
        const hits: any[] = res.hits ?? [];
        for (const doc of hits) {
          if (doc.sku) {
            const normSku = String(doc.sku).trim().toUpperCase().replace(/\s+/g, '');
            if (normSku && targetSkus.has(normSku)) {
              meiliDocs.set(normSku, {
                price         : typeof doc.price === 'number' ? doc.price : parseFloat(doc.price ?? '0'),
                special_price : doc.special_price != null
                  ? (typeof doc.special_price === 'number' ? doc.special_price : parseFloat(doc.special_price))
                  : null,
              });
            }
          }
        }

        hasMore = hits.length === PAGE_SIZE;
        offset += PAGE_SIZE;

        // Early exit: se já encontramos todos os SKUs que precisamos
        if (meiliDocs.size >= targetSkus.size) foundAll = true;

        console.log(`[price-update/verify] paginating Meili: offset=${offset} found=${meiliDocs.size}/${targetSkus.size}`);
      } catch (err: any) {
        console.error(`[price-update/verify] Meili search page error at offset=${offset}:`, err.message);
        hasMore = false; // para não ficar em loop
      }
    }

    console.log(`[price-update/verify] Meili scan complete: ${meiliDocs.size} docs matched out of ${targetSkus.size} target SKUs`);

    // ── 2) Comparar preços ────────────────────────────────────────────────────
    const mismatches: Array<{
      sku              : string;
      expectedPrice    : number;
      expectedSpecial  : number;
      meiliPrice       : number | null;
      meiliSpecial     : number | null;
      magentoPrice     : number | null;
      magentoSpecial   : number | null;
      source           : 'meili' | 'magento' | 'both' | 'not_in_meili';
      priceDiff        : number | null;
      specialDiff      : number | null;
    }> = [];

    let okCount = 0;
    const notInMeili: string[] = [];

    for (const item of items) {
      const doc = meiliDocs.get(item.sku);
      if (!doc) {
        notInMeili.push(item.sku);
        mismatches.push({
          sku            : item.sku,
          expectedPrice  : item.expectedPrice,
          expectedSpecial: item.expectedSpecialPrice,
          meiliPrice     : null,
          meiliSpecial   : null,
          magentoPrice   : null,
          magentoSpecial : null,
          source         : 'not_in_meili',
          priceDiff      : null,
          specialDiff    : null,
        });
        continue;
      }

      const priceDiff   = Math.abs((doc.price ?? 0) - item.expectedPrice);
      const specialDiff = doc.special_price != null ? Math.abs(doc.special_price - item.expectedSpecialPrice) : null;

      const priceOk   = priceDiff <= TOLERANCE;
      const specialOk = specialDiff == null || specialDiff <= TOLERANCE;

      if (priceOk && specialOk) {
        okCount++;
      } else {
        mismatches.push({
          sku            : item.sku,
          expectedPrice  : item.expectedPrice,
          expectedSpecial: item.expectedSpecialPrice,
          meiliPrice     : doc.price,
          meiliSpecial   : doc.special_price,
          magentoPrice   : null,
          magentoSpecial : null,
          source         : 'meili',
          priceDiff,
          specialDiff,
        });
      }
    }

    // ── 3) Verificação de amostra no Magento (se solicitado) ──────────────────
    let magentoSample: Array<{ sku: string; price: number | null; specialPrice: number | null; error?: string }> = [];

    if (sampleMagento > 0) {
      const samplePool = mismatches.length > 0
        ? mismatches.slice(0, Math.min(sampleMagento, mismatches.length))
        : items.slice(0, Math.min(sampleMagento, items.length));

      for (const entry of samplePool) {
        const sku = 'sku' in entry ? entry.sku : '';
        try {
          const product = await magentoGet(`/V1/products/${encodeURIComponent(sku)}`);
          const price = parseFloat(product?.price ?? '0');
          const spAttr = product?.custom_attributes?.find((a: any) => a.attribute_code === 'special_price');
          const specialPrice = spAttr?.value ? parseFloat(spAttr.value) : null;

          magentoSample.push({ sku, price, specialPrice });

          const mm = mismatches.find(m => m.sku === sku);
          if (mm) {
            mm.magentoPrice   = price;
            mm.magentoSpecial = specialPrice;
            if (mm.source === 'meili') mm.source = 'both';
          }
        } catch (err: any) {
          magentoSample.push({ sku, price: null, specialPrice: null, error: err.message });
        }
      }
    }

    console.log(
      `[price-update/verify] checked=${items.length} ok=${okCount} ` +
      `mismatches=${mismatches.length} notInMeili=${notInMeili.length} ` +
      `magentoSampled=${magentoSample.length}`
    );

    return c.json({
      checked     : items.length,
      ok          : okCount,
      mismatches,
      notInMeili  : notInMeili.length,
      magentoSample,
    });
  } catch (err: any) {
    console.error('[price-update/verify] Unhandled:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ─── POST /deactivate-skus ────────────────────────────────────────────────────
// Desativa produtos no Magento (status=2) e marca active:false no Meilisearch.
// Body: { skus: string[], retryMode?: boolean }
// Processa SEQUENCIALMENTE com retry agressivo para deadlocks do MySQL.
// retryMode=true usa delays ainda maiores entre SKUs.

priceUpdate.post('/deactivate-skus', async (c) => {
  try {
    const { skus, retryMode } = await c.req.json() as { skus: string[]; retryMode?: boolean };
    if (!skus?.length) return c.json({ total: 0, deactivated: 0, failed: 0, failedItems: [] });

    console.log(`[deactivate] Processing ${skus.length} SKUs (retryMode=${!!retryMode})`);

    const deactivated: string[] = [];
    const failedItems: Array<{ sku: string; error: string }> = [];
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    // Delay entre SKUs: 2s normal, 5s em retry
    const interSkuDelay = retryMode ? 5000 : 2000;

    for (let i = 0; i < skus.length; i++) {
      const sku = skus[i];
      let lastError = '';
      let success = false;

      // 3 retries com backoff moderado: 2s, 5s, 12s (+ jitter)
      // Delays reduzidos para caber no timeout da Edge Function (~150s)
      // O frontend reenvia lotes adicionais se necessário.
      const retryDelays = [2000, 5000, 12000];
      for (let attempt = 0; attempt <= 3; attempt++) {
        if (attempt > 0) {
          const delay = retryDelays[attempt - 1] + Math.floor(Math.random() * 2000);
          console.log(`[deactivate] Retry ${attempt}/3 for ${sku} — waiting ${Math.round(delay / 1000)}s`);
          await sleep(delay);
        }

        const url = `${MAGENTO_BASE_URL}/rest/V1/products/${encodeURIComponent(sku)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);
        try {
          const res = await fetch(url, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${MAGENTO_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ product: { status: 2 } }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (!res.ok) {
            const text = await res.text();
            let msg = text;
            try { msg = JSON.parse(text)?.message ?? text; } catch {}
            lastError = `HTTP ${res.status}: ${msg.slice(0, 200)}`;
            const isRetryable = (res.status === 400 && /deadlock|bloqueio/i.test(msg))
                                || res.status === 429 || res.status >= 500;
            if (isRetryable && attempt < 3) continue;
            break;
          }
          success = true;
          break;
        } catch (err: any) {
          clearTimeout(timeout);
          lastError = err.message ?? String(err);
          if (/deadlock|bloqueio|abort|timeout|econnreset/i.test(lastError) && attempt < 3) continue;
          break;
        }
      }

      if (success) {
        deactivated.push(sku);
      } else {
        failedItems.push({ sku, error: lastError });
      }

      // Delay entre SKUs
      if (i < skus.length - 1) await sleep(interSkuDelay);

      if ((i + 1) % 5 === 0 || i === skus.length - 1) {
        console.log(`[deactivate] ${i + 1}/${skus.length} (ok=${deactivated.length} fail=${failedItems.length})`);
      }
    }

    console.log(`[deactivate] Done: ${deactivated.length} ok, ${failedItems.length} failed`);

    // Atualizar Meilisearch — marcar active: false
    let meiliTaskUid: number | null = null;
    if (deactivated.length > 0) {
      try {
        const meiliDocs = deactivated.map(sku => ({
          id: meili.sanitizeSku(sku) || sku,
          status: 2,
          active: false,
        }));
        const meiliRes: any = await meili.meiliRequest(
          'PUT',
          '/indexes/toyoparts/documents',
          meiliDocs,
          30_000,
        );
        meiliTaskUid = meiliRes?.taskUid ?? null;
        console.log(`[price-update/deactivate] Meili updated ${deactivated.length} docs (taskUid=${meiliTaskUid})`);
      } catch (meiliErr: any) {
        console.error(`[price-update/deactivate] Meili update error (non-fatal): ${meiliErr.message}`);
      }
    }

    // Invalidar cache de site-skus para que próxima consulta reflita desativações
    if (deactivated.length > 0) {
      try {
        await kv.del(SKU_CACHE_KEY);
        console.log(`[price-update/deactivate] Invalidated site-skus cache after ${deactivated.length} deactivations`);
      } catch (cacheErr: any) {
        console.error(`[price-update/deactivate] Cache invalidation error (non-fatal): ${cacheErr.message}`);
      }
    }

    return c.json({
      total: skus.length,
      deactivated: deactivated.length,
      failed: failedItems.length,
      failedItems,
      meiliTaskUid,
    });
  } catch (err: any) {
    console.error('[price-update/deactivate] Unhandled:', err.message);
    return c.json({ error: err.message }, 500);
  }
});