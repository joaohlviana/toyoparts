// ─── MeiliSearch Integration Helper ──────────────────────────────────────────
// Provides MeiliSearch client functions for indexing and searching products.
// Gracefully handles missing configuration (returns nulls/errors).

const MEILI_HOST = (Deno.env.get('MEILISEARCH_HOST') || '').trim().replace(/\/$/, '');
const MEILI_KEY = (Deno.env.get('MEILISEARCH_API_KEY') || '').trim();
const INDEX_UID = 'toyoparts';

// ─── Configuration Check ─────────────────────────────────────────────────────

export function isConfigured(): boolean {
  const configured = MEILI_HOST.length > 0 && MEILI_KEY.length > 0;
  if (!configured) {
    console.log(`⚠️ MeiliSearch check failed: HOST=${MEILI_HOST ? 'OK' : 'MISSING'}, KEY=${MEILI_KEY ? 'OK' : 'MISSING'}`);
  }
  return configured;
}

export function getConfig() {
  return {
    configured: isConfigured(),
    host: MEILI_HOST ? `${MEILI_HOST.slice(0, 30)}...` : '(not set)',
    keyPreview: MEILI_KEY ? `${MEILI_KEY.slice(0, 6)}...` : '(not set)',
    indexUid: INDEX_UID,
    missing_host: !MEILI_HOST,
    missing_key: !MEILI_KEY,
  };
}

// ─── MeiliSearch HTTP Client ─────────────────────────────────────────────────

export async function meiliRequest(method: string, path: string, body?: any, timeoutMs = 15000) {
  if (!isConfigured()) {
    throw new Error('MeiliSearch not configured. Set MEILISEARCH_HOST and MEILISEARCH_API_KEY env vars.');
  }

  const url = `${MEILI_HOST}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${MEILI_KEY}`,
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch {}

  if (!res.ok) {
    const errMsg = json?.message || text.slice(0, 300);
    throw new Error(`MeiliSearch ${method} ${path} failed: HTTP ${res.status} — ${errMsg}`);
  }

  return json;
}

// ─── Transform Product for MeiliSearch ───────────────────────────────────────

// Sanitiza SKU para ser um document ID válido no MeiliSearch.
// MeiliSearch aceita apenas: [a-zA-Z0-9], hífens (-), underscores (_), max 511 bytes.
// Produtos com SKU tipo "6,23E+11" (Excel BR scientific notation) precisam de limpeza.
export function sanitizeSku(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const str = String(raw).trim();
  if (!str) return null;

  // Remover caracteres inválidos (vírgulas, espaços, pontos, +, etc.)
  // Manter apenas: a-z A-Z 0-9 - _
  const sanitized = str.replace(/[^a-zA-Z0-9\-_]/g, '');

  // Se ficou vazio após sanitização, SKU é irrecuperável
  if (!sanitized) return null;

  // Truncar a 511 bytes (limite MeiliSearch)
  if (sanitized.length > 511) return sanitized.slice(0, 511);

  return sanitized;
}

