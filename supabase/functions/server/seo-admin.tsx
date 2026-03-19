// ─── SEO Admin Routes ────────────────────────────────────────────────────────
// Protected by admin middleware. Provides:
//   POST /update      — save seo_title, meta_description, url_key to KV + Meili
//   POST /generate    — single product AI SEO generation (GPT-4o-mini)
//   POST /generate-batch — batch AI SEO generation
//   GET  /stats       — SEO completeness statistics

import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';
import * as meili from './meilisearch.tsx';

var OPENAI_API_KEY = (Deno.env.get('OPENAI_API_KEY') || '').trim();
var PRODUCT_PREFIX = 'product:';
var SEO_STATS_CACHE_KEY = 'meta:seo_stats_cache';
var SEO_STATS_CACHE_TTL = 300000; // 5 min

export var seoAdmin = new Hono();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(text: any): string {
  var str = String(text || '');
  if (!str || str === 'undefined' || str === 'null') return 'sem-nome';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    || 'sem-nome';
}

async function callOpenAI(messages: any[], temperature: number) {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');
  var res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + OPENAI_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: temperature,
      max_tokens: 600,
    }),
  });
  if (!res.ok) {
    var text = await res.text();
    throw new Error('OpenAI HTTP ' + res.status + ': ' + text.slice(0, 200));
  }
  var data = await res.json();
  return data.choices[0].message.content;
}

function parseSEOJson(raw: string): any {
  var cleaned = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    var title = raw.match(/"seo_title"\s*:\s*"([^"]+)"/);
    var desc  = raw.match(/"meta_description"\s*:\s*"([^"]+)"/);
    var url   = raw.match(/"url_key"\s*:\s*"([^"]+)"/);
    if (!title && !desc) throw new Error('Could not parse AI response');
    return {
      seo_title: title ? title[1] : undefined,
      meta_description: desc ? desc[1] : undefined,
      url_key: url ? url[1] : undefined,
    };
  }
}

// ─── POST /update — Save SEO fields ──────────────────────────────────────────

