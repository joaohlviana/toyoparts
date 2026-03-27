import { Hono } from 'npm:hono';
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from './kv_store.tsx';
import * as meili from './meilisearch.tsx';

const OPENAI_API_KEY = (Deno.env.get('OPENAI_API_KEY') || '').trim();
const PRODUCT_PREFIX = 'product:';
const HISTORY_PREFIX = 'history:';
const BUCKET_NAME = 'make-1d6e33e0-products';
const MAGENTO_TOKEN = (Deno.env.get('MAGENTO_TOKEN') || '').trim();
const MAGENTO_BASE_URL = 'https://www.toyoparts.com.br';

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Idempotent bucket creation
async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some(b => b.name === BUCKET_NAME)) {
    await supabase.storage.createBucket(BUCKET_NAME, { public: true });
  }
}

function slugifyFilePart(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    || 'produto';
}

export const productAdmin = new Hono();

// Helper to get product by SKU
async function getProduct(sku: string) {
  return await kv.get(`${PRODUCT_PREFIX}${sku}`);
}

// ─── AI Enrichment Logic ─────────────────────────────────────────────────────

async function enrichProductData(product: any) {
  if (!OPENAI_API_KEY) throw new Error("OpenAI API Key not configured");

  const prompt = `Você é o Diretor de Catálogo da Toyoparts, focado em uma experiência de luxo inspirada na Apple para peças genuínas Toyota.
Sua missão é transformar dados técnicos brutos em uma vitrine de precisão e confiança.

PRODUTO ATUAL:
Nome: ${product.name}
SKU: ${product.sku}
Descrição Atual: ${product.description || 'Nenhuma'}
Dados Brutos (Catalog): ${JSON.stringify(product.raw || {}, null, 2)}

DIRETRIZES DE DESIGN E CONTEÚDO:
1. NOME PREMIUM: Remova códigos, siglas e lixo de sistema. Deve ser limpo: "Amortecedor Dianteiro - Corolla (2020-2023)".
2. DESCRIÇÃO NARRATIVA: Escreva como se estivesse descrevendo uma peça de engenharia de alta performance. Use parágrafos curtos, elegantes e focados na "Paz de Espírito" que uma peça genuína traz.
3. BULLET POINTS DE ENGENHARIA: Foque em durabilidade, encaixe perfeito e segurança.
4. ESPECIFICAÇÕES TÉCNICAS: Extraia dados como material, peso, dimensões, lado (se houver), posição e códigos de compatibilidade cruzada.
5. TOM DE VOZ: Autoritário, Minimalista, Sofisticado.

ESTRUTURA DE RETORNO (JSON APENAS):
{
  "name": "Nome Refinado",
  "description": "Texto descritivo longo e elegante",
  "short_description": "Um resumo de impacto em uma frase",
  "specifications": [
    { "label": "Posição", "value": "Dianteira" },
    { "label": "Lado", "value": "Esquerdo (Motorista)" }
  ],
  "compatibility_notes": "Série Corolla 2020+, motores 1.8 e 2.0 Hybrid",
  "seo": {
    "title": "Peça Genuína Toyota | Nome do Produto",
    "description": "Descrição focada em conversão para Google"
  },
  "tags": ["Peças Genuínas", "Suspensão", "Segurança"]
}`;

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Você é um assistente de catálogo de e-commerce.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!res.ok) throw new Error(`OpenAI Error: ${await res.text()}`);
    const data = await res.json();
    const content = data.choices[0].message.content;
    const jsonStr = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error('Enrichment failed:', error);
    throw error;
  }
}

// ─── Metadata Helpers ────────────────────────────────────────────────────────

// Get unique values for a specific field across all products
async function getUniqueMetadata(field: string) {
  const cacheKey = `meta:unique:${field}`;
  const cached = await kv.get(cacheKey);
  if (cached && (Date.now() - new Date(cached.updated_at).getTime() < 3600000)) {
    return cached.values;
  }

  const values = new Set<string>();
  let offset = 0;
  const batchSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('kv_store_1d6e33e0')
      .select('value')
      .like('key', `${PRODUCT_PREFIX}%`)
      .range(offset, offset + batchSize - 1);

    if (error || !data || data.length === 0) break;

    for (const item of data) {
      const prod = item.value;
      
      // Support nested fields (e.g. raw.position)
      let fieldValues;
      if (field.startsWith('raw.')) {
        fieldValues = prod.raw?.[field.split('.')[1]];
      } else {
        fieldValues = prod[field];
      }

      if (Array.isArray(fieldValues)) {
        fieldValues.forEach(v => {
          if (v) values.add(String(v).trim());
        });
      } else if (fieldValues !== undefined && fieldValues !== null) {
        if (typeof fieldValues === 'string') {
          fieldValues.split(',').forEach(v => {
            if (v) values.add(v.trim());
          });
        } else {
          values.add(String(fieldValues));
        }
      }
    }

    if (data.length < batchSize) break;
    offset += batchSize;
  }

  const sortedValues = Array.from(values).sort();
  await kv.set(cacheKey, { values: sortedValues, updated_at: new Date().toISOString() });
  return sortedValues;
}