export function transformProduct(
  product: any,
  maps?: {
    categories?: Map<string, string>;
    modelos?: Map<string, string>;
    anos?: Map<string, string>;
    colors?: Map<string, string>;
    categoryParents?: Map<string, string>; // childId → parentId — para normalização hierárquica
  }
) {
  const customAttrs = product.custom_attributes || [];
  const getAttr = (code: string) => customAttrs.find((a: any) => a.attribute_code === code)?.value;

  // Stock
  let inStock = false;
  const stockData = product.extension_attributes?.stock;
  if (stockData) {
    try {
      const stock = typeof stockData === 'string' ? JSON.parse(stockData) : stockData;
      inStock = stock.is_in_stock === '1' || stock.is_in_stock === true || stock.is_in_stock === 1;
    } catch {}
  }

  // Category IDs — unificar AMBAS as fontes (custom_attributes + extension_attributes)
  const catSet = new Set<string>();
  // Fonte 1: custom_attributes → category_ids (pode ser array ou string CSV)
  const categoryIdsRaw = getAttr('category_ids');
  if (categoryIdsRaw) {
    if (Array.isArray(categoryIdsRaw)) {
      categoryIdsRaw.forEach((id: any) => catSet.add(String(id)));
    } else {
      String(categoryIdsRaw).split(',').map(s => s.trim()).filter(Boolean).forEach(id => catSet.add(id));
    }
  }
  // Fonte 2: extension_attributes → category_links
  const categoryLinks = product.extension_attributes?.category_links;
  if (Array.isArray(categoryLinks)) {
    for (const link of categoryLinks) {
      if (link.category_id != null) catSet.add(String(link.category_id));
    }
  }

  // ─── BEST PRACTICE: Ancestor Expansion ──────────────────────────────────────
  // Garante que TODOS os IDs ancestrais estão presentes em category_ids.
  // Se um produto está na categoria folha "Juntas" (55), filha de "Peças do Motor" (42),
  // o produto também precisa ter [42, 2] para que filtrar por "Peças do Motor" o encontre
  // e o facetDistribution mostre a contagem correta sem necessidade de soma cumulativa.
  if (maps?.categoryParents && maps.categoryParents.size > 0) {
    const originalIds = Array.from(catSet);
    for (const id of originalIds) {
      let current = id;
      // Walk up the tree adding all ancestor IDs
      while (maps.categoryParents.has(current)) {
        const parentId = maps.categoryParents.get(current)!;
        // Stop at root categories (0, 1) — not useful for filtering
        if (parentId === '0' || parentId === '1') break;
        catSet.add(parentId);
        current = parentId;
      }
    }
  }

  const categoryIds = Array.from(catSet);

  // Resolver Nomes das Categorias
  let category_names: string[] = [];
  if (maps?.categories && maps.categories.size > 0) {
    category_names = categoryIds
      .map(id => maps.categories!.get(id))
      .filter((name): name is string => !!name);
  }

  // Modelo (CSV values) -> Map to Names
  const modeloRaw = getAttr('modelo');
  let modelos = modeloRaw ? String(modeloRaw).split(',').map(s => s.trim()).filter(Boolean) : [];
  if (maps?.modelos && maps.modelos.size > 0) {
    modelos = modelos.map(id => maps.modelos!.get(id) || id); // Fallback to ID if not found
  }

  // Ano (CSV values) -> Map to Names
  const anoRaw = getAttr('ano');
  let anos = anoRaw ? String(anoRaw).split(',').map(s => s.trim()).filter(Boolean) : [];
  if (maps?.anos && maps.anos.size > 0) {
    anos = anos.map(id => maps.anos!.get(id) || id);
  }

  // Color -> Map to Name
  const colorRaw = getAttr('color');
  let color = colorRaw ? String(colorRaw) : null;
  if (color && maps?.colors && maps.colors.has(color)) {
    color = maps.colors.get(color)!;
  }

  // Text fields (strip HTML)
  const description = (getAttr('description') || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000);
  const shortDescription = (getAttr('short_description') || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);

  // Special price (preço promocional do Magento)
  const specialPriceRaw = getAttr('special_price');
  const specialPrice = specialPriceRaw ? parseFloat(String(specialPriceRaw)) : null;
  // Validar: special_price só faz sentido se for > 0 e < price regular
  const regularPrice = parseFloat(product.price || '0');
  const validSpecialPrice = (specialPrice && specialPrice > 0 && specialPrice < regularPrice) ? specialPrice : null;

  // Images
  let image_url: string | null = null;
  const MAGENTO_BASE_URL = 'https://www.toyoparts.com.br';
  
  // Try media_gallery_entries first
  if (product.media_gallery_entries && Array.isArray(product.media_gallery_entries)) {
    const mainImage = product.media_gallery_entries.find((m: any) => m.media_type === 'image' && !m.disabled);
    if (mainImage && mainImage.file) {
      image_url = `${MAGENTO_BASE_URL}/pub/media/catalog/product${mainImage.file}`;
    }
  }

  // Fallback to custom_attributes (image)
  if (!image_url) {
    const imageAttr = getAttr('image');
    if (imageAttr && imageAttr !== 'no_selection') {
      image_url = `${MAGENTO_BASE_URL}/pub/media/catalog/product${imageAttr}`;
    }
  }

  return {
    id: sanitizeSku(product.sku),
    sku: product.sku || '',
    _sku_sanitized: sanitizeSku(product.sku) !== product.sku, // flag para debug
    name: product.name || '',
    price: parseFloat(product.price || '0'),
    status: product.status || 0,
    type_id: product.type_id || 'simple',
    in_stock: inStock,
    category_ids: categoryIds,
    category_names,
    modelos,
    anos,
    color,
    image_url,
    description,
    short_description: shortDescription,
    created_at: product.created_at || '',
    updated_at: product.updated_at || '',
    special_price: validSpecialPrice,
    has_image: !!image_url,
    has_promotion: validSpecialPrice != null,
  };
}

