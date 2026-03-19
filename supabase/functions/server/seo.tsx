import { Hono } from 'npm:hono';
import * as meili from './meilisearch.tsx';
import * as kv from './kv_store.tsx';
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const app = new Hono();
const SITE_URL = 'https://www.toyoparts.com.br';
const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") || '').replace(/\/$/, '');

// ─── Slugify Helper ──────────────────────────────────────────────────────────
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

// ─── ROBOTS.TXT ──────────────────────────────────────────────────────────────
app.get('/robots.txt', (c) => {
  const robots = `User-agent: *
Allow: /
Disallow: /minha-conta/*
Disallow: /checkout/*
Disallow: /admin/*
Disallow: /acesso
Disallow: /search?*
Disallow: /*?order=*
Disallow: /*?dir=*
Disallow: /*?limit=*
Disallow: /*?utm_*
Disallow: /*?fbclid=*
Disallow: /*?gclid=*

Sitemap: ${SUPABASE_URL}/storage/v1/object/public/make-1d6e33e0-sitemaps/sitemap_index.xml
Sitemap: ${SUPABASE_URL}/functions/v1/make-server-1d6e33e0/seo/sitemap.xml
Sitemap: ${SUPABASE_URL}/functions/v1/make-server-1d6e33e0/seo/fora_de_catalogo.xml
`;
  return c.text(robots, 200, {
    'Content-Type': 'text/plain',
    'Cache-Control': 'public, max-age=86400',
  });
});

