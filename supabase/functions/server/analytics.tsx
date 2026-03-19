import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';

const app = new Hono();

// ─── Tracking ────────────────────────────────────────────────────────────────
// Armazena estado volátil da sessão para "Voltar onde parou" e personalização
// Key Pattern: session:{userId}

interface UserSession {
  last_viewed: string[]; // SKUs
  last_search: string | null;
  last_category: string | null;
  cart_intent: string[]; // SKUs no carrinho
  updated_at: string;
}

app.post('/track', async (c) => {
  try {
    const { userId, event, data } = await c.req.json();
    if (!userId) return c.json({ error: 'userId required' }, 400);

    const key = `session:${userId}`;
    const current = (await kv.get(key)) as UserSession || {
      last_viewed: [],
      last_search: null,
      last_category: null,
      cart_intent: [],
      updated_at: new Date().toISOString()
    };

    // Update state based on event
    if (event === 'view_item') {
      // Keep last 10 items, unique
      current.last_viewed = [data.sku, ...current.last_viewed.filter(s => s !== data.sku)].slice(0, 10);
      if (data.category) current.last_category = data.category;
    }
    
    if (event === 'search') {
      current.last_search = data.query;
    }

    if (event === 'add_to_cart') {
      current.cart_intent = [...new Set([...current.cart_intent, data.sku])];
    }
    
    if (event === 'remove_from_cart') {
      current.cart_intent = current.cart_intent.filter(s => s !== data.sku);
    }

    current.updated_at = new Date().toISOString();
    
    // Fire & Forget save (don't await strictly if performance is key, but here we await for safety)
    await kv.set(key, current);

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.get('/session/:userId', async (c) => {
  const userId = c.req.param('userId');
  const session = await kv.get(`session:${userId}`);
  return c.json(session || {});
});

export { app as analytics };
