// Rede de Pecas Toyota + Enriquecimento IA
import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';
import { fetchMagento } from './magento.tsx';

const app = new Hono();

const PRODUCT_PREFIX = 'product:';
const CAT_URL = () => (Deno.env.get('CATALOGO_DB_URL') || '').trim();
const CAT_KEY = () => (Deno.env.get('CATALOGO_DB_API_KEY') || '').trim();
const OPENAI_KEY = () => (Deno.env.get('OPENAI_API_KEY') || '').trim();

// ── Fetch generico PostgREST ────────────────────────────────────────────────
async function queryToyota(table: string, params: Record<string, string> = {}) {
  const url = new globalThis.URL(`${CAT_URL()}/rest/v1/${table}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { 'apikey': CAT_KEY(), 'Authorization': `Bearer ${CAT_KEY()}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

// Lookup cods (column name has slash)
async function queryCodsIn(codes: string[]) {
  if (!codes.length) return [];
  const inList = codes.map(c => `"${c}"`).join(',');
  const url = `${CAT_URL()}/rest/v1/banco_toyoparts_cods?select=*&"models/mod"=in.(${inList})`;
  const res = await fetch(url, {
    headers: { 'apikey': CAT_KEY(), 'Authorization': `Bearer ${CAT_KEY()}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) { console.error(`[cods] ${res.status}`); return []; }
  return res.json();
}

// Processa COMPATIBILIDADE
function processCompat(raw: string): string[] {
  if (!raw) return [];
  const codes = raw.split(',').map(c => c.trim()).filter(Boolean);
  return [...new Set(codes.map(c => c.length > 5 ? c.slice(0, -5) : c))];
}

// Magento custom attribute helper
function getAttr(product: any, code: string): any {
  return product?.custom_attributes?.find((a: any) => a.attribute_code === code)?.value;
}

// Build category ID → name + path map from KV tree
async function loadCategoryMap(): Promise<{ map: Map<string, { name: string; path: string }>; debug: any }> {
  const map = new Map<string, { name: string; path: string }>();
  const debug: any = { source: 'none', treeFound: false, mapSize: 0 };
  
  try {
    // Try 1: Direct KV get
    let tree: any = null;
    try {
      tree = await kv.get('meta:category_tree');
      debug.kvGetResult = tree ? 'object' : 'null';
      debug.kvGetType = typeof tree;
      if (tree) {
        debug.treeFound = true;
        debug.treeIsArray = Array.isArray(tree);
        debug.treeHasId = tree?.id != null;
        debug.treeHasName = !!tree?.name;
        debug.treeHasChildrenData = Array.isArray(tree?.children_data);
        debug.treeHasChildren = Array.isArray(tree?.children);
        debug.treeKeys = Object.keys(tree).slice(0, 8);
        if (tree.children_data?.length > 0) {
          const first = tree.children_data[0];
          debug.firstChildKeys = Object.keys(first || {}).slice(0, 8);
          debug.firstChildName = first?.name;
          debug.firstChildId = first?.id;
        }
      }
    } catch (e: any) {
      debug.kvGetError = e.message;
    }

    // Try 2: Fallback — fetch from Magento REST API if KV is empty
    if (!tree) {
      try {
        console.log('[loadCategoryMap] KV empty, fetching from Magento /V1/categories...');
        tree = await fetchMagento('/V1/categories');
        debug.source = 'magento_fallback';
        if (tree) {
          debug.treeFound = true;
          // Cache it in KV for next time
          await kv.set('meta:category_tree', tree);
          console.log('[loadCategoryMap] Cached Magento category tree in KV');
        }
      } catch (e: any) {
        debug.magentoFallbackError = e.message;
        console.error('[loadCategoryMap] Magento fallback failed:', e.message);
      }
    }

    if (!tree) {
      debug.source = debug.source || 'empty';
      return { map, debug };
    }

    const walk = (node: any, parentPath: string) => {
      if (!node || node.id == null) return;
      const name = node.name || '';
      const path = parentPath ? `${parentPath} > ${name}` : name;
      if (name) {
        map.set(String(node.id), { name, path });
      }
      const children = node.children_data || node.children || [];
      if (Array.isArray(children)) {
        for (const child of children) {
          walk(child, path);
        }
      }
    };

    if (Array.isArray(tree)) {
      tree.forEach((t: any) => walk(t, ''));
      debug.source = debug.source || 'array';
    } else {
      walk(tree, '');
      debug.source = debug.source || 'object';
    }
    
    debug.mapSize = map.size;
    debug.sampleEntries = [...map.entries()].slice(0, 5).map(([k, v]) => ({ id: k, name: v.name }));
    console.log('[loadCategoryMap] Result:', JSON.stringify(debug));
  } catch (e: any) {
    debug.error = e.message;
    console.error('[loadCategoryMap] Fatal error:', e.message, e.stack);
  }
  return { map, debug };
}

// Buscar produto Toyota por partno (com fallback)
async function findToyota(partno: string) {
  let rows = await queryToyota('banco_toyoparts', { select: '*', partno: `eq.${partno}`, limit: '1' });
  if (!rows.length) {
    const norm = partno.replace(/[-\s]/g, '');
    if (norm !== partno) rows = await queryToyota('banco_toyoparts', { select: '*', partno: `eq.${norm}`, limit: '1' });
  }
  if (!rows.length) {
    const norm = partno.replace(/[-\s]/g, '');
    rows = await queryToyota('banco_toyoparts', { select: '*', partno: `ilike.*${norm}*`, limit: '3' });
  }
  return rows[0] || null;
}

// ── GET /ping ──
app.get('/ping', (c) => c.json({ ok: true, ts: new Date().toISOString() }));

// ── GET /diagnostico ──
app.get('/diagnostico', async (c) => {
  try {
    const main = await queryToyota('banco_toyoparts', { select: '*', limit: '2' });
    const cods = await queryToyota('banco_toyoparts_cods', { select: '*', limit: '2' });
    return c.json({
      ok: true,
      banco_toyoparts: { rows: main.length, cols: main[0] ? Object.keys(main[0]) : [] },
      banco_toyoparts_cods: { rows: cods.length, cols: cods[0] ? Object.keys(cods[0]) : [] },
    });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message }, 500);
  }
});

// ── GET /buscar?partno=XXX ──
app.get('/buscar', async (c) => {
  const partno = (c.req.query('partno') || '').trim();
  if (!partno) return c.json({ found: false, error: 'partno obrigatorio' }, 400);
  try {
    const product = await findToyota(partno);
    if (!product) return c.json({ found: false, partno, message: 'Nao encontrado' });

    const rawCompat = product.COMPATIBILIDADE || product.compatibilidade || '';
    const codes = processCompat(rawCompat);
    const compatibilidades: { codigo: string; descricao: string }[] = [];

    if (codes.length > 0) {
      const cods = await queryCodsIn(codes);
      const seen = new Set<string>();
      for (const row of cods) {
        const desc = row['models/description'] || '';
        if (desc && !seen.has(desc)) {
          seen.add(desc);
          compatibilidades.push({ codigo: row['models/mod'] || '', descricao: desc });
        }
      }
    }

    return c.json({
      found: true, partno: product.partno, product,
      compatibilidade_raw: rawCompat, compatibilidade_codes: codes,
      compatibilidades, total_compatibilidades: compatibilidades.length,
    });
  } catch (e: any) {
    console.error('[Catalogo] buscar:', e.message);
    return c.json({ found: false, error: e.message }, 500);
  }
});

// ── POST /interpretar ──
app.post('/interpretar', async (c) => {
  try {
    const { descricao } = await c.req.json();
    if (!descricao) return c.json({ error: 'Campo "descricao" obrigatorio' }, 400);
    if (!OPENAI_KEY()) return c.json({ error: 'OPENAI_API_KEY nao configurada' }, 500);

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY()}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Voce e um especialista em autopecas Toyota. Gere conteudo tecnico e comercial para e-commerce.' },
          { role: 'user', content: `Analise e crie Titulo H1, Descricao (2 paragrafos) e Bullet Points:\n${descricao}` },
        ],
        temperature: 0.5,
      }),
    });
    if (!res.ok) return c.json({ error: `OpenAI ${res.status}: ${await res.text()}` }, 502);
    const json = await res.json();
    return c.json({ interpretacao: json.choices?.[0]?.message?.content || 'Sem resposta' });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ENRIQUECIMENTO IA — /comparar, /enriquecer-ia, /analise-lote
// ═══════════════════════════════════════════════════════════════════════════════

// ── POST /comparar ──────────────────────────────────────────────────────────
app.post('/comparar', async (c) => {
  try {
    const { sku } = await c.req.json();
    if (!sku) return c.json({ error: 'SKU obrigatorio' }, 400);

    // 1. Buscar Magento (KV)
    const mag = await kv.get(`${PRODUCT_PREFIX}${sku}`);
    if (!mag) return c.json({ error: `SKU "${sku}" nao encontrado no Magento (KV)` }, 404);

    // 2. Buscar Toyota
    let toyota: any = { found: false };
    try {
      const tp = await findToyota(sku);
      if (tp) {
        const rawCompat = tp.COMPATIBILIDADE || tp.compatibilidade || '';
        const codes = processCompat(rawCompat);
        const cods = await queryCodsIn(codes);

        const compatModels: any[] = [];
        const compatLines: string[] = [];
        const seen = new Set<string>();
        for (const row of cods) {
          const desc = row['models/description'] || '';
          const mod = row['models/mod'] || '';
          if (desc) compatLines.push(desc);
          if (desc && !seen.has(desc)) {
            seen.add(desc);
            compatModels.push({
              codigo: mod, descricao: desc,
              modelo: desc.split(' ')[0] || '',
              anos: [], trim: '', cambio: '', motor: '',
            });
          }
        }

        toyota = {
          found: true,
          cat: tp.cat || '',
          categoria: tp.category || tp.categoria || '',
          subcategoria: tp.subCategory || tp.subcategoria || '',
          description: tp.description || '',
          seo_title: tp.description ? `${tp.description} - Peça Genuína Toyota ${sku}` : '',
          weight: tp.weight || null,
          publicPrice: tp.price_price || null,
          compat_lines: compatLines,
          compat_models: compatModels,
        };
      }
    } catch (e: any) {
      console.error('[comparar] Toyota lookup error:', e.message);
    }

    // 3. Extrair dados Magento
    const description = getAttr(mag, 'description') || mag.description || '';
    const shortDesc = getAttr(mag, 'short_description') || '';
    const modelo = getAttr(mag, 'modelo') || null;
    const modeloLabel = getAttr(mag, 'modelo_label') || modelo;
    const ano = getAttr(mag, 'ano') || null;
    const anoLabels = getAttr(mag, 'ano_labels') || ano;
    const catIds = extractCategoryIds(mag);
    const imageCount = mag.media_gallery_entries?.length || 0;

    // 3b. Resolver nomes de categorias da arvore KV
    const { map: catMap, debug } = await loadCategoryMap();
    const categoryNames = catIds.map(id => {
      const entry = catMap.get(id);
      return { id, name: entry?.name || `Cat ${id}`, path: entry?.path || `Cat ${id}` };
    });

    const magento = {
      sku: mag.sku || sku,
      name: mag.name || '',
      price: mag.price || 0,
      weight: mag.weight || null,
      status: mag.status || 0,
      description,
      short_description: shortDesc,
      modelo, modelo_label: modeloLabel,
      ano, ano_labels: anoLabels,
      category_ids: catIds,
      category_names: categoryNames,
      image_count: imageCount,
    };

    // 4. Quality score (simple)
    const breakdown: Record<string, any> = {};
    let totalScore = 0, totalMax = 0;

    // naming
    const nameScore = mag.name ? (mag.name.length > 20 ? 20 : 10) : 0;
    breakdown.naming = { score: nameScore, max: 20, issues: mag.name ? (mag.name.length <= 20 ? ['Nome muito curto'] : []) : ['Sem nome'] };
    totalScore += nameScore; totalMax += 20;

    // category
    const catScore = catIds.length > 0 ? 20 : 0;
    breakdown.category = { score: catScore, max: 20, issues: catIds.length === 0 ? ['Sem categorias'] : [] };
    totalScore += catScore; totalMax += 20;

    // compatibility
    const compatScore = toyota.found && toyota.compat_lines?.length > 0 ? 20 : toyota.found ? 10 : 0;
    breakdown.compatibility = { score: compatScore, max: 20, issues: !toyota.found ? ['Sem match Toyota'] : toyota.compat_lines?.length === 0 ? ['Sem linhas de compatibilidade'] : [] };
    totalScore += compatScore; totalMax += 20;

    // description
    const descScore = description.length > 100 ? 20 : description.length > 20 ? 10 : 0;
    breakdown.description = { score: descScore, max: 20, issues: description.length <= 20 ? ['Descricao ausente ou muito curta'] : [] };
    totalScore += descScore; totalMax += 20;

    // images
    const imgScore = imageCount >= 3 ? 20 : imageCount > 0 ? 10 : 0;
    breakdown.images = { score: imgScore, max: 20, issues: imageCount === 0 ? ['Sem imagens'] : imageCount < 3 ? ['Poucas imagens'] : [] };
    totalScore += imgScore; totalMax += 20;

    const quality = { score: totalScore, maxScore: totalMax, breakdown };

    // 5. Suggestions
    const suggestions: any[] = [];
    if (toyota.found && toyota.seo_title && mag.name !== toyota.seo_title) {
      suggestions.push({ field: 'name', current: mag.name, suggested: toyota.seo_title, reason: 'Titulo SEO baseado no catalogo Toyota', priority: 'high' });
    }
    if (toyota.found && toyota.categoria && catIds.length === 0) {
      suggestions.push({ field: 'category', current: 'Nenhuma', suggested: `${toyota.categoria}${toyota.subcategoria ? ' > ' + toyota.subcategoria : ''}`, reason: 'Categoria do catalogo Toyota', priority: 'high' });
    }
    if (description.length < 50 && toyota.found) {
      suggestions.push({ field: 'description', current: description || '(vazia)', suggested: 'Gerar via IA com dados Toyota', reason: 'Descricao pobre impacta SEO e conversao', priority: 'medium' });
    }
    if (!mag.weight && toyota.weight) {
      suggestions.push({ field: 'weight', current: 'Nao informado', suggested: `${toyota.weight} kg`, reason: 'Peso do catalogo Toyota para calculo de frete', priority: 'medium' });
    }
    if (toyota.found && toyota.compat_lines?.length > 0 && !modelo) {
      suggestions.push({ field: 'compatibility', current: 'Vazio', suggested: `${toyota.compat_lines.length} modelos compativeis`, reason: 'Adicionar compatibilidade melhora busca e conversao', priority: 'high' });
    }

    return c.json({ sku, magento, toyota, quality, suggestions, _debug: { categoryMap: debug } });
  } catch (e: any) {
    console.error('[comparar]', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// ── POST /enriquecer-ia ─────────────────────────────────────────────────────
app.post('/enriquecer-ia', async (c) => {
  try {
    const { sku, magento, toyota } = await c.req.json();
    if (!sku) return c.json({ error: 'SKU obrigatorio' }, 400);
    if (!OPENAI_KEY()) return c.json({ error: 'OPENAI_API_KEY nao configurada' }, 500);

    const prompt = `Voce e um especialista em autopecas Toyota para e-commerce.
Gere conteudo SEO otimizado para esta peca. Retorne APENAS um JSON valido sem markdown.

PRODUTO:
SKU: ${sku}
Nome Magento: ${magento?.name || 'N/A'}
Descricao Magento: ${(magento?.description || '').slice(0, 300)}
Categoria Toyota: ${toyota?.categoria || 'N/A'} > ${toyota?.subcategoria || 'N/A'}
Descricao Toyota: ${toyota?.description || 'N/A'}
Compatibilidade: ${toyota?.compat_lines?.slice(0, 5)?.join('; ') || 'N/A'}

RETORNE este JSON exato:
{
  "titulo_seo": "Titulo otimizado para Google",
  "descricao_curta": "Meta description ate 160 chars",
  "descricao_completa": "HTML com paragrafos descritivos tecnicos e comerciais",
  "bullet_points": ["ponto 1", "ponto 2", "ponto 3", "ponto 4"],
  "tags_seo": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "confianca": 0.85
}`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY()}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Retorne APENAS JSON valido. Sem markdown, sem ```json, sem explicacoes.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
      }),
    });

    if (!res.ok) return c.json({ error: `OpenAI ${res.status}: ${await res.text()}` }, 502);

    const aiJson = await res.json();
    const raw = aiJson.choices?.[0]?.message?.content || '';

    // Parse JSON from response (strip markdown if present)
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    let enrichment;
    try {
      enrichment = JSON.parse(cleaned);
    } catch {
      return c.json({ error: 'IA retornou formato invalido', raw: cleaned }, 502);
    }

    return c.json({ enrichment });
  } catch (e: any) {
    console.error('[enriquecer-ia]', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// ── POST /analise-lote ──────────────────────────────────────────────────────
app.post('/analise-lote', async (c) => {
  try {
    const { offset = 0, limit = 30 } = await c.req.json();

    // Get all products from KV
    const allProducts = await kv.getByPrefix(PRODUCT_PREFIX);
    if (!allProducts || allProducts.length === 0) {
      return c.json({ error: 'Nenhum produto no KV' }, 404);
    }

    const totalProducts = allProducts.length;
    const slice = allProducts.slice(offset, offset + limit);

    const products: any[] = [];
    let totalMatched = 0, totalUnmatched = 0;
    let scoreSum = 0;
    const dist = { excellent: 0, good: 0, fair: 0, poor: 0 };

    for (const mag of slice) {
      const sku = mag.sku || '';
      if (!sku) continue;

      let toyotaMatch = false;
      let toyotaCategory: string | null = null;
      let compatCount = 0;

      try {
        const tp = await findToyota(sku);
        if (tp) {
          toyotaMatch = true;
          toyotaCategory = tp.category || tp.categoria || null;
          const rawCompat = tp.COMPATIBILIDADE || tp.compatibilidade || '';
          compatCount = processCompat(rawCompat).length;
        }
      } catch { /* skip */ }

      // Simple quality
      const issues: string[] = [];
      let score = 0;
      const max = 100;

      if (mag.name && mag.name.length > 20) score += 20; else issues.push('Nome fraco');
      const catIds = extractCategoryIds(mag);
      if (catIds.length > 0) score += 20; else issues.push('Sem categoria');
      const desc = getAttr(mag, 'description') || mag.description || '';
      if (desc.length > 100) score += 20; else issues.push('Descricao curta');
      if (toyotaMatch) { score += 20; totalMatched++; } else { issues.push('Sem match Toyota'); totalUnmatched++; }
      const imgs = mag.media_gallery_entries?.length || 0;
      if (imgs >= 3) score += 20; else if (imgs > 0) score += 10; else issues.push('Sem imagens');

      const pct = Math.round((score / max) * 100);
      scoreSum += pct;
      if (pct >= 80) dist.excellent++;
      else if (pct >= 60) dist.good++;
      else if (pct >= 40) dist.fair++;
      else dist.poor++;

      products.push({
        sku, name: mag.name || '', price: mag.price || 0, status: mag.status || 0,
        toyota_match: toyotaMatch, toyota_category: toyotaCategory,
        quality_score: score, quality_max: max, quality_pct: pct,
        issues_count: issues.length, top_issues: issues.slice(0, 3),
      });
    }

    return c.json({
      products,
      total_analyzed: products.length,
      total_products: totalProducts,
      offset,
      has_more: offset + limit < totalProducts,
      stats: {
        total_matched: totalMatched,
        total_unmatched: totalUnmatched,
        avg_quality_pct: products.length > 0 ? Math.round(scoreSum / products.length) : 0,
        distribution: dist,
      },
    });
  } catch (e: any) {
    console.error('[analise-lote]', e.message);
    return c.json({ error: e.message }, 500);
  }
});

// ── Helper: extract category IDs from Magento product ───────────────────────
function extractCategoryIds(product: any): string[] {
  const catSet = new Set<string>();
  const customAttrs = product?.custom_attributes || [];
  const catAttr = customAttrs.find((a: any) => a.attribute_code === 'category_ids');
  if (catAttr?.value) {
    const ids = Array.isArray(catAttr.value) ? catAttr.value : String(catAttr.value).split(',');
    ids.forEach((id: any) => { const s = String(id).trim(); if (s && s !== '1' && s !== '2') catSet.add(s); });
  }
  const catLinks = product?.extension_attributes?.category_links;
  if (Array.isArray(catLinks)) {
    catLinks.forEach((l: any) => { const s = String(l.category_id).trim(); if (s && s !== '1' && s !== '2') catSet.add(s); });
  }
  return [...catSet];
}

export const catalogo = app;