// ─── Index Setup ─────────────────────────────────────────────────────────────

// OTIMIZADO: Melhores práticas MeiliSearch para e-commerce automotivo
const MEILI_SETTINGS = {
  // ORDEM IMPORTA: MeiliSearch usa a ordem para o ranking rule "attribute".
  // Campos no topo têm prioridade maior na relevância dos resultados.
  searchableAttributes: [
    'name',              // 1º - Nome do produto (mais importante)
    'sku',               // 2º - Código SKU (busca exata)
    'short_description', // 3º - Descrição curta (resumo relevante)
    'description',       // 4º - Descrição completa (contexto)
    'category_names',    // 5º - Nomes de categorias (menor prioridade)
  ],

  filterableAttributes: [
    'category_ids', 'category_names', 'modelos', 'anos', 'color',
    'price', 'in_stock', 'status', 'type_id',
    'special_price', 'has_image', 'has_promotion',
  ],

  // Apenas atributos realmente usados para ordenação na UI.
  // Cada sortable attribute gera um índice adicional → overhead de memória/indexação.
  sortableAttributes: ['price', 'name', 'created_at'],

  displayedAttributes: ['*'],

  // OTIMIZADO: "exactness" movido para cima para priorizar matches exatos (ex: busca por SKU).
  // Padrão MeiliSearch: words > typo > proximity > attribute > sort > exactness
  // E-commerce: buscas por SKU exato devem ter prioridade máxima.
  rankingRules: ['words', 'typo', 'exactness', 'proximity', 'attribute', 'sort'],

  typoTolerance: {
    enabled: true,
    minWordSizeForTypos: {
      oneTypo: 4,   // Aumentado de 3→4: evita typo em SKUs curtos como "041"
      twoTypos: 7,  // Aumentado de 6→7: mais conservador
    },
    // BEST PRACTICE: Desabilitar typo tolerance em SKU para busca exata.
    // Usuários que digitam "04111-54170" querem exatamente esse produto.
    disableOnAttributes: ['sku'],
  },

  pagination: {
    maxTotalHits: 50000,
  },

  faceting: {
    maxValuesPerFacet: 1000,
  },

  // BEST PRACTICE: Stop words em português para melhorar relevância.
  // "filtro de oleo" → busca por "filtro" + "oleo" (ignora "de").
  stopWords: [
    'de', 'do', 'da', 'dos', 'das', 'o', 'a', 'os', 'as',
    'um', 'uma', 'uns', 'umas', 'e', 'ou', 'em', 'no', 'na',
    'nos', 'nas', 'por', 'para', 'com', 'sem', 'que', 'ao', 'aos',
  ],

  // Sinônimos para peças automotivas — melhora a descoberta de produtos.
  synonyms: {
    'filtro': ['elemento', 'refil'],
    'pastilha': ['disco', 'freio'],
    'oleo': ['lubrificante'],
    'borracha': ['bucha', 'coxim', 'silentblock'],
    'correia': ['cinta', 'belt'],
    'junta': ['vedacao', 'gaxeta', 'seal'],
    'amortecedor': ['suspensao', 'shock'],
    'vela': ['ignição', 'spark plug', 'vela de ignicao'],
    'bomba': ['pump'],
    'radiador': ['arrefecimento'],
    'embreagem': ['clutch'],
    'alternador': ['gerador'],
    'palheta': ['limpador'],
  },
};

