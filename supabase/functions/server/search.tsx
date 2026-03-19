import { Hono } from 'npm:hono';
import * as meili from './meilisearch.tsx';
import * as kv from './kv_store.tsx';
import * as aiSearch from './ai-search.tsx';

const app = new Hono();

app.get('/meta', async (c) => {
  try {
    const meta = await kv.get('meili:sync:meta');
    return c.json(meta || {});
  } catch (err: any) {
    console.error('Meta API error:', err);
    return c.json({ error: err.message }, 500);
  }
});

app.get('/', async (c) => {
  try {
    const q = c.req.query('q') || '';
    const limit = parseInt(c.req.query('limit') || '24');
    const offset = parseInt(c.req.query('offset') || '0');
    const mode = c.req.query('mode') || 'instant';
    
    const sortParam = c.req.query('sort');
    const sort = sortParam ? [sortParam] : undefined;
    
    // Filters — status = 1 (apenas ativos) sempre aplicado na busca pública
    const filters: string[] = ['status = 1'];
    
    // ─── Manual Filters from Query Params ────────────────────────────────────
    const manualFilters: Record<string, string[]> = {};

    const inStock = c.req.query('inStock');
    if (inStock === 'true') {
      filters.push('in_stock = true');
      manualFilters.in_stock = ['true'];
    } else if (inStock === 'false') {
      filters.push('in_stock = false');
      manualFilters.in_stock = ['false'];
    }

    const categories = c.req.query('categories');
    if (categories) {
      const catIds = categories.split(',').map(s => s.trim()).filter(Boolean);
      manualFilters.categories = catIds;
      if (catIds.length === 1) {
        filters.push(`category_ids = "${catIds[0]}"`);
      } else if (catIds.length > 1) {
        filters.push(`category_ids IN [${catIds.map(id => `"${id}"`).join(',')}]`);
      }
    }

    const categoryNames = c.req.query('category_names');
    if (categoryNames) {
      const catNames = categoryNames.split(',').map(s => s.trim()).filter(Boolean);
      manualFilters.category_names = catNames;
      if (catNames.length === 1) {
        filters.push(`category_names = "${catNames[0]}"`);
      } else if (catNames.length > 1) {
        filters.push(`category_names IN [${catNames.map(n => `"${n}"`).join(',')}]`);
      }
    }

    const modelos = c.req.query('modelos');
    if (modelos) {
      const vals = modelos.split(',').map(s => s.trim()).filter(Boolean);
      manualFilters.modelos = vals;
      if (vals.length === 1) {
        filters.push(`modelos = "${vals[0]}"`);
      } else if (vals.length > 1) {
        filters.push(`modelos IN [${vals.map(v => `"${v}"`).join(',')}]`);
      }
    }

    const anos = c.req.query('anos');
    if (anos) {
      const vals = anos.split(',').map(s => s.trim()).filter(Boolean);
      manualFilters.anos = vals;
      if (vals.length === 1) {
        filters.push(`anos = "${vals[0]}"`);
      } else if (vals.length > 1) {
        filters.push(`anos IN [${vals.map(v => `"${v}"`).join(',')}]`);
      }
    }

    const color = c.req.query('color');
    if (color) {
      const vals = color.split(',').map(s => s.trim()).filter(Boolean);
      manualFilters.color = vals;
      if (vals.length === 1) {
        filters.push(`color = "${vals[0]}"`);
      } else if (vals.length > 1) {
        filters.push(`color IN [${vals.map(v => `"${v}"`).join(',')}]`);
      }
    }

    const minPrice = c.req.query('minPrice');
    if (minPrice) filters.push(`price >= ${parseFloat(minPrice)}`);
    const maxPrice = c.req.query('maxPrice');
    if (maxPrice) filters.push(`price <= ${parseFloat(maxPrice)}`);

    const rawFilter = c.req.query('filter');
    if (rawFilter) filters.push(rawFilter);

    // ─── AI SEARCH MODE ──────────────────────────────────────────────────────
    let aiExpansion: any = null;

    if (mode === 'ai' && q.trim().length >= 3) {
      try {
        // 1. Get Meta from KV for grounding
        const meta = await kv.get('meili:sync:meta') || {};
        const context: aiSearch.SearchSchemaContext = {
          allowedModels: Object.values(meta.modelos || {}),
          allowedYears: Object.values(meta.anos || {}),
          allowedCategories: Object.values(meta.categories || {}),
          filterableAttributes: ['category_ids', 'category_names', 'modelos', 'anos', 'color', 'price', 'in_stock'],
        };

        // 2. Expand Query
        const aiResult = await aiSearch.expandQueryToFilters(q, context);
        
        // 3. Inject AI filters IF they don't conflict with manual ones
        // Manual filters always win (Sovereign)
        const applied: Record<string, string[]> = {};
        const conflicts: Record<string, { ai: string[]; manual: string[] }> = {};
        const ignored: string[] = [];

        if (aiResult.confidence >= 0.65) {
          // Categories
          if (aiResult.filters.categories?.length) {
            const manualCats = manualFilters.category_names || manualFilters.categories || [];
            if (manualCats.length > 0) {
              conflicts.categories = { ai: aiResult.filters.categories, manual: manualCats };
            } else {
              applied.categories = aiResult.filters.categories;
              const vals = aiResult.filters.categories;
              if (vals.length === 1) filters.push(`category_names = "${vals[0]}"`);
              else filters.push(`category_names IN [${vals.map(v => `"${v}"`).join(',')}]`);
            }
          }

          // Modelos
          if (aiResult.filters.modelos?.length) {
            if (manualFilters.modelos?.length) {
              conflicts.modelos = { ai: aiResult.filters.modelos, manual: manualFilters.modelos };
            } else {
              applied.modelos = aiResult.filters.modelos;
              const vals = aiResult.filters.modelos;
              if (vals.length === 1) filters.push(`modelos = "${vals[0]}"`);
              else filters.push(`modelos IN [${vals.map(v => `"${v}"`).join(',')}]`);
            }
          }

          // Anos
          if (aiResult.filters.anos?.length) {
            if (manualFilters.anos?.length) {
              conflicts.anos = { ai: aiResult.filters.anos, manual: manualFilters.anos };
            } else {
              applied.anos = aiResult.filters.anos;
              const vals = aiResult.filters.anos;
              if (vals.length === 1) filters.push(`anos = "${vals[0]}"`);
              else filters.push(`anos IN [${vals.map(v => `"${v}"`).join(',')}]`);
            }
          }
        }

        aiExpansion = {
          ...aiResult,
          meta: {
            applied,
            conflicts,
            ignored
          }
        };
      } catch (err) {
        console.warn('[AI Search] Failed to expand query:', err);
      }
    }

    console.log(`[search] q="${q}" filters=${JSON.stringify(filters)} sort=${sortParam || '(none)'} limit=${limit} offset=${offset}`);

    const result = await meili.search(q, {
      limit,
      offset,
      sort,
      filter: filters,
      facets: ['category_ids', 'category_names', 'modelos', 'anos', 'color', 'in_stock', 'price'] 
    });

    // Normalize Meilisearch response
    const normalized = {
      ...result,
      totalHits: result.totalHits ?? result.estimatedTotalHits ?? 0,
      mode,
      aiExpansion,
    };

    return c.json(normalized);
  } catch (err: any) {
    console.error('Search API error:', err);
    return c.json({ error: err.message }, 500);
  }
});

export const search = app;