// ─── Category Tree Sync ─────────────────────────────────────────────────────

async function fetchMagentoCategories() {
  if (!MAGENTO_TOKEN) {
    console.warn('⚠️ MAGENTO_TOKEN missing, cannot fetch categories');
    return [];
  }

  try {
    const res = await fetch(`${MAGENTO_BASE_URL}/rest/V1/categories`, {
      headers: { 'Authorization': `Bearer ${MAGENTO_TOKEN}` }
    });

    if (!res.ok) throw new Error(`Magento API Error: ${res.status}`);
    
    const root = await res.json();
    
    // Transform Magento tree to our simple structure
    const transform = (node: any): any => ({
      id: node.id,
      name: node.name,
      level: node.level,
      is_active: node.is_active !== false,
      children_data: Array.isArray(node.children_data || node.children) 
        ? (node.children_data || node.children).filter((c: any) => c.is_active).map(transform) 
        : []
    });

    // Often ID 1 is Root, ID 2 is Default Category (actual root for store)
    // We usually want the children of Default Category
    const tree = transform(root);
    
    // If root has only one child "Default Category", verify if we should return that instead
    // Usually for end users we want the store categories.
    // Let's return the full tree structure for now, filtering inactive.
    
    return [tree];
  } catch (error) {
    console.error('Failed to fetch Magento categories:', error);
    return fallbackCategories;
  }
}

// Minimal fallback if Magento fails — usa children_data para consistência com o cache
const fallbackCategories = [
  {
    id: 2,
    name: "Default Category",
    children_data: [
      { id: 3, name: "Acessórios", children_data: [
        { id: 33, name: "Acessórios Externos Cromados", children_data: [] },
        { id: 34, name: "Aerofólios, Spoilers e Antenas", children_data: [] },
        { id: 35, name: "Alarme e Segurança", children_data: [] }
      ]},
      { id: 4, name: "Modelos", children_data: [
        { id: 10, name: "Corolla", children_data: [] },
        { id: 11, name: "Hilux", children_data: [] },
        { id: 12, name: "Etios", children_data: [] },
        { id: 13, name: "Yaris", children_data: [] },
        { id: 14, name: "RAV4", children_data: [] }
      ]}
    ]
  }
];

// ─── Routes ──────────────────────────────────────────────────────────────────