seoAdmin.post('/update', async (c) => {
  try {
    var body = await c.req.json();
    var sku = body.sku;
    if (!sku) return c.json({ error: 'SKU required' }, 400);

    var product = await kv.get(PRODUCT_PREFIX + sku) as any;
    if (!product) return c.json({ error: 'Product ' + sku + ' not found' }, 404);

    var updated = Object.assign({}, product, {
      seo_title:        body.seo_title !== undefined ? body.seo_title : product.seo_title,
      meta_description: body.meta_description !== undefined ? body.meta_description : product.meta_description,
      url_key:          body.url_key !== undefined ? body.url_key : (product.url_key || slugify(product.name)),
      updated_at:       new Date().toISOString(),
    });
    await kv.set(PRODUCT_PREFIX + sku, updated);

    // Update Meilisearch (partial)
    if (meili.isConfigured()) {
      try {
        var sanitizedSku = meili.sanitizeSku(sku);
        if (sanitizedSku) {
          await meili.updateDocumentsPartial([{
            sku: sanitizedSku,
            seo_title:        updated.seo_title,
            meta_description: updated.meta_description,
            url_key:          updated.url_key,
          }]);
        }
      } catch (meiliErr: any) {
        console.warn('[seo-admin/update] Meili partial update failed for ' + sku + ':', meiliErr.message);
      }
    }

    await kv.del(SEO_STATS_CACHE_KEY).catch(function() {});
    console.log('[seo-admin/update] Saved SEO for ' + sku);
    return c.json({ ok: true, sku: sku });
  } catch (err: any) {
    console.error('[seo-admin/update] Error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ─── POST /generate — AI generate SEO for single product ─────────────────────

seoAdmin.post('/generate', async (c) => {
  try {
    var body = await c.req.json();
    var sku = body.sku;
    if (!sku) return c.json({ error: 'SKU required' }, 400);

    var product = await kv.get(PRODUCT_PREFIX + sku) as any;
    if (!product) return c.json({ error: 'Product ' + sku + ' not found' }, 404);

    // Resolve modelo/ano labels
    var modeloLabel = product.modelo_label || '';
    var anoLabels   = product.ano_labels   || '';
    if (!modeloLabel || !anoLabels) {
      try {
        var meta = await kv.get('meili:sync:meta') as any;
        if (meta) {
          if (!modeloLabel && product.modelo) {
            modeloLabel = (meta.modelos && meta.modelos[String(product.modelo)]) || '';
          }
          if (!anoLabels && product.ano) {
            var ids = String(product.ano).split(',').map(function(s: string) { return s.trim(); }).filter(Boolean);
            anoLabels = ids.map(function(id: string) { return (meta.anos && meta.anos[id]) || id; }).join(', ');
          }
        }
      } catch (e) { /* ok */ }
    }

    var prompt = 'Voce e um especialista em SEO para e-commerce de pecas genuinas Toyota (Toyoparts).\n' +
      'Gere SEO otimizado para o produto abaixo.\n\n' +
      'PRODUTO:\n' +
      '- Nome: ' + (product.name || 'N/A') + '\n' +
      '- SKU: ' + sku + '\n' +
      '- Descricao: ' + ((product.description || product.short_description || 'N/A')).slice(0, 500) + '\n' +
      '- Modelo: ' + (modeloLabel || 'N/A') + '\n' +
      '- Anos: ' + (anoLabels || 'N/A') + '\n' +
      '- Preco: R$ ' + (product.price || 'N/A') + '\n\n' +
      'REGRAS:\n' +
      '1. seo_title: 30-65 caracteres. Incluir "Peca Genuina Toyota" ou sinonimo. Incluir modelo se couber.\n' +
      '2. meta_description: 120-160 caracteres. Foco em conversao: beneficios, garantia, confianca.\n' +
      '3. url_key: slug amigavel em lowercase, sem acentos, com hifens. Ex: "amortecedor-dianteiro-corolla"\n\n' +
      'Retorne APENAS JSON valido:\n' +
      '{"seo_title": "...", "meta_description": "...", "url_key": "..."}';

    var raw = await callOpenAI([
      { role: 'system', content: 'Voce e um assistente SEO para e-commerce.' },
      { role: 'user', content: prompt },
    ], 0.5);

    var seo = parseSEOJson(raw);

    var updated = Object.assign({}, product, {
      seo_title:        seo.seo_title        || product.seo_title,
      meta_description: seo.meta_description  || product.meta_description,
      url_key:          seo.url_key           || product.url_key || slugify(product.name),
      updated_at:       new Date().toISOString(),
    });
    await kv.set(PRODUCT_PREFIX + sku, updated);

    if (meili.isConfigured()) {
      try {
        var sanitizedSku = meili.sanitizeSku(sku);
        if (sanitizedSku) {
          await meili.updateDocumentsPartial([{
            sku: sanitizedSku,
            seo_title:        updated.seo_title,
            meta_description: updated.meta_description,
            url_key:          updated.url_key,
          }]);
        }
      } catch (e: any) {
        console.warn('[seo-admin/generate] Meili partial update failed for ' + sku + ':', e.message);
      }
    }

    console.log('[seo-admin/generate] AI SEO generated for ' + sku);
    return c.json({
      sku: sku,
      seo_title:        seo.seo_title,
      meta_description: seo.meta_description,
      url_key:          seo.url_key,
    });
  } catch (err: any) {
    console.error('[seo-admin/generate] Error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ─── POST /generate-batch — Batch AI SEO generation ──────────────────────────

seoAdmin.post('/generate-batch', async (c) => {
  try {
    var body = await c.req.json().catch(function() { return { limit: 10 }; });
    var batchLimit = Math.min(Number(body.limit) || 10, 50);

    // Find products without seo_title using getByPrefix
    var allProducts = await kv.getByPrefix(PRODUCT_PREFIX) as any[];
    var candidates = allProducts.filter(function(p: any) {
      return p && p.status === 1 && (!p.seo_title || p.seo_title.length < 5);
    }).slice(0, batchLimit);

    if (candidates.length === 0) {
      return c.json({ processed: 0, results: [], message: 'No products need SEO generation' });
    }

    console.log('[seo-admin/batch] Processing ' + candidates.length + ' products');

    var results: any[] = [];
    var meiliUpdates: any[] = [];

    for (var i = 0; i < candidates.length; i++) {
      var product = candidates[i];
      try {
        var modeloLabel = '';
        try {
          var meta = await kv.get('meili:sync:meta') as any;
          if (meta && product.modelo) {
            modeloLabel = (meta.modelos && meta.modelos[String(product.modelo)]) || '';
          }
        } catch (e) { /* ok */ }

        var prompt = 'Gere SEO para este produto Toyota. Retorne APENAS JSON:\n' +
          '{"seo_title": "30-65 chars, incluir Peca Genuina Toyota", "meta_description": "120-160 chars focado em conversao", "url_key": "slug-amigavel"}\n\n' +
          'Produto: ' + (product.name || 'N/A') + ' | SKU: ' + product.sku + ' | Modelo: ' + (modeloLabel || 'N/A') + ' | Preco: R$' + (product.price || '0');

        var raw = await callOpenAI([
          { role: 'system', content: 'Voce e um assistente SEO.' },
          { role: 'user', content: prompt },
        ], 0.6);

        var seo = parseSEOJson(raw);

        var updated = Object.assign({}, product, {
          seo_title:        seo.seo_title        || product.seo_title,
          meta_description: seo.meta_description  || product.meta_description,
          url_key:          seo.url_key           || product.url_key || slugify(product.name),
          updated_at:       new Date().toISOString(),
        });
        await kv.set(PRODUCT_PREFIX + product.sku, updated);

        var sanitizedSku = meili.sanitizeSku(product.sku);
        if (sanitizedSku) {
          meiliUpdates.push({
            sku: sanitizedSku,
            seo_title:        updated.seo_title,
            meta_description: updated.meta_description,
            url_key:          updated.url_key,
          });
        }

        results.push({ sku: product.sku, status: 'ok', seo_title: seo.seo_title });
      } catch (e: any) {
        console.warn('[seo-admin/batch] Failed for ' + product.sku + ':', e.message);
        results.push({ sku: product.sku, status: 'error: ' + e.message.slice(0, 100) });
      }
    }

    if (meili.isConfigured() && meiliUpdates.length > 0) {
      try {
        await meili.updateDocumentsPartial(meiliUpdates);
        console.log('[seo-admin/batch] Updated ' + meiliUpdates.length + ' docs in Meili');
      } catch (e: any) {
        console.warn('[seo-admin/batch] Meili bulk update failed:', e.message);
      }
    }

    await kv.del(SEO_STATS_CACHE_KEY).catch(function() {});

    var okCount = results.filter(function(r: any) { return r.status === 'ok'; }).length;
    console.log('[seo-admin/batch] Done: ' + okCount + '/' + results.length + ' processed');
    return c.json({ processed: okCount, total: results.length, results: results });
  } catch (err: any) {
    console.error('[seo-admin/batch] Error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ─── GET /stats — SEO completeness statistics ────────────────────────────────

seoAdmin.get('/stats', async (c) => {
  try {
    // Check cache
    var cached = await kv.get(SEO_STATS_CACHE_KEY).catch(function() { return null; }) as any;
    if (cached && typeof cached === 'object' && cached.cachedAt) {
      if (Date.now() - cached.cachedAt < SEO_STATS_CACHE_TTL) {
        return c.json(cached.stats);
      }
    }

    // Scan all products via getByPrefix
    var allProducts = await kv.getByPrefix(PRODUCT_PREFIX) as any[];

    var total = 0;
    var with_seo_title = 0;
    var with_meta_desc = 0;
    var with_url_key   = 0;
    var scoreSum = 0;
    var dist = { excellent: 0, good: 0, fair: 0, poor: 0 };

    for (var i = 0; i < allProducts.length; i++) {
      var p = allProducts[i];
      if (!p || p.status !== 1) continue;

      total++;
      var hasTitle = !!p.seo_title && p.seo_title.length > 5;
      var hasDesc  = !!p.meta_description && p.meta_description.length > 10;
      var hasUrl   = !!p.url_key && p.url_key.length > 3;

      if (hasTitle) with_seo_title++;
      if (hasDesc)  with_meta_desc++;
      if (hasUrl)   with_url_key++;

      var score = 0;
      if (hasTitle) score += 35;
      if (hasDesc)  score += 35;
      if (hasUrl)   score += 15;
      if (p.description && p.description.length > 30) score += 10;
      if (p.image_url) score += 5;

      scoreSum += score;

      if (score >= 80)      dist.excellent++;
      else if (score >= 60) dist.good++;
      else if (score >= 40) dist.fair++;
      else                  dist.poor++;
    }

    var stats = {
      total: total,
      with_seo_title: with_seo_title,
      with_meta_desc: with_meta_desc,
      with_url_key: with_url_key,
      avg_score: total > 0 ? Math.round(scoreSum / total) : 0,
      distribution: dist,
    };

    await kv.set(SEO_STATS_CACHE_KEY, { stats: stats, cachedAt: Date.now() }).catch(function() {});

    return c.json(stats);
  } catch (err: any) {
    console.error('[seo-admin/stats] Error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});