export async function setupIndex() {
  console.log('🔧 MeiliSearch: Criando/atualizando index...');

  // Check if index already exists before trying to create (avoids unnecessary failed tasks)
  let indexExists = false;
  try {
    await meiliRequest('GET', `/indexes/${INDEX_UID}`);
    indexExists = true;
    console.log('✅ Index já existe — pulando criação');
  } catch {
    // Index doesn't exist — will create
  }

  let createTaskUid: number | null = null;
  if (!indexExists) {
    try {
      const createTask = await meiliRequest('POST', '/indexes', {
        uid: INDEX_UID,
        primaryKey: 'id',
      });
      createTaskUid = createTask?.taskUid || null;
      console.log(`✅ Index criado, taskUid: ${createTaskUid}`);

      // Wait for index creation before applying settings
      if (createTaskUid != null) {
        const createResult = await waitForTask(createTaskUid, { timeoutMs: 30000 });
        console.log(`✅ Index creation task ${createTaskUid}: ${createResult.status}`);
      }
    } catch (e: any) {
      if (e.message?.includes('already exists') || e.message?.includes('409')) {
        console.log('✅ Index já existe (race condition ok)');
      } else {
        throw e;
      }
    }
  }

  // Apply settings — NÃO espera a task aqui.
  // MeiliSearch processa tasks em FIFO, então settings serão aplicadas
  // ANTES de qualquer documento enviado depois. Esperar aqui bloquearia
  // a Edge Function desnecessariamente (settings em índice com docs pode
  // levar minutos para re-indexar).
  const settingsTask = await meiliRequest('PATCH', `/indexes/${INDEX_UID}/settings`, MEILI_SETTINGS, 30000);
  const settingsTaskUid = settingsTask?.taskUid;
  console.log('✅ Settings enviadas ao MeiliSearch, taskUid:', settingsTaskUid,
    '(tasks processadas em FIFO — docs enviados depois serão processados após settings)');

  return {
    success: true,
    createTaskUid,
    settingsTaskUid,
    _note: 'Tasks são assíncronas e processadas em FIFO. Use GET /tasks/{uid} para verificar status.',
  };
}

// ─── Index Documents ────────────────────────────────────────────────────────

// ORIGINAL: envio sequencial (mantido como fallback)
export async function indexDocuments(documents: any[]) {
  const BATCH_SIZE = 1000;
  const taskUids: number[] = [];

  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    const batch = documents.slice(i, i + BATCH_SIZE);
    const result = await meiliRequest(
      'POST',
      `/indexes/${INDEX_UID}/documents`,
      batch,
      60000,
    );
    if (result?.taskUid) {
      taskUids.push(result.taskUid);
    }
    console.log(`📦 MeiliSearch: Indexed batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} docs), taskUid: ${result?.taskUid}`);
  }

  return { batches: Math.ceil(documents.length / BATCH_SIZE), taskUids, totalDocs: documents.length };
}

