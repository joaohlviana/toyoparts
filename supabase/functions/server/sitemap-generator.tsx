import { Hono } from 'npm:hono';
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from './kv_store.tsx';
import * as meili from './meilisearch.tsx';

const app = new Hono();
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ─── Configurações de SEO (The "Velvet Rope") ──────────────────────────────
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") || '').replace(/\/$/, '');
const CONFIG = {
  MIN_PRODUCTS: 3,        // Mínimo de produtos EM ESTOQUE para indexar a URL
  DOMINANCE_THRESHOLD: 0.8, // Se o filtro tem >80% dos produtos da categoria, não gera (canoniza pai)
  TOP_N_BRANDS: 50,       // Top 50 categorias por modelo (evita cauda longa inútil)
  TOP_N_MODELS: 20,       // Top 20 modelos (safety limit)
  BASE_URL: 'https://www.toyoparts.com.br', // Domínio do site
  BUCKET_NAME: 'make-1d6e33e0-sitemaps',    // Bucket no Supabase Storage (prefixo obrigatório)
};

// ─── Interfaces ──────────────────────────────────────────────────────────────
interface SitemapFileInfo {
  name: string;
  type: 'products' | 'categories' | 'filters' | 'static' | 'index';
  url_count: number;
  url: string;
}

interface SitemapStats {
  status: 'idle' | 'running' | 'success' | 'error';
  started_at: string;
  completed_at?: string;
  failed_at?: string;
  urls_generated: number;
  urls_by_type: {
    static: number;
    products: number;
    categories: number;
    filters: number;
  };
  pages_skipped_stock: number;      // < 3 produtos
  pages_skipped_dominance: number;  // > 80% da categoria
  pages_skipped_limit: number;      // Fora do Top N
  files_created: string[];
  files_detail: SitemapFileInfo[];
  logs: string[];
  error?: string;
}

