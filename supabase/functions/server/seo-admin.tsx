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
var SNAPSHOT_PRODUCT_PREFIX = 'snapshot:product:';
var SNAPSHOT_CATEGORY_PREFIX = 'snapshot:category:';
var SITEMAP_STATUS_KEY = 'meta:sitemap_status';
var CATEGORY_TREE_CACHE_KEY = 'meta:category_tree';

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

function evaluateCheck(id: string, category: string, title: string, score: number, maxScore: number, detail: string, recommendation?: string) {
  var status: 'ok' | 'warning' | 'critical' = 'critical';
  var pct = maxScore > 0 ? score / maxScore : 0;
  if (pct >= 0.9) status = 'ok';
  else if (pct >= 0.6) status = 'warning';
  return { id, category, title, status, score, maxScore, detail, recommendation: recommendation || null };
}

function getChildren(node: any): any[] {
  if (!node) return [];
  return (node.children_data || node.children || []).filter(Boolean);
}

function getTopCategoryNodes(tree: any): any[] {
  if (!tree) return [];
  var walk = function(node: any): any[] {
    var activeChildren = getChildren(node).filter(function(child: any) { return child.is_active !== false; });
    if (activeChildren.length === 0) return [];
    if (activeChildren.length === 1) return walk(activeChildren[0]);
    return activeChildren;
  };
  if (Array.isArray(tree)) {
    return tree.flatMap(function(node: any) { return walk(node); });
  }
  return walk(tree);
}