// OTIMIZADO: envio paralelo de múltiplos sub-batches de 1000 docs
// Reduz latência de rede enviando N requests HTTP simultaneamente.
// MeiliSearch enfileira internamente (FIFO), então a ordem de processamento é garantida.
export async function indexDocumentsParallel(
  documents: any[],
  concurrency = 3
): Promise<{ batches: number; taskUids: number[]; totalDocs: number; elapsedMs: number }> {
  const BATCH_SIZE = 1000;
  const t0 = Date.now();
  const taskUids: number[] = [];
  const chunks: any[][] = [];

  // Split into 1000-doc chunks
  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    chunks.push(documents.slice(i, i + BATCH_SIZE));
  }

  // Process chunks in parallel waves of `concurrency`
  for (let wave = 0; wave < chunks.length; wave += concurrency) {
    const waveBatches = chunks.slice(wave, wave + concurrency);
    const results = await Promise.all(
      waveBatches.map(async (batch, idx) => {
        const batchNum = wave + idx + 1;
        try {
          const result = await meiliRequest(
            'POST',
            `/indexes/${INDEX_UID}/documents`,
            batch,
            60000,
          );
          return { taskUid: result?.taskUid || null, count: batch.length, batchNum, error: null };
        } catch (err: any) {
          console.error(`❌ Batch ${batchNum} failed: ${err.message}`);
          return { taskUid: null, count: batch.length, batchNum, error: err.message };
        }
      })
    );

    for (const r of results) {
      if (r.taskUid) taskUids.push(r.taskUid);
    }

    const successCount = results.filter(r => !r.error).length;
    const docsInWave = results.reduce((s, r) => s + r.count, 0);
    console.log(`📦 Wave ${Math.floor(wave / concurrency) + 1}: ${successCount}/${waveBatches.length} batches OK (${docsInWave} docs)`);
  }

  return {
    batches: chunks.length,
    taskUids,
    totalDocs: documents.length,
    elapsedMs: Date.now() - t0,
  };
}

// ─── Partial Update Documents (PUT) ──────────────────────────────────────────
// Usa PUT ao invés de POST para merge parcial — atualiza apenas os campos
// enviados, sem sobrescrever o documento inteiro.
// Ideal para atualizar image_url após download sem perder outros campos.

export async function updateDocumentsPartial(documents: any[]): Promise<{ taskUids: number[]; totalDocs: number }> {
  const BATCH_SIZE = 1000;
  const taskUids: number[] = [];

  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    const batch = documents.slice(i, i + BATCH_SIZE);
    const result = await meiliRequest(
      'PUT',
      `/indexes/${INDEX_UID}/documents`,
      batch,
      60000,
    );
    if (result?.taskUid) {
      taskUids.push(result.taskUid);
    }
  }

  return { taskUids, totalDocs: documents.length };
}

// ─── Setup Index (com skip inteligente) ──────────────────────────────────────
// Verifica se as settings ATUAIS já batem com MEILI_SETTINGS.
// Se sim, pula o PATCH que causa re-index de todos os docs.
// Se não, aplica (sem esperar a task terminar — FIFO garante ordem).

export async function setupIndexIfNeeded(): Promise<{
  skipped: boolean;
  settingsTaskUid?: number;
  reason: string;
}> {
  // 1. Verificar se index existe
  let indexExists = false;
  try {
    await meiliRequest('GET', `/indexes/${INDEX_UID}`);
    indexExists = true;
  } catch {
    // Não existe — precisa criar
  }

  if (!indexExists) {
    // Criar e aplicar settings normalmente
    const result = await setupIndex();
    return { skipped: false, settingsTaskUid: result.settingsTaskUid, reason: 'index_created' };
  }

  // 2. Comparar settings atuais com desejadas
  try {
    const current = await meiliRequest('GET', `/indexes/${INDEX_UID}/settings`);

    // Comparação rápida dos campos críticos que causam re-index
    const criticalMatch = (
      JSON.stringify(current.filterableAttributes?.sort()) === JSON.stringify([...MEILI_SETTINGS.filterableAttributes].sort()) &&
      JSON.stringify(current.sortableAttributes?.sort()) === JSON.stringify([...MEILI_SETTINGS.sortableAttributes].sort()) &&
      JSON.stringify(current.searchableAttributes) === JSON.stringify(MEILI_SETTINGS.searchableAttributes)
    );

    if (criticalMatch) {
      console.log('⚡ Settings já estão atualizadas — pulando PATCH (evita re-index desnecessário)');
      return { skipped: true, reason: 'settings_match' };
    }

    console.log('🔄 Settings diferem — aplicando PATCH (causará re-index)');
  } catch (e: any) {
    console.warn('⚠️ Não foi possível comparar settings, aplicando normalmente:', e.message);
  }

  // 3. Aplicar settings (sem esperar task)
  const settingsTask = await meiliRequest('PATCH', `/indexes/${INDEX_UID}/settings`, MEILI_SETTINGS, 30000);
  return { skipped: false, settingsTaskUid: settingsTask?.taskUid, reason: 'settings_updated' };
}