// ─── SITEMAP.XML ─────────────────────────────────────────────────────────────
app.get('/sitemap.xml', async (c) => {
  try {
    // 1. Tentar buscar do MeiliSearch (mais rápido e paginado)
    let products: any[] = [];
    let modelosFacet: Record<string, number> = {};
    
    if (meili.isConfigured()) {
      try {
        const result = await meili.search('', {
            limit: 10000,
            // @ts-ignore
            attributesToRetrieve: ['sku', 'name', 'updated_at', 'image_url']
        });
        products = result.hits || [];

        // Also get modelos facet for model landing pages
        const facetResult = await meili.search('', {
          limit: 0,
          filter: ['in_stock = true'],
          facets: ['modelos'],
        });
        modelosFacet = facetResult.facetDistribution?.modelos || {};
      } catch (e) {
        console.error('MeiliSearch sitemap failed, falling back to KV:', e);
      }
    }

    // 2. Fallback para KV Store (se Meili falhar ou vazio)
    if (products.length === 0) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      
      const { data } = await supabase
        .from('kv_store_1d6e33e0')
        .select('value')
        .like('key', 'product:%')
        .limit(1000);
        
      products = data?.map((d: any) => d.value) || [];
    }

    // 3. Gerar URLs de produtos
    const productUrlsXml = products.map((p) => {
      const slug = slugify(p.name || '');
      const urlKey = p.url_key || slug;
      const lastMod = p.updated_at ? p.updated_at.split('T')[0] : new Date().toISOString().split('T')[0];
      
      return `
  <url>
    <loc>${SITE_URL}/produto/${p.sku}/${urlKey}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
    ${p.image_url ? `
    <image:image>
      <image:loc>${p.image_url}</image:loc>
      <image:title>${p.name?.replace(/&/g, '&amp;')}</image:title>
    </image:image>` : ''}
  </url>`;
    }).join('');

    // 4. Gerar URLs de modelos (/pecas/:modeloSlug)
    const modelUrlsXml = Object.entries(modelosFacet)
      .filter(([name, count]) => (count as number) >= 3 && name && name !== 'undefined')
      .map(([name]) => {
        const modelSlug = slugify(name);
        return `
  <url>
    <loc>${SITE_URL}/pecas/${modelSlug}</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;
      }).join('');

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${SITE_URL}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${SITE_URL}/pecas</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
${modelUrlsXml}
${productUrlsXml}
</urlset>`;

    return c.body(sitemap, 200, {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600'
    });
  } catch (e: any) {
    return c.text(`Error generating sitemap: ${e.message}`, 500);
  }
});

// ─── SOCIAL SHARE PROXY (WhatsApp/Facebook) ──────────────────────────────────
// Endpoint para ser usado quando se compartilha links.
// Uso: https://.../seo/share/:sku
// O frontend deve redirecionar bots para cá ou o usuário usa este link.
app.get('/share/:sku', async (c) => {
  const sku = c.req.param('sku');
  const userAgent = c.req.header('user-agent') || '';
  const isBot = /facebookexternalhit|whatsapp|twitterbot|linkedinbot|googlebot/i.test(userAgent);
  
  // Buscar produto
  let product: any = null;
  
  // Tentar KV direto (mais rápido para single item)
  try {
     const data = await kv.get(`product:${sku}`);
     product = data;
  } catch (e) {
     console.error('KV fetch failed:', e);
  }

  if (!product) {
      return c.html('<h1>Produto não encontrado</h1>', 404);
  }

  const title = product.seo_title || product.name;
  const description = product.meta_description || product.short_description || `Compre ${product.name} na Toyoparts.`;
  const image = product.image_url || 'https://www.toyoparts.com.br/logo.png';
  const price = product.special_price || product.price;
  const url = `${SITE_URL}/produto/${sku}/${product.url_key || slugify(product.name)}`;

  // Se NÃO for bot, redireciona para a página real (SPA)
  if (!isBot && !c.req.query('debug')) {
      return c.redirect(url, 301);
  }

  // Se FOR bot, renderiza HTML estático com Meta Tags
  return c.html(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <meta name="description" content="${description}">
    
    <!-- Open Graph / Facebook / WhatsApp -->
    <meta property="og:type" content="product" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:width" content="800" />
    <meta property="og:image:height" content="600" />
    <meta property="og:url" content="${url}" />
    <meta property="og:site_name" content="Toyoparts" />
    <meta property="og:locale" content="pt_BR" />
    
    <!-- Price for Rich Snippets in Social -->
    <meta property="product:price:amount" content="${price}" />
    <meta property="product:price:currency" content="BRL" />
    
    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${image}" />
</head>
<body>
    <h1>${title}</h1>
    <img src="${image}" alt="${title}" style="max-width: 500px;" />
    <p>${description}</p>
    <p>Preço: R$ ${price}</p>
    <a href="${url}">Ver no site</a>
</body>
</html>
  `);
});

// ─── PRODUCT JSON API (for Frontend PDP) ─────────────────────────────────────
// This endpoint is used by the ProductDetailPage component to fetch product data.
// It retrieves the product from the KV store using the SKU.
app.get('/product/:sku', async (c) => {
  const sku = c.req.param('sku');
  try {
    const decodedSku = decodeURIComponent(sku);
    const product = await kv.get(`product:${decodedSku}`);
    
    if (!product) {
      return c.json({ error: 'Product not found' }, 404);
    }

    // ─── METADATA TRANSLATION ───
    // Translate IDs to Labels for frontend display
    try {
      const meta = await kv.get('meili:sync:meta');
      if (meta) {
        // Modelo
        if (product.modelo) {
          const modeloId = String(product.modelo);
          if (meta.modelos?.[modeloId]) {
            product.modelo_label = meta.modelos[modeloId];
          }
        }
        
        // Anos (CSV)
        if (product.ano) {
          const anoIds = String(product.ano).split(',').map(s => s.trim()).filter(Boolean);
          const labels = anoIds.map(id => meta.anos?.[id] || id);
          product.ano_labels = labels.join(', ');
        }

        // Color
        if (product.color) {
          const colorId = String(product.color);
          if (meta.colors?.[colorId]) {
            product.color_label = meta.colors[colorId];
          }
        }
      }
    } catch (metaErr) {
      console.warn('[SEO] Failed to translate metadata:', metaErr);
    }
    
    return c.json(product);
  } catch (e: any) {
    console.error(`[SEO] Error fetching product ${sku}:`, e);
    return c.json({ error: e.message }, 500);
  }
});

// ─── SITEMAP FOR OUT-OF-CATALOG PRODUCTS (Inactive or Out of Stock) ──────────
app.get('/fora_de_catalogo.xml', async (c) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let allProducts: any[] = [];
    let from = 0;
    const limit = 1000;
    let hasMore = true;
    
    // Safety limit to prevent timeout/memory issues in Edge Function
    const MAX_SCAN = 20000; 

    while (hasMore && from < MAX_SCAN) {
      const { data, error } = await supabase
        .from('kv_store_1d6e33e0')
        .select('value')
        .like('key', 'product:%')
        .range(from, from + limit - 1);

      if (error) {
        console.error('[SEO] Error scanning KV for inactive sitemap:', error);
        break;
      }
      
      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }

      const batch = data.map((d: any) => d.value);
      
      // Filter: Inactive (status != 1) OR Out of Stock (!in_stock)
      const inactiveOrOos = batch.filter((p: any) => {
        // Safe check for properties
        const status = p.status;
        const inStock = p.in_stock;
        
        // Logic: Keep if status is NOT 1 (active) OR in_stock is false/falsy
        return status !== 1 || !inStock;
      });
      
      allProducts.push(...inactiveOrOos);

      if (data.length < limit) hasMore = false;
      from += limit;
    }

    const xmlUrls = allProducts.map((p) => {
      const slug = slugify(p.name || '');
      const urlKey = p.url_key || slug;
      // Default to today if no updated_at
      const lastMod = p.updated_at ? p.updated_at.split('T')[0] : new Date().toISOString().split('T')[0];
      
      return `
  <url>
    <loc>${SITE_URL}/produto/${p.sku}/${urlKey}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
    ${p.image_url ? `
    <image:image>
      <image:loc>${p.image_url}</image:loc>
      <image:title>${(p.name || 'Produto').replace(/&/g, '&amp;')}</image:title>
    </image:image>` : ''}
  </url>`;
    }).join('');

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${xmlUrls}
</urlset>`;

    return c.body(sitemap, 200, {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600'
    });

  } catch (e: any) {
    return c.text(`Error generating inactive sitemap: ${e.message}`, 500);
  }
});

export const seo = app;