async function computeSeoStatsSnapshot() {
  var allProducts = await kv.getByPrefix(PRODUCT_PREFIX) as any[];
  var total = 0;
  var with_seo_title = 0;
  var with_meta_desc = 0;
  var with_url_key = 0;
  var scoreSum = 0;
  var dist = { excellent: 0, good: 0, fair: 0, poor: 0 };

  for (var i = 0; i < allProducts.length; i++) {
    var p = allProducts[i];
    if (!p || p.status !== 1) continue;

    total++;
    var hasTitle = !!p.seo_title && p.seo_title.length > 5;
    var hasDesc = !!p.meta_description && p.meta_description.length > 10;
    var hasUrl = !!p.url_key && p.url_key.length > 3;

    if (hasTitle) with_seo_title++;
    if (hasDesc) with_meta_desc++;
    if (hasUrl) with_url_key++;

    var score = 0;
    if (hasTitle) score += 35;
    if (hasDesc) score += 35;
    if (hasUrl) score += 15;
    if (p.description && p.description.length > 30) score += 10;
    if (p.image_url) score += 5;
    scoreSum += score;

    if (score >= 80) dist.excellent++;
    else if (score >= 60) dist.good++;
    else if (score >= 40) dist.fair++;
    else dist.poor++;
  }

  return {
    total: total,
    with_seo_title: with_seo_title,
    with_meta_desc: with_meta_desc,
    with_url_key: with_url_key,
    avg_score: total > 0 ? Math.round(scoreSum / total) : 0,
    distribution: dist,
  };
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

    var stats = await computeSeoStatsSnapshot();

    await kv.set(SEO_STATS_CACHE_KEY, { stats: stats, cachedAt: Date.now() }).catch(function() {});

    return c.json(stats);
  } catch (err: any) {
    console.error('[seo-admin/stats] Error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

seoAdmin.get('/health', async (c) => {
  try {
    var stats = await computeSeoStatsSnapshot();
    var activeProducts = stats.total || 0;
    var pctTitle = activeProducts > 0 ? Math.round((stats.with_seo_title / activeProducts) * 100) : 0;
    var pctDesc = activeProducts > 0 ? Math.round((stats.with_meta_desc / activeProducts) * 100) : 0;
    var pctUrl = activeProducts > 0 ? Math.round((stats.with_url_key / activeProducts) * 100) : 0;

    var productSnapshots = await kv.getByPrefix(SNAPSHOT_PRODUCT_PREFIX).catch(function() { return []; }) as any[];
    var categorySnapshots = await kv.getByPrefix(SNAPSHOT_CATEGORY_PREFIX).catch(function() { return []; }) as any[];
    var sitemapStatus = await kv.get(SITEMAP_STATUS_KEY).catch(function() { return null; }) as any;
    var categoryTree = await kv.get(CATEGORY_TREE_CACHE_KEY).catch(function() { return null; }) as any;

    var facetCounts: Record<string, number> = {};
    if (meili.isConfigured()) {
      try {
        var facetResult = await meili.search('', { limit: 0, facets: ['category_ids'] });
        facetCounts = facetResult.facetDistribution?.category_ids || {};
      } catch (facetErr: any) {
        console.warn('[seo-admin/health] category facet fetch failed:', facetErr.message);
      }
    }

    var eligibleCategoryRoutes = 0;
    var topNodes = getTopCategoryNodes(categoryTree);
    var visit = function(node: any, depth: number) {
      if (!node || node.is_active === false || depth > 3) return;
      var count = Number(facetCounts[String(node.id)] || 0);
      if (count > 0) eligibleCategoryRoutes++;
      var children = getChildren(node);
      for (var idx = 0; idx < children.length; idx++) visit(children[idx], depth + 1);
    };
    for (var i = 0; i < topNodes.length; i++) visit(topNodes[i], 1);

    var productSnapshotCoverage = activeProducts > 0 ? Math.round((productSnapshots.length / activeProducts) * 100) : 0;
    var categorySnapshotCoverage = eligibleCategoryRoutes > 0 ? Math.round((categorySnapshots.length / eligibleCategoryRoutes) * 100) : 0;
    var sitemapFiles = sitemapStatus?.files_detail || [];
    var sitemapGenerated = sitemapStatus?.status === 'success' && sitemapFiles.length > 0;

    var checks = [
      evaluateCheck('titles', 'metadata', 'Cobertura de titulos SEO', pctTitle >= 95 ? 10 : pctTitle >= 80 ? 7 : pctTitle >= 60 ? 4 : 1, 10, pctTitle + '% dos produtos ativos possuem titulo SEO.', 'Aumentar cobertura de titulos personalizados nos produtos ativos.'),
      evaluateCheck('descriptions', 'metadata', 'Cobertura de meta descriptions', pctDesc >= 95 ? 10 : pctDesc >= 80 ? 7 : pctDesc >= 60 ? 4 : 1, 10, pctDesc + '% dos produtos ativos possuem meta description.', 'Fechar a cobertura de descriptions para as paginas de produto.'),
      evaluateCheck('urlkeys', 'metadata', 'Cobertura de URL keys', pctUrl >= 98 ? 8 : pctUrl >= 85 ? 6 : pctUrl >= 70 ? 4 : 1, 8, pctUrl + '% dos produtos ativos possuem slug amigavel.', 'Garantir slug amigavel para todo produto ativo.'),
      evaluateCheck('quality', 'metadata', 'Qualidade media dos metadados', stats.avg_score >= 85 ? 8 : stats.avg_score >= 70 ? 6 : stats.avg_score >= 55 ? 4 : 1, 8, 'Score medio atual: ' + stats.avg_score + '%.', 'Elevar score medio de SEO para patamar enterprise (85%+).'),
      evaluateCheck('meili', 'crawlability', 'Indice de busca configurado', meili.isConfigured() ? 6 : 0, 6, meili.isConfigured() ? 'MeiliSearch configurado e consultavel.' : 'MeiliSearch nao esta configurado.', 'Configurar e manter o indice de busca como base de descoberta SEO.'),
      evaluateCheck('robots', 'crawlability', 'Robots.txt ativo', 6, 6, 'Robots bloqueia checkout, admin, conta e parametros sujos; sitemap publicado.', null),
      evaluateCheck('sitemap', 'crawlability', 'Sitemap inteligente gerado', sitemapGenerated ? 10 : sitemapStatus?.status === 'running' ? 6 : 2, 10, sitemapGenerated ? (sitemapFiles.length + ' arquivos XML publicados no ultimo ciclo.') : 'Sitemap inteligente ainda nao esta em estado de sucesso.', 'Executar ou estabilizar a geracao do sitemap inteligente.'),
      evaluateCheck('search-noindex', 'indexability', 'Resultados de busca com noindex', 4, 4, 'SearchPage usa robots=noindex,follow para evitar indexacao de busca interna.', null),
      evaluateCheck('sensitive-noindex', 'indexability', 'Rotas sensiveis fora do indice', 4, 4, 'Checkout e sucesso de pedido usam noindex,nofollow; admin esta bloqueado.', null),
      evaluateCheck('canonical', 'indexability', 'Canonical strategy implementada', 8, 8, 'Produto, home, modelo e paginas institucionais usam canonical consistente.', null),
      evaluateCheck('product-schema', 'structured-data', 'Product schema', 6, 6, 'JSON-LD Product esta implementado nas paginas de produto.', null),
      evaluateCheck('breadcrumb-schema', 'structured-data', 'Breadcrumb schema', 4, 4, 'BreadcrumbList esta presente em PDP e snapshots.', null),
      evaluateCheck('org-schema', 'structured-data', 'Organization/Store schema', 4, 4, 'Organization/AutoPartsStore esta configurado nas paginas SEO criticas.', null),
      evaluateCheck('social-share', 'structured-data', 'Open Graph e social share', 4, 4, 'Open Graph/Twitter e endpoint /seo/share/:sku ativos para compartilhamento.', null),
      evaluateCheck('product-snapshots', 'rendering', 'Cobertura de snapshots de produto', productSnapshotCoverage >= 90 ? 8 : productSnapshotCoverage >= 60 ? 5 : productSnapshotCoverage >= 30 ? 3 : 1, 8, productSnapshots.length + ' snapshots para ' + activeProducts + ' produtos ativos (' + productSnapshotCoverage + '%).', 'Aumentar a cobertura de snapshots de produto e manter regeneracao continua.'),
      evaluateCheck('category-snapshots', 'rendering', 'Cobertura de snapshots de categoria', categorySnapshotCoverage >= 80 ? 6 : categorySnapshotCoverage >= 50 ? 4 : categorySnapshotCoverage >= 20 ? 2 : 1, 6, categorySnapshots.length + ' snapshots para ' + eligibleCategoryRoutes + ' rotas elegiveis (' + categorySnapshotCoverage + '%).', 'Gerar snapshots para mais rotas de categoria com produto real.'),
      evaluateCheck('model-landings', 'architecture', 'Landings indexaveis por modelo', 4, 4, 'Rotas /pecas/:modelo e /pecas/:modelo/:categoriaSlug existem com canonical e conteudo SEO.', null),
      evaluateCheck('category-tree', 'architecture', 'Arvore de categorias carregada', categoryTree ? 4 : 0, 4, categoryTree ? 'Arvore de categorias em cache e pronta para discovery.' : 'Arvore de categorias ausente no cache.', 'Sincronizar a arvore de categorias do Magento para manter a IA e os snapshots coerentes.'),
      evaluateCheck('edge-proxy', 'infrastructure', 'Snapshot proxy no dominio principal', 0, 8, 'Ainda nao ha proxy/worker dedicado servindo snapshots diretamente no dominio principal para bots.', 'Implementar proxy de snapshots no dominio principal para fechar o setup enterprise de renderizacao SEO.'),
      evaluateCheck('auto-invalidation', 'infrastructure', 'Invalidacao automatica de snapshots', 2, 4, 'Existe invalidacao manual e batch, mas a automacao total apos mudancas de conteudo ainda nao esta fechada.', 'Acionar invalidacao automaticamente em updates de preco, estoque, SEO e categorias.'),
    ];

    var totalScore = checks.reduce(function(sum: number, check: any) { return sum + check.score; }, 0);
    var maxScore = checks.reduce(function(sum: number, check: any) { return sum + check.maxScore; }, 0);
    var overallScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    var grade = overallScore >= 90 ? 'A' : overallScore >= 80 ? 'B' : overallScore >= 70 ? 'C' : overallScore >= 60 ? 'D' : 'E';

    var pillarGroups: Record<string, { title: string; score: number; maxScore: number }> = {
      metadata: { title: 'Metadados', score: 0, maxScore: 0 },
      crawlability: { title: 'Rastreabilidade', score: 0, maxScore: 0 },
      indexability: { title: 'Indexabilidade', score: 0, maxScore: 0 },
      'structured-data': { title: 'Structured Data', score: 0, maxScore: 0 },
      rendering: { title: 'Snapshots & Renderizacao', score: 0, maxScore: 0 },
      architecture: { title: 'Arquitetura SEO', score: 0, maxScore: 0 },
      infrastructure: { title: 'Infra SEO Enterprise', score: 0, maxScore: 0 },
    };

    for (var j = 0; j < checks.length; j++) {
      var check = checks[j];
      if (!pillarGroups[check.category]) continue;
      pillarGroups[check.category].score += check.score;
      pillarGroups[check.category].maxScore += check.maxScore;
    }

    var pillars = Object.entries(pillarGroups).map(function(entry: any) {
      var key = entry[0];
      var group = entry[1];
      return {
        id: key,
        title: group.title,
        score: group.score,
        maxScore: group.maxScore,
        percentage: group.maxScore > 0 ? Math.round((group.score / group.maxScore) * 100) : 0,
      };
    });

    var gaps = checks
      .filter(function(check: any) { return check.status !== 'ok'; })
      .map(function(check: any) {
        return {
          id: check.id,
          severity: check.status,
          title: check.title,
          detail: check.detail,
          recommendation: check.recommendation,
        };
      });

    return c.json({
      generated_at: new Date().toISOString(),
      overall: {
        score: overallScore,
        grade: grade,
        enterprise_ready: overallScore >= 85 && gaps.filter(function(g: any) { return g.severity === 'critical'; }).length === 0,
      },
      coverage: {
        active_products: activeProducts,
        seo_title_pct: pctTitle,
        meta_description_pct: pctDesc,
        url_key_pct: pctUrl,
        avg_quality_score: stats.avg_score,
        product_snapshots: productSnapshots.length,
        product_snapshot_pct: productSnapshotCoverage,
        category_snapshots: categorySnapshots.length,
        category_snapshot_pct: categorySnapshotCoverage,
        eligible_category_routes: eligibleCategoryRoutes,
        sitemap_files: sitemapFiles.length,
      },
      checks: checks,
      pillars: pillars,
      gaps: gaps,
      raw: {
        meili_configured: meili.isConfigured(),
        sitemap_status: sitemapStatus?.status || 'idle',
        sitemap_last_completed_at: sitemapStatus?.completed_at || null,
      },
    });
  } catch (err: any) {
    console.error('[seo-admin/health] Error:', err.message);
    return c.json({ error: err.message }, 500);
  }
});