// ─── Check Pending Tasks ─────────────────────────────────────────────────────
// Usa a API de tasks do MeiliSearch para verificar se há tasks pendentes,
// sem precisar polling individual por taskUid.

export async function getPendingTaskCount(): Promise<{ enqueued: number; processing: number; total: number }> {
  try {
    const result = await meiliRequest('GET', `/tasks?indexUids=${INDEX_UID}&statuses=enqueued,processing&limit=0`);
    return {
      enqueued: result.total || 0,
      processing: 0,
      total: result.total || 0,
    };
  } catch {
    return { enqueued: 0, processing: 0, total: 0 };
  }
}

// ─── Wait for all tasks to settle (optimized) ───────────────────────────────
// Em vez de polling por taskUid individual, usa a API de listagem de tasks.
// Muito mais eficiente: 1 request por poll em vez de N.

export async function waitForAllTasks(opts: {
  timeoutMs?: number;
  intervalMs?: number;
  onProgress?: (pending: number) => void;
} = {}): Promise<{ settled: boolean; remainingTasks: number; elapsedMs: number }> {
  const { timeoutMs = 120000, intervalMs = 2000, onProgress } = opts;
  const t0 = Date.now();

  while (Date.now() - t0 < timeoutMs) {
    const pending = await getPendingTaskCount();
    onProgress?.(pending.total);

    if (pending.total === 0) {
      return { settled: true, remainingTasks: 0, elapsedMs: Date.now() - t0 };
    }

    console.log(`⏳ ${pending.total} tasks pendentes no MeiliSearch...`);
    await new Promise(r => setTimeout(r, intervalMs));
  }

  const finalPending = await getPendingTaskCount();
  return { settled: false, remainingTasks: finalPending.total, elapsedMs: Date.now() - t0 };
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface SearchOptions {
  limit?: number;
  offset?: number;
  filter?: string[];
  sort?: string[];
  facets?: string[];
}

export async function search(query: string, options: SearchOptions = {}) {
  const body: Record<string, any> = {
    q: query,
    limit: options.limit || 24,
    offset: options.offset || 0,
    filter: options.filter || [],
    sort: options.sort || [],

    // OTIMIZADO: Apenas os facets usados na sidebar do frontend.
    // Removidos: "status" (sempre filtrado por status=1).
    // category_names incluso para exibir nomes legíveis na sidebar (ao invés de IDs numéricos).
    facets: options.facets || ['category_ids', 'category_names', 'modelos', 'anos', 'color', 'in_stock', 'price'],

    // OTIMIZADO: Retornar APENAS campos necessários para os cards do frontend.
    // Reduz payload ~70% vs retornar tudo (description sozinha = 1000 chars por hit).
    attributesToRetrieve: [
      'id', 'sku', 'name', 'price', 'special_price', 'status', 'in_stock', 'type_id',
      'image_url', 'category_ids', 'category_names', 'modelos', 'anos', 'color',
      'description', 'short_description',  // Usado no modal de detalhe
    ],

    // OTIMIZADO: Highlight apenas nos campos exibidos nos cards.
    // Removido: "description" (não exibido nos cards, só no modal).
    attributesToHighlight: ['name', 'sku'],
    highlightPreTag: '<mark>',
    highlightPostTag: '</mark>',

    // REMOVIDO: showMatchesPosition (não usado no frontend, adiciona ~30-50% ao payload)
    // REMOVIDO: attributesToCrop (não usado no frontend)
  };

  // ─── DIAGNÓSTICO 1.1: Log do payload ANTES de enviar ao MeiliSearch ────────
  console.log('📋 MEILI_SEARCH_PAYLOAD', JSON.stringify({
    q: body.q,
    filter: body.filter,
    facets: body.facets,
    limit: body.limit,
    offset: body.offset,
    sort: body.sort,
  }));

  const result = await meiliRequest('POST', `/indexes/${INDEX_UID}/search`, body, 20000);

  // ─── DIAGNÓSTICO 1.2: Log dos facets DEPOIS de receber do MeiliSearch ──────
  const catFacet = result.facetDistribution?.category_ids || {};
  const catKeys = Object.keys(catFacet);
  console.log('📊 MEILI_FACETS_META', JSON.stringify({
    totalHits: result.estimatedTotalHits || result.totalHits || 0,
    processingTimeMs: result.processingTimeMs,
    facetKeysReturned: Object.keys(result.facetDistribution || {}),
    categoryIdsFacetCount: catKeys.length,
    categoryIdsSample: Object.entries(catFacet).slice(0, 25),
    modelosFacetCount: Object.keys(result.facetDistribution?.modelos || {}).length,
    anosFacetCount: Object.keys(result.facetDistribution?.anos || {}).length,
    colorFacetCount: Object.keys(result.facetDistribution?.color || {}).length,
    inStockFacet: result.facetDistribution?.in_stock || {},
  }));

  // ─── DIAGNÓSTICO 2: Detectar truncamento de facet ──────────────────────────
  // Se category_ids retorna exatamente 100, 200, 500 ou 1000 keys, pode ser truncamento
  if ([100, 200, 500, 1000].includes(catKeys.length)) {
    console.warn(`⚠️ POSSÍVEL TRUNCAMENTO DE FACET: category_ids retornou exatamente ${catKeys.length} valores. Verifique maxValuesPerFacet nas settings do índice.`);
  }

  return result;
}

// ─── Get Single Document (para diagnóstico de ancestor expansion) ────────────

export async function getDocument(documentId: string) {
  return meiliRequest('GET', `/indexes/${INDEX_UID}/documents/${encodeURIComponent(documentId)}`);
}

// ─── Task Status ─────────────────────────────────────────────────────────────

export async function getTaskStatus(taskUid: number) {
  return meiliRequest('GET', `/tasks/${taskUid}`);
}

// ─── CHECKLIST 2.3 / 3: Aguardar task concluir antes de testar ──────────────
// Toda mudança de settings/documentos gera tasks assíncronas no MeiliSearch.
// Sem esperar `succeeded`, testes podem falhar com dados inconsistentes.

export async function waitForTask(
  taskUid: number,
  { timeoutMs = 60000, intervalMs = 500 } = {}
): Promise<{ status: string; duration: string; error?: any }> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const task = await getTaskStatus(taskUid);
    const status = task?.status;
    if (status === 'succeeded') {
      return { status, duration: task.duration || `${Date.now() - t0}ms` };
    }
    if (status === 'failed') {
      console.error(`❌ Task ${taskUid} falhou:`, JSON.stringify(task.error));
      return { status, duration: task.duration || `${Date.now() - t0}ms`, error: task.error };
    }
    // enqueued | processing → aguardar
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return { status: 'timeout', duration: `${Date.now() - t0}ms` };
}