// List / search products via Meilisearch (or KV fallback)
productAdmin.get('/', async (c) => {
  const t0 = Date.now();
  try {
    const q = c.req.query('q') || '';
    const limit = Math.min(parseInt(c.req.query('limit') || '24'), 200);
    const offset = parseInt(c.req.query('offset') || '0');
    const sortParam = c.req.query('sort') || '';

    // Build Meilisearch filter array
    const filterParts: string[] = [];

    const status = c.req.query('status');
    if (status) filterParts.push(`status = ${status}`);

    const inStock = c.req.query('inStock');
    if (inStock === 'true') filterParts.push('in_stock = true');
    else if (inStock === 'false') filterParts.push('in_stock = false');

    const categories = c.req.query('categories');
    if (categories) {
      const catIds = categories.split(',').map(s => s.trim()).filter(Boolean);
      if (catIds.length === 1) filterParts.push(`category_ids = "${catIds[0]}"`);
      else if (catIds.length > 1) filterParts.push(`category_ids IN [${catIds.map(id => `"${id}"`).join(',')}]`);
    }

    const modelos = c.req.query('modelos');
    if (modelos) {
      const vals = modelos.split(',').map(s => s.trim()).filter(Boolean);
      if (vals.length === 1) filterParts.push(`modelos = "${vals[0]}"`);
      else if (vals.length > 1) filterParts.push(`modelos IN [${vals.map(v => `"${v}"`).join(',')}]`);
    }

    const anos = c.req.query('anos');
    if (anos) {
      const vals = anos.split(',').map(s => s.trim()).filter(Boolean);
      if (vals.length === 1) filterParts.push(`anos = "${vals[0]}"`);
      else if (vals.length > 1) filterParts.push(`anos IN [${vals.map(v => `"${v}"`).join(',')}]`);
    }

    const minPrice = c.req.query('minPrice');
    if (minPrice) filterParts.push(`price >= ${parseFloat(minPrice)}`);
    const maxPrice = c.req.query('maxPrice');
    if (maxPrice) filterParts.push(`price <= ${parseFloat(maxPrice)}`);

    const typeId = c.req.query('type_id');
    if (typeId) filterParts.push(`type_id = "${typeId}"`);

    const hasPromotion = c.req.query('hasPromotion');
    if (hasPromotion === 'true') filterParts.push('special_price IS NOT NULL');

    const hasImage = c.req.query('hasImage');
    if (hasImage === 'true') filterParts.push('image_url IS NOT NULL');
    else if (hasImage === 'false') filterParts.push('image_url IS NULL');

    // noCategory: produtos sem nenhuma categoria atribuída
    const noCategory = c.req.query('noCategory');
    if (noCategory === 'true') filterParts.push('category_ids IS EMPTY');

    // Build search query — merge column-level name/sku filters into q
    let searchQuery = q;
    const nameFilter = c.req.query('name');
    const skuFilter = c.req.query('sku');
    // Se temos filtro de nome ou sku, adicionamos ao q para full-text search
    if (nameFilter && !searchQuery) searchQuery = nameFilter;
    if (skuFilter && !searchQuery) searchQuery = skuFilter;
    // Se ambos existem, concatena (Meilisearch faz AND implícito)
    if (nameFilter && skuFilter) searchQuery = `${skuFilter} ${nameFilter}`;
    else if (nameFilter && q) searchQuery = `${q} ${nameFilter}`;
    else if (skuFilter && q) searchQuery = `${q} ${skuFilter}`;

    // Build sort
    const sort: string[] = [];
    if (sortParam) {
      const [field, dir] = sortParam.split(':');
      const meiliField = field === 'stock' ? 'in_stock' : field;
      sort.push(`${meiliField}:${dir || 'asc'}`);
    }

    // Try Meilisearch first
    if (meili.isConfigured()) {
      try {
        const result = await meili.search(searchQuery, { limit, offset, filter: filterParts, sort });
        return c.json({
          hits: result.hits || [],
          totalHits: result.estimatedTotalHits || result.totalHits || 0,
          facetDistribution: result.facetDistribution || {},
          processingTimeMs: result.processingTimeMs || (Date.now() - t0),
          limit, offset,
        });
      } catch (meiliErr: any) {
        console.warn('[ProductAdmin] Meilisearch search failed, falling back to KV:', meiliErr.message);
      }
    }

    // KV fallback: scan products from database
    console.log('[ProductAdmin] Using KV fallback for product listing');
    const { data: rows, error } = await supabase.from('kv_store_1d6e33e0')
      .select('value').like('key', `${PRODUCT_PREFIX}%`).order('key')
      .range(offset, offset + limit - 1);
    if (error) throw error;

    const { count } = await supabase.from('kv_store_1d6e33e0')
      .select('*', { count: 'exact', head: true }).like('key', `${PRODUCT_PREFIX}%`);

    const hits = (rows || []).map((r: any) => {
      const p = r.value;
      return {
        id: p.sku || p.id,
        sku: p.sku,
        name: p.name,
        price: p.price,
        special_price: p.special_price || null,
        status: p.status ?? 1,
        type_id: p.type_id || 'simple',
        in_stock: !!(p.extension_attributes?.stock?.is_in_stock),
        category_ids: p.category_ids || [],
        category_names: p.category_names || [],
        modelos: p.modelos || [],
        anos: p.anos || [],
        color: p.color || null,
        image_url: p.image_url || null,
        description: p.description || '',
        short_description: p.short_description || '',
      };
    });

    return c.json({
      hits, totalHits: count || hits.length,
      facetDistribution: {}, processingTimeMs: Date.now() - t0,
      limit, offset, _source: 'kv_fallback',
    });
  } catch (err: any) {
    console.error('[ProductAdmin] List error:', err);
    return c.json({ error: err.message, hits: [], totalHits: 0, facetDistribution: {}, processingTimeMs: Date.now() - t0, limit: 24, offset: 0 }, 500);
  }
});

// Get metadata options for filters/editor
productAdmin.get('/metadata/:field', async (c) => {
  const field = c.req.param('field');
  const values = await getUniqueMetadata(field);
  return c.json(values);
});

