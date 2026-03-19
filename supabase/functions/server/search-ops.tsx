import { Hono } from 'npm:hono';
import * as meili from './meilisearch.tsx';
import * as aiSearch from './ai-search.tsx';
import * as kv from './kv_store.tsx';
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function countProducts(): Promise<number> {
  const { count, error } = await supabase
    .from('kv_store_1d6e33e0')
    .select('*', { count: 'exact', head: true })
    .like('key', 'product:%');
  if (error) throw new Error(`countProducts: ${error.message}`);
  return count ?? 0;
}

const app = new Hono();
const INDEX_UID = 'toyoparts';

// ─── Dashboard Stats ─────────────────────────────────────────────────────────
app.get('/stats', async (c) => {
  try {
    const health = await meili.healthCheck();
    const stats = await meili.getIndexStats();
    
    // Get DB counts
    const productsCount = await countProducts();
    
    return c.json({
      health,
      stats,
      productsCount,
      lastUpdated: new Date().toISOString()
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── Search Lab (Proxy) ──────────────────────────────────────────────────────
app.post('/lab/search', async (c) => {
  try {
    const body = await c.req.json();
    const { q, filter, limit, offset, sort, facets } = body;
    
    // Read merchandising rules to inject (MVP: just read, in future apply)
    const merchRules = await kv.get('meta:merch_rules') || { rules: [], pins: [] };
    
    // Apply pins logic would go here (complex) - for now standard search
    
    const result = await meili.search(q, {
      filter,
      limit,
      offset,
      sort,
      facets
    });
    
    return c.json({
      ...result,
      _merchRulesApplied: merchRules.rules.length
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── AI Analysis ─────────────────────────────────────────────────────────────
app.post('/ai/analyze', async (c) => {
  try {
    const { q } = await c.req.json();
    
    // Fetch facet values to build context
    // Ideally cache this, but for Ops it's fine to fetch fresh
    let context = {
      allowedModels: [] as string[],
      allowedYears: [] as string[],
      allowedCategories: [] as string[],
      filterableAttributes: [] as string[]
    };
    
    try {
      const facets = await meili.search('', { 
        limit: 0, 
        facets: ['modelos', 'anos', 'category_names'] 
      });
      
      if (facets.facetDistribution) {
        context.allowedModels = Object.keys(facets.facetDistribution.modelos || {});
        context.allowedYears = Object.keys(facets.facetDistribution.anos || {});
        context.allowedCategories = Object.keys(facets.facetDistribution.category_names || {});
      }
      
      const settings = await meili.meiliRequest('GET', `/indexes/${INDEX_UID}/settings`);
      context.filterableAttributes = settings.filterableAttributes || [];
    } catch (e) {
      console.error('Failed to fetch context for AI:', e);
    }

    const result = await aiSearch.expandQueryToFilters(q, context);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── Operations: Tasks & Indexes ─────────────────────────────────────────────
app.get('/tasks', async (c) => {
  try {
    const limit = c.req.query('limit') || '20';
    const result = await meili.meiliRequest('GET', `/tasks?indexUids=${INDEX_UID}&limit=${limit}`);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get('/indexes', async (c) => {
  try {
    const result = await meili.meiliRequest('GET', `/indexes`);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── Settings ────────────────────────────────────────────────────────────────
app.get('/settings', async (c) => {
  try {
    const settings = await meili.meiliRequest('GET', `/indexes/${INDEX_UID}/settings`);
    return c.json(settings);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post('/settings', async (c) => {
  try {
    const body = await c.req.json();
    const task = await meili.meiliRequest('PATCH', `/indexes/${INDEX_UID}/settings`, body);
    return c.json(task);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ─── Merchandising ───────────────────────────────────────────────────────────
app.get('/merchandising', async (c) => {
  try {
    const rules = await kv.get('meta:merch_rules') || { pins: [], rules: [] };
    return c.json(rules);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post('/merchandising', async (c) => {
  try {
    const body = await c.req.json();
    await kv.set('meta:merch_rules', body);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post('/repair-index', async (c) => {
  try {
    const result = await meili.setupIndex();
    return c.json({ message: 'Repair initiated', result });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export { app as searchOps };