// ─── Batch wait: aguarda múltiplas tasks ─────────────────────────────────────

export async function waitForTasks(
  taskUids: number[],
  opts?: { timeoutMs?: number; intervalMs?: number }
): Promise<{ results: Array<{ taskUid: number; status: string; duration: string; error?: any }>; allSucceeded: boolean }> {
  const results = await Promise.all(
    taskUids.map(async uid => ({ taskUid: uid, ...(await waitForTask(uid, opts)) }))
  );
  return {
    results,
    allSucceeded: results.every(r => r.status === 'succeeded'),
  };
}

// ─── Get Failed Tasks (debug) ────────────────────────────────────────────────

export async function getFailedTasks(limit = 10) {
  return meiliRequest('GET', `/tasks?statuses=failed&indexUids=${INDEX_UID}&limit=${limit}`);
}

// ─── Get Single Task (full details including error) ──────────────────────────

export async function getTask(taskUid: number) {
  return meiliRequest('GET', `/tasks/${taskUid}`);
}

// ─── Index Stats ─────────────────────────────────────────────────────────────

export async function getIndexStats() {
  try {
    const stats = await meiliRequest('GET', `/indexes/${INDEX_UID}/stats`);
    return stats;
  } catch {
    return null;
  }
}

// ─── Health Check ────────────────────────────────────────────────────────────