// Get category tree
productAdmin.get('/metadata/structure/tree', async (c) => {
  let tree = await kv.get('meta:category_tree');
  
  if (!tree || (Array.isArray(tree) && tree.length === 0)) {
    console.log('Category tree cache miss, fetching from Magento...');
    tree = await fetchMagentoCategories();
    
    // Cache it for 1 hour
    if (tree && tree.length > 0) {
      await kv.set('meta:category_tree', tree);
    }
  }

  // Double check if we still have nothing, use fallback
  if (!tree || (Array.isArray(tree) && tree.length === 0)) {
     console.warn('Returning fallback categories due to empty source');
     tree = fallbackCategories;
  }
  
  return c.json(tree || []);
});

// Get full product data (including raw)
productAdmin.get('/:sku', async (c) => {
  const sku = c.req.param('sku');
  const product = await getProduct(sku);
  if (!product) return c.json({ error: 'Product not found' }, 404);
  return c.json(product);
});

// Update product
productAdmin.patch('/:sku', async (c) => {
  const sku = c.req.param('sku');
  const updates = await c.req.json();
  const existing = await getProduct(sku);
  
  if (!existing) return c.json({ error: 'Product not found' }, 404);

  // Save to history before update
  const historyTimestamp = Date.now();
  await kv.set(`${HISTORY_PREFIX}${sku}:${historyTimestamp}`, {
    ...existing,
    snapshot_at: new Date().toISOString(),
    change_type: updates._is_revert ? 'revert' : (updates._is_ai ? 'ai' : 'manual')
  });

  // Remove internal flags if they exist
  const { _is_revert, _is_ai, ...cleanUpdates } = updates;

  const updatedProduct = {
    ...existing,
    ...cleanUpdates,
    updated_at: new Date().toISOString()
  };

  await kv.set(`${PRODUCT_PREFIX}${sku}`, updatedProduct);
  
  return c.json({ success: true, product: updatedProduct });
});

// Get product history
productAdmin.get('/:sku/history', async (c) => {
  const sku = c.req.param('sku');
  const history = await kv.getByPrefix(`${HISTORY_PREFIX}${sku}:`);
  return c.json(history.sort((a: any, b: any) => 
    new Date(b.snapshot_at).getTime() - new Date(a.snapshot_at).getTime()
  ));
});

// Upload product image
productAdmin.post('/:sku/upload-image', async (c) => {
  const sku = c.req.param('sku');
  const existing = await getProduct(sku);
  if (!existing) return c.json({ error: 'Product not found' }, 404);

  try {
    await ensureBucket();
    const formData = await c.req.parseBody();
    const file = formData['file'] as File;
    if (!file) return c.json({ error: 'No file uploaded' }, 400);

    const productSlug = slugifyFilePart(existing.name || sku);
    const skuSlug = slugifyFilePart(sku);
    const isWebp = file.type === 'image/webp' || file.name.toLowerCase().endsWith('.webp');
    const ext = isWebp ? 'webp' : (file.name.split('.').pop() || 'jpg').toLowerCase();
    const fileName = `${productSlug}-${skuSlug}-${Date.now()}.${ext}`;
    const filePath = `products/${sku}/${fileName}`;

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        contentType: isWebp ? 'image/webp' : file.type,
        upsert: true
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    // Add to gallery and set as main if no image exists
    const mediaEntry = {
      file: publicUrl, 
      label: existing.name || 'Upload Admin',
      position: (existing.media_gallery?.length || 0) + 1,
      media_type: 'image',
      disabled: false
    };

    const updatedMedia = [...(existing.media_gallery || []), mediaEntry];
    const updatedGalleryEntries = [...(existing.media_gallery_entries || []), mediaEntry];

    const updatedProduct = {
      ...existing,
      image_url: existing.image_url || publicUrl,
      media_gallery: updatedMedia,
      media_gallery_entries: updatedGalleryEntries,
      updated_at: new Date().toISOString()
    };

    await kv.set(`${PRODUCT_PREFIX}${sku}`, updatedProduct);

    return c.json({ success: true, url: publicUrl, product: updatedProduct });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Bulk status update
productAdmin.post('/bulk-status', async (c) => {
  const { skus, status } = await c.req.json();
  if (!Array.isArray(skus)) return c.json({ error: 'Invalid SKUs' }, 400);

  const promises = skus.map(async (sku) => {
    const existing = await getProduct(sku);
    if (existing) {
      await kv.set(`${PRODUCT_PREFIX}${sku}`, {
        ...existing,
        status,
        updated_at: new Date().toISOString()
      });
    }
  });

  await Promise.all(promises);
  return c.json({ success: true });
});

// AI Enrichment
productAdmin.post('/:sku/enrich', async (c) => {
  const sku = c.req.param('sku');
  const product = await getProduct(sku);
  
  if (!product) return c.json({ error: 'Product not found' }, 404);

  try {
    const enrichedData = await enrichProductData(product);
    return c.json({ success: true, enrichedData });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});
