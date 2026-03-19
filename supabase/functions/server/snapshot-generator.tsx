// ─── HTML Snapshot Generator (Template Server-Side) ─────────────────────────
// Gera HTML completo para rotas SEO (produto, categoria) sem headless browser.
// O HTML inclui: title, meta description, canonical, OG, JSON-LD, conteudo
// acima da dobra, e script do bundle SPA para hidratacao posterior.
//
// Decisao arquitetural: Template server-side (nao Playwright).
// Mais estavel, barato e rapido que headless browser.

import { Hono } from 'npm:hono';
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from './kv_store.tsx';

const app = new Hono();

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SITE_URL = 'https://www.toyoparts.com.br';
const SITE_NAME = 'Toyoparts';
const SNAPSHOT_BUCKET = 'make-1d6e33e0-snapshots';
const SNAPSHOT_PREFIX = 'snapshot:';

// ─── Helpers ────────────────────────────────────────────────────────────────

function slugify(text: any): string {
  const str = String(text ?? '');
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

function escapeHtml(str: any): string {
  const s = String(str ?? '');
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPrice(price: number): string {
  return price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─── Extract product data helper ────────────────────────────────────────────

function extractProductData(product: any) {
  return {
    sku: product.sku,
    name: product.name || '',
    seo_title: product.seo_title,
    meta_description: product.meta_description,
    url_key: product.url_key,
    price: product.price || 0,
    special_price: product.special_price,
    in_stock: (() => {
      const stockData = product?.extension_attributes?.stock;
      if (!stockData) return false;
      try {
        const stock = typeof stockData === 'string' ? JSON.parse(stockData) : stockData;
        return stock.is_in_stock === '1' || stock.is_in_stock === true || stock.is_in_stock === 1;
      } catch { return false; }
    })(),
    image_url: product.image_url || (() => {
      const attrs = product.custom_attributes;
      if (!Array.isArray(attrs)) return '';
      const img = attrs.find((a: any) => a.attribute_code === 'image');
      return img?.value ? `https://www.toyoparts.com.br/pub/media/catalog/product${img.value}` : '';
    })(),
    description: product.description || (() => {
      const attrs = product.custom_attributes;
      if (!Array.isArray(attrs)) return '';
      return attrs.find((a: any) => a.attribute_code === 'description')?.value || '';
    })(),
    short_description: product.short_description || (() => {
      const attrs = product.custom_attributes;
      if (!Array.isArray(attrs)) return '';
      return attrs.find((a: any) => a.attribute_code === 'short_description')?.value || '';
    })(),
    modelo_label: product.modelo_label,
    ano_labels: product.ano_labels,
  };
}

// ─── Ensure Bucket ──────────────────────────────────────────────────────────

let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.find(b => b.name === SNAPSHOT_BUCKET)) {
      await supabase.storage.createBucket(SNAPSHOT_BUCKET, { public: true });
      console.log(`[Snapshot] Bucket '${SNAPSHOT_BUCKET}' criado.`);
    }
    bucketReady = true;
  } catch (e: any) {
    console.warn('[Snapshot] Bucket check failed:', e.message);
  }
}

// ─── Product JSON-LD ────────────────────────────────────────────────────────

function buildProductJsonLd(product: any) {
  const name = product.seo_title || product.name;
  const urlKey = product.url_key || slugify(product.name || '');
  const url = `${SITE_URL}/produto/${product.sku}/${urlKey}`;
  const price = product.special_price && product.special_price < product.price
    ? product.special_price
    : product.price;
  const inStock = product.in_stock !== false;

  const ld: any = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    sku: product.sku,
    description: (product.description || product.short_description || '')
      .replace(/<[^>]*>/g, '').slice(0, 500),
    brand: { '@type': 'Brand', name: 'Toyota' },
    offers: {
      '@type': 'Offer',
      price: Number(price).toFixed(2),
      priceCurrency: 'BRL',
      availability: inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: SITE_NAME },
      url,
    },
  };

  if (product.image_url) ld.image = product.image_url;

  if (product.modelo_label) {
    ld.isRelatedTo = {
      '@type': 'Vehicle',
      brand: { '@type': 'Brand', name: 'Toyota' },
      model: product.modelo_label,
    };
  }

  return ld;
}

function buildBreadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: `${SITE_URL}${item.url}`,
    })),
  };
}

function buildOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'AutoPartsStore',
    name: SITE_NAME,
    url: SITE_URL,
    description: 'Pecas e acessorios genuinos Toyota. Hilux, Corolla, SW4, Yaris, Etios, RAV4, Prius e Corolla Cross.',
    logo: `${SITE_URL}/pub/media/logo/toyoparts-logo.png`,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      availableLanguage: 'Portuguese',
    },
  };
}

// ─── HTML Template: Product ─────────────────────────────────────────────────

function renderProductHtml(product: any): string {
  const title = product.seo_title || product.name || 'Produto';
  const fullTitle = `${title} | ${SITE_NAME}`;
  const description = product.meta_description
    || product.short_description
    || `Compre ${product.name} na Toyoparts. Peca genuina Toyota com garantia.`;
  const urlKey = product.url_key || slugify(product.name || '');
  const canonical = `${SITE_URL}/produto/${product.sku}/${urlKey}`;
  const image = product.image_url || `${SITE_URL}/pub/media/logo/toyoparts-logo.png`;
  const price = product.special_price && product.special_price < product.price
    ? product.special_price
    : product.price;
  const inStock = product.in_stock !== false;
  const cleanDesc = (product.description || '').replace(/<[^>]*>/g, '').trim();

  // Breadcrumbs
  const breadcrumbs = [
    { name: 'Home', url: '/' },
    { name: 'Pecas', url: '/pecas' },
  ];
  if (product.modelo_label) {
    breadcrumbs.push({ name: product.modelo_label, url: `/pecas/${slugify(product.modelo_label)}` });
  }
  breadcrumbs.push({ name: product.name, url: `/produto/${product.sku}/${urlKey}` });

  const productJsonLd = buildProductJsonLd(product);
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(breadcrumbs);
  const orgJsonLd = buildOrganizationJsonLd();

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${canonical}">

  <!-- Open Graph -->
  <meta property="og:type" content="product">
  <meta property="og:title" content="${escapeHtml(fullTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(image)}">
  <meta property="og:image:width" content="800">
  <meta property="og:image:height" content="600">
  <meta property="og:url" content="${canonical}">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:locale" content="pt_BR">
  <meta property="product:price:amount" content="${Number(price).toFixed(2)}">
  <meta property="product:price:currency" content="BRL">

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(fullTitle)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(image)}">

  <!-- JSON-LD Structured Data -->
  <script type="application/ld+json">${JSON.stringify(productJsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbJsonLd)}</script>
  <script type="application/ld+json">${JSON.stringify(orgJsonLd)}</script>

  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; color: #1a1a2e; background: #fff; }
    .container { max-width: 1200px; margin: 0 auto; padding: 24px 16px; }
    .breadcrumb { display: flex; gap: 8px; font-size: 12px; color: #666; margin-bottom: 24px; flex-wrap: wrap; }
    .breadcrumb a { color: #2563eb; text-decoration: none; }
    .breadcrumb span { color: #999; }
    .product-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
    @media (max-width: 768px) { .product-grid { grid-template-columns: 1fr; } }
    .product-image { width: 100%; max-width: 500px; border-radius: 12px; border: 1px solid #e5e7eb; }
    .product-title { font-size: 24px; font-weight: 700; margin: 0 0 8px; line-height: 1.3; }
    .product-sku { font-size: 12px; color: #666; font-family: monospace; }
    .product-price { font-size: 28px; font-weight: 800; color: #16a34a; margin: 16px 0; }
    .product-stock { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
    .in-stock { background: #dcfce7; color: #15803d; }
    .out-stock { background: #fee2e2; color: #dc2626; }
    .product-desc { font-size: 14px; color: #374151; line-height: 1.7; margin-top: 16px; }
    .compat { margin-top: 16px; padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
    .compat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 600; margin-bottom: 4px; }
    .compat-value { font-size: 14px; font-weight: 600; color: #1e293b; }
    .cta-btn { display: inline-block; padding: 14px 32px; background: #2563eb; color: #fff; border-radius: 10px; font-size: 16px; font-weight: 700; text-decoration: none; margin-top: 20px; }
    .loading-msg { text-align: center; padding: 60px 20px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Breadcrumbs -->
    <nav class="breadcrumb" aria-label="Breadcrumb">
      ${breadcrumbs.map((b, i) =>
        i < breadcrumbs.length - 1
          ? `<a href="${SITE_URL}${b.url}">${escapeHtml(b.name)}</a><span>/</span>`
          : `<span>${escapeHtml(b.name)}</span>`
      ).join('\n      ')}
    </nav>

    <!-- Product Content (Above the Fold) -->
    <div class="product-grid">
      <div>
        ${product.image_url
          ? `<img class="product-image" src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}" width="500" height="500" loading="eager">`
          : `<div class="product-image" style="display:flex;align-items:center;justify-content:center;height:400px;background:#f3f4f6;"><span style="color:#9ca3af;font-size:48px;">&#128247;</span></div>`
        }
      </div>
      <div>
        <h1 class="product-title">${escapeHtml(product.name)}</h1>
        <p class="product-sku">SKU: ${escapeHtml(product.sku)}</p>
        
        <p class="product-price">${formatPrice(price)}</p>
        ${product.special_price && product.special_price < product.price
          ? `<p style="font-size:14px;color:#9ca3af;text-decoration:line-through;">De: ${formatPrice(product.price)}</p>`
          : ''
        }

        <span class="product-stock ${inStock ? 'in-stock' : 'out-stock'}">
          ${inStock ? '&#10003; Em estoque' : '&#10007; Indisponivel'}
        </span>

        ${product.modelo_label ? `
        <div class="compat">
          <div class="compat-label">Compatibilidade</div>
          <div class="compat-value">Toyota ${escapeHtml(product.modelo_label)}${product.ano_labels ? ` (${escapeHtml(product.ano_labels)})` : ''}</div>
        </div>
        ` : ''}

        ${cleanDesc ? `<div class="product-desc">${cleanDesc.slice(0, 500)}</div>` : ''}

        <a class="cta-btn" href="${canonical}">Ver produto completo</a>
      </div>
    </div>
  </div>

  <!-- SPA Hydration Notice -->
  <noscript>
    <p class="loading-msg">Este site funciona melhor com JavaScript ativado. <a href="${canonical}">Clique aqui</a> para acessar o produto completo.</p>
  </noscript>

  <!-- 
    NOTA: Em producao, aqui entraria o <script> do bundle SPA (React) 
    para hidratar a pagina. O Cloudflare Worker deve injetar isso.
    Por enquanto, o snapshot serve como HTML estatico para crawlers e previews.
  -->
</body>
</html>`;
}

// ─── GET /snapshot/product/:sku — Gera ou retorna snapshot HTML ──────────────

app.get('/product/:sku', async (c) => {
  const sku = c.req.param('sku');
  
  try {
    // 1. Tentar buscar snapshot existente do KV (cache)
    const cacheKey = `${SNAPSHOT_PREFIX}product:${sku}`;
    const cached = await kv.get(cacheKey);
    
    if (cached && cached.html && cached.generated_at) {
      const age = Date.now() - new Date(cached.generated_at).getTime();
      // Cache valido por 24h
      if (age < 86400000) {
        return c.html(cached.html, 200, {
          'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
          'X-Snapshot': 'HIT',
          'X-Snapshot-Age': String(Math.round(age / 1000)),
        });
      }
    }

    // 2. Buscar produto do KV
    const product = await kv.get(`product:${sku}`);
    if (!product) {
      return c.html(`<html><head><title>Produto nao encontrado | ${SITE_NAME}</title><meta name="robots" content="noindex"></head><body><h1>Produto nao encontrado</h1></body></html>`, 404, {
        'X-Snapshot': 'MISS_404',
      });
    }

    // 3. Extrair dados relevantes
    const productData = extractProductData(product);

    // 4. Gerar HTML
    const html = renderProductHtml(productData);

    // 5. Cachear no KV
    await kv.set(cacheKey, {
      html,
      sku,
      generated_at: new Date().toISOString(),
    });

    console.log(`[Snapshot] Gerado snapshot para produto ${sku}`);

    return c.html(html, 200, {
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      'X-Snapshot': 'MISS_GENERATED',
    });

  } catch (err: any) {
    console.error(`[Snapshot] Erro ao gerar snapshot para ${sku}:`, err.message);
    return c.json({ error: err.message }, 500);
  }
});

// ─── POST /snapshot/invalidate — Invalida snapshot(s) ───────────────────────

app.post('/invalidate', async (c) => {
  try {
    const body = await c.req.json();
    const { sku, skus, regenerate } = body;

    const skuList = skus || (sku ? [sku] : []);
    if (skuList.length === 0) {
      return c.json({ error: 'Informe sku ou skus[]' }, 400);
    }

    const results: { sku: string; status: string }[] = [];

    for (const s of skuList) {
      const cacheKey = `${SNAPSHOT_PREFIX}product:${s}`;
      try {
        await kv.del(cacheKey);
        results.push({ sku: s, status: 'invalidated' });
        console.log(`[Snapshot] Invalidado: ${s}`);
      } catch (e: any) {
        results.push({ sku: s, status: `error: ${e.message}` });
      }
    }

    // Opcional: regenerar imediatamente
    if (regenerate) {
      for (const s of skuList) {
        try {
          const product = await kv.get(`product:${s}`);
          if (product) {
            const productData = extractProductData(product);
            const html = renderProductHtml(productData);
            await kv.set(`${SNAPSHOT_PREFIX}product:${s}`, {
              html,
              sku: s,
              generated_at: new Date().toISOString(),
            });
            console.log(`[Snapshot] Regenerado: ${s}`);
          }
        } catch (e: any) {
          console.error(`[Snapshot] Erro ao regenerar ${s}:`, e.message);
        }
      }
    }

    return c.json({ invalidated: skuList.length, results, regenerated: !!regenerate });

  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── GET /snapshot/stats — Status dos snapshots ──────────────────────────────

app.get('/stats', async (c) => {
  try {
    const snapshots = await kv.getByPrefix(SNAPSHOT_PREFIX);
    const total = snapshots?.length || 0;

    let oldest: string | null = null;
    let newest: string | null = null;

    for (const snap of (snapshots || [])) {
      const val = snap?.value || snap;
      if (val?.generated_at) {
        if (!oldest || val.generated_at < oldest) oldest = val.generated_at;
        if (!newest || val.generated_at > newest) newest = val.generated_at;
      }
    }

    return c.json({
      total_snapshots: total,
      oldest_snapshot: oldest,
      newest_snapshot: newest,
      cache_ttl_hours: 24,
    });
  } catch (err: any) {
    return c.json({ error: err.message, total_snapshots: 0 }, 500);
  }
});

// ─── POST /snapshot/generate-batch — Gerar snapshots em lote ─────────────────

app.post('/generate-batch', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const limit = Math.min(body.limit || 50, 200);
    const forceRegenerate = body.force === true;

    // Cursor-based: pass `after_key` to paginate without loading all products
    const afterKey = body.after_key || null;

    let query = supabase
      .from('kv_store_1d6e33e0')
      .select('key, value')
      .like('key', 'product:%')
      .order('key')
      .limit(limit);

    if (afterKey) {
      query = query.gt('key', afterKey);
    }

    const { data: products, error } = await query;

    if (error) throw new Error(`DB error: ${error.message}`);
    if (!products || products.length === 0) {
      return c.json({ message: 'Nenhum produto restante', generated: 0, done: true });
    }

    let generated = 0;
    let skipped = 0;
    let errors = 0;
    const lastKey = products[products.length - 1]?.key || null;

    for (const row of products) {
      const product = row.value;
      if (!product?.sku) { skipped++; continue; }

      const cacheKey = `${SNAPSHOT_PREFIX}product:${product.sku}`;

      // Skip if already cached (less than 24h) unless force
      if (!forceRegenerate) {
        const existing = await kv.get(cacheKey);
        if (existing?.generated_at) {
          const age = Date.now() - new Date(existing.generated_at).getTime();
          if (age < 86400000) { skipped++; continue; }
        }
      }

      try {
        const productData = extractProductData(product);
        const html = renderProductHtml(productData);
        await kv.set(cacheKey, { html, sku: product.sku, generated_at: new Date().toISOString() });
        generated++;
      } catch (e: any) {
        errors++;
        console.error(`[Snapshot Batch] Erro para ${product.sku}: ${e.message}`);
      }
    }

    const hasMore = products.length >= limit;
    console.log(`[Snapshot Batch] Gerados: ${generated}, Skipped: ${skipped}, Erros: ${errors}, hasMore: ${hasMore}`);
    return c.json({
      generated, skipped, errors,
      total_processed: products.length,
      done: !hasMore,
      next_after_key: hasMore ? lastKey : null,
    });

  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── POST /snapshot/generate-all — Regenerar TODOS via steps (cursor paginado) ─
// Inicia um job que vai rodando por steps, salvando progresso no KV.
// O frontend chama POST /generate-all/step repetidamente até done=true.

const SSG_JOB_KEY = 'meta:ssg_job';

app.post('/generate-all', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const force = body.force === true;
    const batchSize = Math.min(body.batch_size || 100, 200);

    // Count total products
    const { count, error: cntErr } = await supabase
      .from('kv_store_1d6e33e0')
      .select('*', { count: 'exact', head: true })
      .like('key', 'product:%');

    if (cntErr) throw new Error(`Count error: ${cntErr.message}`);

    const job = {
      status: 'running',
      started_at: new Date().toISOString(),
      total_products: count || 0,
      processed: 0,
      generated: 0,
      skipped: 0,
      errors: 0,
      force,
      batch_size: batchSize,
      next_after_key: null as string | null,
      done: false,
    };
    await kv.set(SSG_JOB_KEY, job);

    console.log(`[SSG] Job iniciado: ${count} produtos, batch=${batchSize}, force=${force}`);
    return c.json({ message: 'Job SSG iniciado — chame POST /generate-all/step em loop', ...job });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post('/generate-all/step', async (c) => {
  try {
    const job = await kv.get(SSG_JOB_KEY);
    if (!job || job.status !== 'running') {
      return c.json({ error: 'Nenhum job SSG em andamento. Inicie com POST /generate-all', status: job?.status || 'idle' }, 400);
    }

    if (job.done) {
      return c.json({ message: 'Job já concluído', ...job });
    }

    const batchSize = job.batch_size || 100;
    let query = supabase
      .from('kv_store_1d6e33e0')
      .select('key, value')
      .like('key', 'product:%')
      .order('key')
      .limit(batchSize);

    if (job.next_after_key) {
      query = query.gt('key', job.next_after_key);
    }

    const { data: products, error } = await query;
    if (error) throw new Error(`DB error: ${error.message}`);

    if (!products || products.length === 0) {
      // Done!
      const completed = {
        ...job,
        status: 'completed',
        done: true,
        completed_at: new Date().toISOString(),
        elapsed_seconds: Math.round((Date.now() - new Date(job.started_at).getTime()) / 1000),
      };
      await kv.set(SSG_JOB_KEY, completed);
      console.log(`[SSG] Job concluído: ${completed.generated} gerados, ${completed.skipped} skipped, ${completed.errors} erros`);
      return c.json(completed);
    }

    let generated = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of products) {
      const product = row.value;
      if (!product?.sku) { skipped++; continue; }

      const cacheKey = `${SNAPSHOT_PREFIX}product:${product.sku}`;

      if (!job.force) {
        const existing = await kv.get(cacheKey);
        if (existing?.generated_at) {
          const age = Date.now() - new Date(existing.generated_at).getTime();
          if (age < 86400000) { skipped++; continue; }
        }
      }

      try {
        const productData = extractProductData(product);
        const html = renderProductHtml(productData);
        await kv.set(cacheKey, { html, sku: product.sku, generated_at: new Date().toISOString() });
        generated++;
      } catch (e: any) {
        errors++;
        console.error(`[SSG Step] Erro ${product.sku}: ${e.message}`);
      }
    }

    const lastKey = products[products.length - 1]?.key || null;
    const hasMore = products.length >= batchSize;

    const updated = {
      ...job,
      processed: job.processed + products.length,
      generated: job.generated + generated,
      skipped: job.skipped + skipped,
      errors: job.errors + errors,
      next_after_key: hasMore ? lastKey : null,
      done: !hasMore,
      status: hasMore ? 'running' : 'completed',
      ...(hasMore ? {} : { completed_at: new Date().toISOString() }),
      elapsed_seconds: Math.round((Date.now() - new Date(job.started_at).getTime()) / 1000),
      progress: job.total_products > 0 ? Math.round(((job.processed + products.length) / job.total_products) * 100) : 0,
    };
    await kv.set(SSG_JOB_KEY, updated);

    console.log(`[SSG Step] batch=${products.length}, gen=${generated}, skip=${skipped}, err=${errors}, progress=${updated.progress}%`);
    return c.json(updated);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get('/generate-all/status', async (c) => {
  try {
    const job = await kv.get(SSG_JOB_KEY);
    return c.json(job || { status: 'idle' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── GET /snapshot/manifest — Lista todas as URLs de snapshots para SW ────────

app.get('/manifest', async (c) => {
  try {
    const snapshots = await kv.getByPrefix(SNAPSHOT_PREFIX);
    const urls: { sku: string; url: string; generated_at: string }[] = [];

    for (const snap of (snapshots || [])) {
      const val = snap?.value || snap;
      if (val?.sku && val?.generated_at) {
        urls.push({
          sku: val.sku,
          url: `/produto/${val.sku}`,
          generated_at: val.generated_at,
        });
      }
    }

    return c.json({
      total: urls.length,
      generated_at: new Date().toISOString(),
      urls,
    });
  } catch (err: any) {
    return c.json({ error: err.message, total: 0, urls: [] }, 500);
  }
});

// ─── DELETE /snapshot/purge — Limpa TODOS os snapshots ───────────────────────

app.delete('/purge', async (c) => {
  try {
    const snapshots = await kv.getByPrefix(SNAPSHOT_PREFIX);
    const keys = (snapshots || [])
      .map((s: any) => s?.key)
      .filter(Boolean);

    if (keys.length === 0) return c.json({ purged: 0 });

    // Delete in batches of 50
    for (let i = 0; i < keys.length; i += 50) {
      const batch = keys.slice(i, i + 50);
      await kv.mdel(batch);
    }

    console.log(`[Snapshot] Purged ${keys.length} snapshots`);
    return c.json({ purged: keys.length });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export { app as snapshotGenerator };