export async function healthCheck() {
  try {
    const result = await meiliRequest('GET', '/health');
    return { ok: true, ...result };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// ─── Delete All Documents ────────────────────────────────────────────────────

export async function deleteAllDocuments() {
  return meiliRequest('DELETE', `/indexes/${INDEX_UID}/documents`);
}

// ─── Embedder Management ─────────────────────────────────────────────────────
// PROBLEMA: Se um embedder está configurado no MeiliSearch (ex: via dashboard),
// ele tenta chamar um serviço externo para CADA documento indexado.
// Se o serviço retorna 403, o batch INTEIRO falha → indexação "trava".
// Solução: remover embedders que estão causando problemas.

export async function getEmbedders(): Promise<Record<string, any> | null> {
  try {
    const settings = await meiliRequest('GET', `/indexes/${INDEX_UID}/settings`);
    return settings?.embedders || null;
  } catch {
    return null;
  }
}

export async function removeAllEmbedders(): Promise<{ taskUid: number | null; previousEmbedders: any }> {
  const current = await getEmbedders();
  if (!current || Object.keys(current).length === 0) {
    console.log('✅ Nenhum embedder configurado — nada a remover');
    return { taskUid: null, previousEmbedders: current };
  }

  console.log(`🗑️ Removendo ${Object.keys(current).length} embedder(s):`, Object.keys(current).join(', '));

  // MeiliSearch: DELETE /indexes/{uid}/settings/embedders reseta para default (nenhum)
  const result = await meiliRequest('DELETE', `/indexes/${INDEX_UID}/settings/embedders`, undefined, 30000);
  const taskUid = result?.taskUid || null;

  console.log(`✅ Embedders removidos, taskUid: ${taskUid}`);
  return { taskUid, previousEmbedders: current };
}

// ─── Search Schema for AI Grounding ──────────────────────────────────────────
// Fetches the actual facet values from the index so the AI only picks valid ones.
// Uses an empty search (q="") to get full facetDistribution.
// Cached in-memory for 10 minutes.

let _schemaCache: { data: any; ts: number } | null = null;
const SCHEMA_CACHE_TTL = 600000; // 10 minutes

export async function getSearchSchema(): Promise<{
  allowedModels: string[];
  allowedYears: string[];
  allowedCategories: string[];
  filterableAttributes: string[];
}> {
  // Return cache if fresh
  if (_schemaCache && Date.now() - _schemaCache.ts < SCHEMA_CACHE_TTL) {
    return _schemaCache.data;
  }

  if (!isConfigured()) {
    return { allowedModels: [], allowedYears: [], allowedCategories: [], filterableAttributes: [] };
  }

  try {
    // Empty search with facets to get ALL facet values
    const result = await meiliRequest('POST', `/indexes/${INDEX_UID}/search`, {
      q: '',
      limit: 0,      // don't need hits, only facets
      facets: ['modelos', 'anos', 'category_names'],
    }, 15000);

    const fd = result.facetDistribution || {};

    // Extract values sorted by count (most common first)
    const sortByCount = (facetMap: Record<string, number>) =>
      Object.entries(facetMap)
        .sort((a, b) => b[1] - a[1])
        .map(([name]) => name);

    const schema = {
      allowedModels: sortByCount(fd.modelos || {}),
      allowedYears: sortByCount(fd.anos || {}),
      allowedCategories: sortByCount(fd.category_names || {}),
      filterableAttributes: MEILI_SETTINGS.filterableAttributes,
    };

    // Cache it
    _schemaCache = { data: schema, ts: Date.now() };

    console.log(`[SCHEMA] Loaded: ${schema.allowedModels.length} models, ${schema.allowedYears.length} years, ${schema.allowedCategories.length} categories`);

    return schema;
  } catch (err: any) {
    console.error(`[SCHEMA] Failed to fetch search schema: ${err.message}`);
    // Return empty (AI will work without grounding — just won't extract filters)
    return { allowedModels: [], allowedYears: [], allowedCategories: [], filterableAttributes: [] };
  }
}