// ─── AI-Enhanced Search: Filter Extraction (Grounded) ────────────────────────
// Uses OpenAI to extract FILTERS from natural language queries.
// The AI does NOT rewrite the query — MeiliSearch handles relevance.
// The AI ONLY extracts structured filters grounded in the actual index schema.

const OPENAI_API_KEY = (Deno.env.get('OPENAI_API_KEY') || '').trim();

export function isOpenAIConfigured(): boolean {
  return OPENAI_API_KEY.length > 0;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AIQueryResult {
  originalQuery: string;
  keywords: string[];           // conservative: max 3, only from the query itself
  filters: {
    modelos?: string[];
    anos?: string[];
    categories?: string[];
  };
  confidence: number;
  processingTimeMs: number;
  debug?: {
    raw?: string;
    rejectedReasons?: string[];
  };
}

// The schema context fed to the AI so it only picks valid values
export interface SearchSchemaContext {
  allowedModels: string[];       // e.g. ["Hilux","Corolla","SW4",...]
  allowedYears: string[];        // e.g. ["2012","2013",...]
  allowedCategories: string[];   // e.g. ["Suspensão","Freio",...]
  filterableAttributes: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeArrayStrings(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(x => String(x)).map(s => s.trim()).filter(Boolean);
}

/** Case-insensitive intersection: returns items from `a` that exist in `b` */
function intersect(a: string[], b: string[]): string[] {
  const setB = new Set(b.map(x => x.toLowerCase()));
  return a.filter(x => setB.has(x.toLowerCase()));
}

// ─── Main: Extract Filters (Grounded) ────────────────────────────────────────

export async function expandQueryToFilters(
  query: string,
  schema: SearchSchemaContext,
): Promise<AIQueryResult> {
  const t0 = performance.now();

  // Fast fallback if OpenAI not configured
  if (!isOpenAIConfigured()) {
    return {
      originalQuery: query,
      keywords: [],
      filters: {},
      confidence: 0,
      processingTimeMs: 0,
    };
  }

  // Skip very short queries (< 3 chars) — not enough signal for AI
  if (query.trim().length < 3) {
    return {
      originalQuery: query,
      keywords: [],
      filters: {},
      confidence: 0,
      processingTimeMs: 0,
    };
  }

  // Truncate schema lists for token efficiency (GPT-4o-mini context)
  const maxModels = 50;
  const maxYears = 30;
  const maxCategories = 60;

  const modelsStr = schema.allowedModels.slice(0, maxModels).join(', ')
    + (schema.allowedModels.length > maxModels ? ` (e mais ${schema.allowedModels.length - maxModels})` : '');
  const yearsStr = schema.allowedYears.slice(0, maxYears).join(', ')
    + (schema.allowedYears.length > maxYears ? ` (e mais ${schema.allowedYears.length - maxYears})` : '');
  const categoriesStr = schema.allowedCategories.slice(0, maxCategories).join(', ')
    + (schema.allowedCategories.length > maxCategories ? ` (e mais ${schema.allowedCategories.length - maxCategories})` : '');

  const systemPrompt = `Voce e um assistente de busca para pecas Toyota (loja Toyoparts).
Seu trabalho NAO e reescrever a busca. Seu trabalho e APENAS extrair filtros validos
de acordo com o schema abaixo.

SCHEMA (valores permitidos):
- modelos permitidos: ${modelsStr}
- anos permitidos: ${yearsStr}
- categorias permitidas: ${categoriesStr}

Atributos filtraveis no indice: ${schema.filterableAttributes.join(', ')}

REGRAS IMPORTANTES:
- Retorne APENAS JSON valido (sem markdown, sem backticks).
- NAO invente modelos/anos/categorias fora das listas acima.
- Se o valor mencionado pelo usuario nao bate EXATAMENTE com nenhum da lista, NAO inclua.
- keywords: no maximo 3 palavras MUITO relevantes que ja existam na query; se nao tiver, retorne [].
- confidence: 0.0 a 1.0 — use 0.0 se nao tiver certeza.
- Se a query for generica ("filtro", "peca"), retorne filtros vazios e confidence baixa.

Formato exato:
{
  "keywords": [],
  "filters": {
    "modelos": [],
    "anos": [],
    "categories": []
  },
  "confidence": 0.0
}`.trim();

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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query },
        ],
        temperature: 0,       // ZERO creativity — pure extraction
        max_tokens: 250,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const ms = Math.round(performance.now() - t0);

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[AI] OpenAI HTTP ${res.status}: ${errText.slice(0, 300)}`);
      return {
        originalQuery: query,
        keywords: [],
        filters: {},
        confidence: 0,
        processingTimeMs: ms,
      };
    }

    const data = await res.json();
    const raw = String(data.choices?.[0]?.message?.content || '').trim();

    // Parse JSON safely (handle markdown code blocks)
    let parsed: any;
    try {
      const jsonStr = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error(`[AI] Invalid JSON from OpenAI: ${raw.slice(0, 200)}`);
      return {
        originalQuery: query,
        keywords: [],
        filters: {},
        confidence: 0,
        processingTimeMs: ms,
        debug: { raw, rejectedReasons: ['invalid_json'] },
      };
    }

    const rejected: string[] = [];

    // Extract and validate keywords (conservative)
    const keywords = safeArrayStrings(parsed.keywords).slice(0, 3);

    // Validate modelos against schema
    const rawModelos = safeArrayStrings(parsed.filters?.modelos);
    const modelos = intersect(rawModelos, schema.allowedModels);
    if (rawModelos.length > 0 && modelos.length === 0) {
      rejected.push(`modelos_out_of_schema: [${rawModelos.join(',')}]`);
    }

    // Validate anos against schema
    const rawAnos = safeArrayStrings(parsed.filters?.anos);
    const anos = intersect(rawAnos, schema.allowedYears);
    if (rawAnos.length > 0 && anos.length === 0) {
      rejected.push(`anos_out_of_schema: [${rawAnos.join(',')}]`);
    }

    // Validate categories against schema
    const rawCategories = safeArrayStrings(parsed.filters?.categories);
    const categories = intersect(rawCategories, schema.allowedCategories);
    if (rawCategories.length > 0 && categories.length === 0) {
      rejected.push(`categories_out_of_schema: [${rawCategories.join(',')}]`);
    }

    // Confidence: clamp and penalize rejections
    let confidence = Number(parsed.confidence);
    if (!Number.isFinite(confidence)) confidence = 0;
    confidence = Math.max(0, Math.min(1, confidence));

    // If schema rejected any values, cap confidence at 0.4
    if (rejected.length > 0) {
      confidence = Math.min(confidence, 0.4);
    }

    const result: AIQueryResult = {
      originalQuery: query,
      keywords,
      filters: {
        ...(modelos.length ? { modelos } : {}),
        ...(anos.length ? { anos } : {}),
        ...(categories.length ? { categories } : {}),
      },
      confidence,
      processingTimeMs: ms,
    };

    // Only include debug if there were issues
    if (rejected.length > 0) {
      result.debug = { raw, rejectedReasons: rejected };
    }

    const hasFilters = modelos.length + anos.length + categories.length;
    console.log(`[AI] Query "${query}" → confidence=${confidence.toFixed(2)}, filters=${hasFilters}, rejected=${rejected.length}, ${ms}ms`);

    return result;
  } catch (error: any) {
    const ms = Math.round(performance.now() - t0);
    console.error(`[AI] expandQueryToFilters failed: ${error.message}`);

    return {
      originalQuery: query,
      keywords: [],
      filters: {},
      confidence: 0,
      processingTimeMs: ms,
    };
  }
}

// ─── DEPRECATED: Old expandQuery (kept for backward compat of /search/expand) ─

export async function expandQuery(query: string): Promise<{
  originalQuery: string;
  expandedQuery: string;
  keywords: string[];
  filters: { modelos?: string[]; anos?: string[]; categories?: string[] };
  confidence: number;
  processingTimeMs: number;
}> {
  // Redirect to the new grounded implementation
  const result = await expandQueryToFilters(query, {
    allowedModels: [],
    allowedYears: [],
    allowedCategories: [],
    filterableAttributes: [],
  });
  return {
    originalQuery: result.originalQuery,
    expandedQuery: result.originalQuery, // NEVER rewrite the query
    keywords: result.keywords,
    filters: result.filters,
    confidence: result.confidence,
    processingTimeMs: result.processingTimeMs,
  };
}

// ─── Product Recommendations ─────────────────────────────────────────────────

export async function suggestRelated(productName: string, productSku: string): Promise<string[]> {
  if (!isOpenAIConfigured()) return [];

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
          {
            role: 'system',
            content: 'Voce e um especialista em pecas Toyota. Dado um produto, sugira 5 termos de busca para produtos relacionados/complementares. Retorne APENAS um array JSON de strings.',
          },
          {
            role: 'user',
            content: `Produto: ${productName} (SKU: ${productSku})`,
          },
        ],
        temperature: 0.5,
        max_tokens: 150,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '[]';
    const jsonStr = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr);
  } catch {
    return [];
  }
}