// ─── Slugify ─────────────────────────────────────────────────────────────────
function slugify(text: any): string {
  // Ultra-defensive: guard against null, undefined, numbers, objects
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

// ─── Helper: Ensure Bucket ───────────────────────────────────────────────────
async function ensureBucket(): Promise<boolean> {
  try {
    const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
    if (listErr) {
      console.error(`[Sitemap] listBuckets error: ${listErr.message}`);
      return false;
    }
    if (!buckets?.find(b => b.name === CONFIG.BUCKET_NAME)) {
      const { error: createErr } = await supabase.storage.createBucket(CONFIG.BUCKET_NAME, {
        public: true,
        fileSizeLimit: 10485760, // 10MB
      });
      if (createErr) {
        console.error(`[Sitemap] createBucket error: ${createErr.message}`);
        return false;
      }
      console.log(`[Sitemap] Bucket '${CONFIG.BUCKET_NAME}' criado.`);
    }
    return true;
  } catch (e: any) {
    console.error(`[Sitemap] ensureBucket exception: ${e.message}`);
    return false;
  }
}

// ─── Helper: Upload XML to Storage ───────────────────────────────────────────
async function uploadSitemap(filename: string, content: string): Promise<string> {
  // Upload com upsert (substitui se existir)
  const { error } = await supabase.storage
    .from(CONFIG.BUCKET_NAME)
    .upload(filename, content, {
      contentType: 'application/xml',
      upsert: true,
      cacheControl: '3600'
    });

  if (error) throw new Error(`Upload failed for ${filename}: ${error.message}`);

  // URL pública correta: usa SUPABASE_URL, não o domínio do site
  return `${SUPABASE_URL}/storage/v1/object/public/${CONFIG.BUCKET_NAME}/${filename}`;
}

// ─── Helper: Generate XML String ─────────────────────────────────────────────
function buildXml(urls: { loc: string; priority?: string; changefreq?: string; image?: string; imageTitle?: string }[]) {
  const date = new Date().toISOString().split('T')[0];
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n`;
  xml += `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n`;

  urls.forEach(u => {
    xml += `  <url>\n`;
    xml += `    <loc>${escapeXml(u.loc)}</loc>\n`;
    xml += `    <lastmod>${date}</lastmod>\n`;
    xml += `    <changefreq>${u.changefreq || 'weekly'}</changefreq>\n`;
    xml += `    <priority>${u.priority || '0.7'}</priority>\n`;
    if (u.image) {
      xml += `    <image:image>\n`;
      xml += `      <image:loc>${escapeXml(u.image)}</image:loc>\n`;
      if (u.imageTitle) {
        xml += `      <image:title>${escapeXml(u.imageTitle)}</image:title>\n`;
      }
      xml += `    </image:image>\n`;
    }
    xml += `  </url>\n`;
  });

  xml += `</urlset>`;
  return xml;
}

function buildIndexXml(sitemapUrls: string[]) {
  const date = new Date().toISOString().split('T')[0];
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

  sitemapUrls.forEach(url => {
    xml += `  <sitemap>\n`;
    xml += `    <loc>${escapeXml(url)}</loc>\n`;
    xml += `    <lastmod>${date}</lastmod>\n`;
    xml += `  </sitemap>\n`;
  });

  xml += `</sitemapindex>`;
  return xml;
}

function escapeXml(str: any): string {
  // Guard against null/undefined
  const s = String(str ?? '');
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─── Logger Helper ───────────────────────────────────────────────────────────
const MAX_LOGS = 80;
async function logUpdate(currentStats: SitemapStats, msg: string) {
  console.log(`[Sitemap] ${msg}`);
  const newLogs = [msg, ...currentStats.logs].slice(0, MAX_LOGS);
  const newStats = { ...currentStats, logs: newLogs };
  await kv.set('meta:sitemap_status', newStats).catch(() => {});
  return newStats;
}

// ─── MAIN GENERATOR ──────────────────────────────────────────────────────────
app.post('/generate', async (c) => {
  // 1. Init Status
  let stats: SitemapStats = {
    status: 'running',
    started_at: new Date().toISOString(),
    urls_generated: 0,
    urls_by_type: {
      static: 0,
      products: 0,
      categories: 0,
      filters: 0,
    },
    pages_skipped_stock: 0,
    pages_skipped_dominance: 0,
    pages_skipped_limit: 0,
    files_created: [],
    files_detail: [],
    logs: [],
  };

  try {
    stats = await logUpdate(stats, 'Iniciando geracao de sitemaps...');

    // 2. Ensure Bucket
    const bucketOk = await ensureBucket();
    if (!bucketOk) {
      stats = await logUpdate(stats, 'AVISO: Bucket nao pode ser criado. Tentando upload mesmo assim...');
    } else {
      stats = await logUpdate(stats, `Bucket '${CONFIG.BUCKET_NAME}' verificado.`);
    }

    // 3. Check Meilisearch
    if (!meili.isConfigured()) {
      throw new Error('Meilisearch nao esta configurado. Verifique MEILISEARCH_HOST e MEILISEARCH_API_KEY.');
    }

    const sitemapFiles: string[] = [];
    const productUrls: { loc: string; priority?: string; changefreq?: string; image?: string; imageTitle?: string }[] = [];
    const categoryUrls: { loc: string; priority?: string; changefreq?: string }[] = [];
    const filterUrls: { loc: string; priority?: string; changefreq?: string }[] = [];

    // ─── 4. PRODUCT URLS (sempre funciona, não depende de tree) ──────────────
    stats = await logUpdate(stats, 'Buscando produtos no Meilisearch...');

    // Paginar: Meilisearch retorna max 1000 por request por padrão
    let productOffset = 0;
    const PRODUCT_BATCH = 1000;
    let totalProductsFound = 0;

    while (true) {
      try {
        const productSearch = await meili.search('', {
          limit: PRODUCT_BATCH,
          offset: productOffset,
          filter: ['in_stock = true', 'status = 1'],
        });

        const hits = productSearch.hits || [];
        if (hits.length === 0) break;

        for (const p of hits) {
          try {
            if (!p || !p.sku || !p.name) continue;
            const pName = String(p.name);
            const pSku = String(p.sku);
            const urlKey = slugify(pName);
            productUrls.push({
              loc: `${CONFIG.BASE_URL}/produto/${encodeURIComponent(pSku)}/${urlKey}`,
              priority: '0.8',
              changefreq: 'weekly',
              image: p.image_url ? String(p.image_url) : undefined,
              imageTitle: pName || undefined,
            });
          } catch (itemErr: any) {
            console.error(`[Sitemap] Product processing error for SKU=${p?.sku}:`, itemErr);
          }
        }

        totalProductsFound += hits.length;
        productOffset += PRODUCT_BATCH;

        // Safety: limit to 50k products
        if (totalProductsFound >= 50000) {
          stats = await logUpdate(stats, `AVISO: Limite de 50.000 produtos atingido.`);
          break;
        }

        // If we got less than batch size, we're done
        if (hits.length < PRODUCT_BATCH) break;
      } catch (searchErr: any) {
        stats = await logUpdate(stats, `AVISO: Erro ao paginar produtos (offset=${productOffset}): ${searchErr.message}`);
        break;
      }
    }

    stats = await logUpdate(stats, `${productUrls.length} produtos com estoque encontrados.`);
    stats.urls_by_type.products = productUrls.length;

    // ─── 5. MODEL LANDING + MODEL×CATEGORY URLS ─────────────────────────────
    // Strategy: MODEL-FIRST generation matching frontend route pattern:
    //   /pecas/:modeloSlug              → Model landing page
    //   /pecas/:modeloSlug/:catSlug     → Model + Category combo
    // 
    // The frontend resolves these via ModeloSearchWrapper which converts the
    // :categoriaSlug param to a search query within the model's products.
    // So category slugs like "iluminacao" become search term "iluminacao".
    //
    // OLD (BROKEN): /categoria/:catSlug/:modelSlug  — route doesn't exist!
    // NEW (FIXED):  /pecas/:modeloSlug/:catSlug     — matches routes.tsx
    stats = await logUpdate(stats, 'Analisando modelos e categorias (model-first strategy)...');

    // 5a. Get facet distribution for modelos and category_names
    let rootSearch: any;
    try {
      rootSearch = await meili.search('', {
        limit: 0,
        filter: ['in_stock = true'],
        facets: ['modelos', 'category_names'],
      });
    } catch (e: any) {
      stats = await logUpdate(stats, `AVISO: Falha ao buscar facets: ${e.message}. Continuando apenas com produtos.`);
      rootSearch = { facetDistribution: {} };
    }

    const modelosDist = rootSearch.facetDistribution?.modelos || {};
    const categoryNamesDist = rootSearch.facetDistribution?.category_names || {};
    const modelCount = Object.keys(modelosDist).length;
    const catNamesCount = Object.keys(categoryNamesDist).length;

    stats = await logUpdate(stats, `Facets: ${modelCount} modelos, ${catNamesCount} category_names.`);

    // 5b. Generate Model Landing Pages (/pecas/:modeloSlug)
    const modelEntries = Object.entries(modelosDist)
      .sort((a, b) => (b[1] as number) - (a[1] as number));

    let modelsProcessed = 0;
    let modelsSkipped = 0;

    for (const [modelName, modelTotal] of modelEntries) {
      const mTotal = modelTotal as number;
      const mName = String(modelName ?? '');
      if (!mName || mName === 'undefined' || mName === 'null') { modelsSkipped++; continue; }
      if (mTotal < CONFIG.MIN_PRODUCTS) { stats.pages_skipped_stock++; modelsSkipped++; continue; }

      const modelSlug = slugify(mName);

      // Model landing page: /pecas/:modeloSlug
      categoryUrls.push({
        loc: `${CONFIG.BASE_URL}/pecas/${modelSlug}`,
        priority: '0.8',
        changefreq: 'daily',
      });
      modelsProcessed++;

      // 5c. Generate Model×Category combo pages (/pecas/:modeloSlug/:catSlug)
      try {
        const catSearch = await meili.search('', {
          limit: 0,
          filter: [`modelos = "${mName}"`, 'in_stock = true'],
          facets: ['category_names'],
        });

        const catDist = catSearch.facetDistribution?.category_names || {};
        const categories = Object.entries(catDist)
          .sort((a, b) => (b[1] as number) - (a[1] as number))
          .slice(0, CONFIG.TOP_N_BRANDS); // Reuse TOP_N_BRANDS as category limit per model

        stats.pages_skipped_limit += Math.max(0, Object.keys(catDist).length - categories.length);

        for (const [catName, catCount] of categories) {
          const cc = catCount as number;
          const cName = String(catName ?? '');
          if (!cName || cName === 'undefined' || cName === 'null') continue;
          if (cc < CONFIG.MIN_PRODUCTS) { stats.pages_skipped_stock++; continue; }
          if ((cc / mTotal) > CONFIG.DOMINANCE_THRESHOLD) { stats.pages_skipped_dominance++; continue; }

          const catSlug = slugify(cName);
          filterUrls.push({
            loc: `${CONFIG.BASE_URL}/pecas/${modelSlug}/${catSlug}`,
            priority: '0.6',
            changefreq: 'weekly',
          });
        }
      } catch (catErr: any) {
        console.error(`[Sitemap] Category facet error for model "${mName}":`, catErr);
      }
    }

    stats = await logUpdate(stats, `Modelos: ${modelsProcessed} landing pages, ${modelsSkipped} pulados. Combos modelo×categoria: ${filterUrls.length} URLs.`);

    // 5d. Standalone category pages (categories not tied to a specific model)
    // These go to /busca?category_name=... which is handled by SearchPageWrapper.
    // We generate them as lower-priority supplementary URLs.
    if (catNamesCount > 0) {
      let standaloneCats = 0;
      for (const [catName, catTotal] of Object.entries(categoryNamesDist)) {
        const ct = catTotal as number;
        const cName = String(catName ?? '');
        if (!cName || cName === 'undefined' || cName === 'null') continue;
        if (ct < CONFIG.MIN_PRODUCTS) continue;

        categoryUrls.push({
          loc: `${CONFIG.BASE_URL}/busca?category_name=${encodeURIComponent(cName)}`,
          priority: '0.5',
          changefreq: 'weekly',
        });
        standaloneCats++;
      }
      stats = await logUpdate(stats, `Categorias standalone (via /busca): ${standaloneCats} URLs.`);
    }

    stats = await logUpdate(stats, `Total URLs: ${productUrls.length} produtos + ${categoryUrls.length} modelos/categorias + ${filterUrls.length} combos.`);
    stats.urls_by_type.categories = categoryUrls.length;
    stats.urls_by_type.filters = filterUrls.length;

    // ─── 6. Static pages ─────────────────────────────────────────────────────
    const staticUrls: { loc: string; priority?: string; changefreq?: string }[] = [
      { loc: `${CONFIG.BASE_URL}/`, priority: '1.0', changefreq: 'daily' },
      { loc: `${CONFIG.BASE_URL}/pecas`, priority: '0.9', changefreq: 'daily' },
    ];
    stats.urls_by_type.static = staticUrls.length;

    // ─── 7. Build and Upload XML files — SEPARATED BY TYPE ──────────────────
    // Each type gets its own sitemap file(s). Products get chunked at 40k.
    // This follows Google's best practice: distinct sitemaps for different
    // content types make it easier to monitor coverage in Search Console.

    const totalUrls = staticUrls.length + categoryUrls.length + filterUrls.length + productUrls.length;
    if (totalUrls === 0) {
      throw new Error('Nenhuma URL gerada. Verifique se o Meilisearch tem produtos indexados com in_stock=true e status=1.');
    }

    // URLs that go into sitemap_index (not the index itself)
    const indexEntries: string[] = [];

    // Helper to upload a typed sitemap and track it
    async function uploadTypedSitemap(
      fileName: string,
      urls: { loc: string; priority?: string; changefreq?: string; image?: string; imageTitle?: string }[],
      type: SitemapFileInfo['type'],
    ) {
      if (urls.length === 0) return;
      const xmlContent = buildXml(urls);
      const publicUrl = await uploadSitemap(fileName, xmlContent);
      sitemapFiles.push(publicUrl);
      indexEntries.push(publicUrl);
      stats.files_detail.push({ name: fileName, type, url_count: urls.length, url: publicUrl });
      stats = await logUpdate(stats, `[${type.toUpperCase()}] '${fileName}' enviado (${urls.length} URLs).`);
    }

    stats = await logUpdate(stats, `Gerando arquivos XML separados por tipo...`);

    // ── 7a. sitemap_static.xml ──────────────────────────────────────────────
    try {
      await uploadTypedSitemap('sitemap_static.xml', staticUrls, 'static');
    } catch (e: any) {
      stats = await logUpdate(stats, `ERRO ao enviar sitemap_static.xml: ${e.message}`);
      throw e;
    }

    // ── 7b. sitemap_categories.xml ──────────────────────────────────────────
    if (categoryUrls.length > 0) {
      try {
        const CAT_CHUNK = 40000;
        if (categoryUrls.length <= CAT_CHUNK) {
          await uploadTypedSitemap('sitemap_categories.xml', categoryUrls, 'categories');
        } else {
          for (let i = 0; i < categoryUrls.length; i += CAT_CHUNK) {
            const chunk = categoryUrls.slice(i, i + CAT_CHUNK);
            const idx = Math.floor(i / CAT_CHUNK) + 1;
            await uploadTypedSitemap(`sitemap_categories_${idx}.xml`, chunk, 'categories');
          }
        }
      } catch (e: any) {
        stats = await logUpdate(stats, `ERRO ao enviar sitemap_categories: ${e.message}`);
        throw e;
      }
    } else {
      stats = await logUpdate(stats, `[CATEGORIES] Nenhuma categoria valida — arquivo nao gerado.`);
    }

    // ── 7c. sitemap_filters.xml ─────────────────────────────────────────────
    if (filterUrls.length > 0) {
      try {
        const FILTER_CHUNK = 40000;
        if (filterUrls.length <= FILTER_CHUNK) {
          await uploadTypedSitemap('sitemap_filters.xml', filterUrls, 'filters');
        } else {
          for (let i = 0; i < filterUrls.length; i += FILTER_CHUNK) {
            const chunk = filterUrls.slice(i, i + FILTER_CHUNK);
            const idx = Math.floor(i / FILTER_CHUNK) + 1;
            await uploadTypedSitemap(`sitemap_filters_${idx}.xml`, chunk, 'filters');
          }
        }
      } catch (e: any) {
        stats = await logUpdate(stats, `ERRO ao enviar sitemap_filters: ${e.message}`);
        throw e;
      }
    } else {
      stats = await logUpdate(stats, `[FILTERS] Nenhum filtro valido — arquivo nao gerado.`);
    }

    // ── 7d. sitemap_products_*.xml (chunked at 40k) ─────────────────────────
    if (productUrls.length > 0) {
      try {
        const PRODUCT_CHUNK = 40000;
        if (productUrls.length <= PRODUCT_CHUNK) {
          await uploadTypedSitemap('sitemap_products.xml', productUrls, 'products');
        } else {
          for (let i = 0; i < productUrls.length; i += PRODUCT_CHUNK) {
            const chunk = productUrls.slice(i, i + PRODUCT_CHUNK);
            const idx = Math.floor(i / PRODUCT_CHUNK) + 1;
            await uploadTypedSitemap(`sitemap_products_${idx}.xml`, chunk, 'products');
          }
        }
      } catch (e: any) {
        stats = await logUpdate(stats, `ERRO ao enviar sitemap_products: ${e.message}`);
        throw e;
      }
    } else {
      stats = await logUpdate(stats, `[PRODUCTS] Nenhum produto valido — arquivo nao gerado.`);
    }

    // ─── 8. Generate sitemap_index.xml ───────────────────────────────────────
    // Points to all the type-specific sitemaps (NOT to itself)
    if (indexEntries.length > 0) {
      try {
        const indexXmlContent = buildIndexXml(indexEntries);
        const indexUrl = await uploadSitemap('sitemap_index.xml', indexXmlContent);
        sitemapFiles.push(indexUrl);
        stats.files_detail.push({
          name: 'sitemap_index.xml',
          type: 'index',
          url_count: indexEntries.length,
          url: indexUrl,
        });
        stats = await logUpdate(stats, `[INDEX] sitemap_index.xml criado apontando para ${indexEntries.length} sitemap(s): ${indexEntries.map(u => u.split('/').pop()).join(', ')}`);
      } catch (indexErr: any) {
        stats = await logUpdate(stats, `AVISO: Erro ao criar sitemap index: ${indexErr.message}`);
      }
    }

    // ─── 9. Success ──────────────────────────────────────────────────────────
    stats.status = 'success';
    stats.completed_at = new Date().toISOString();
    stats.files_created = sitemapFiles;
    stats.urls_generated = totalUrls;

    const elapsed = Math.round((Date.now() - new Date(stats.started_at).getTime()) / 1000);
    stats = await logUpdate(stats, `Processo concluido com sucesso! ${totalUrls} URLs em ${elapsed}s.`);

    return c.json(stats);

  } catch (err: any) {
    console.error('[Sitemap] Critical error:', err);
    console.error('[Sitemap] Stack:', err?.stack || 'no stack');
    stats.status = 'error';
    stats.error = `${err.message} | Stack: ${(err?.stack || '').split('\n').slice(0, 3).join(' → ')}`;
    stats.failed_at = new Date().toISOString();
    stats = await logUpdate(stats, `ERRO CRITICO: ${err.message}`);
    return c.json(stats, 500);
  }
});

// ─── GET Status ──────────────────────────────────────────────────────────────
app.get('/status', async (c) => {
  try {
    const current = await kv.get('meta:sitemap_status');
    return c.json(current || { status: 'idle', logs: [], files_created: [], urls_generated: 0 });
  } catch (e: any) {
    return c.json({ status: 'error', error: e.message, logs: [], files_created: [] }, 500);
  }
});

// ─── GET /files — Lista arquivos no bucket ───────────────────────────────────
app.get('/files', async (c) => {
  try {
    const { data, error } = await supabase.storage.from(CONFIG.BUCKET_NAME).list('', { limit: 100 });
    if (error) return c.json({ error: error.message, files: [] }, 500);

    const files = (data || []).map(f => ({
      name: f.name,
      size: f.metadata?.size || 0,
      created_at: f.created_at,
      url: `${SUPABASE_URL}/storage/v1/object/public/${CONFIG.BUCKET_NAME}/${f.name}`,
    }));

    return c.json({ files, bucket: CONFIG.BUCKET_NAME });
  } catch (e: any) {
    return c.json({ error: e.message, files: [] }, 500);
  }
});

export const sitemapGenerator = app;