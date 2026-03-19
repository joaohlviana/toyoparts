import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';
import * as meili from './meilisearch.tsx';
import * as aiSearch from './ai-search.tsx';

const app = new Hono();

// ─── Personalização ──────────────────────────────────────────────────────────

// "Continue onde parou" (Usado na Home e Sidebar)
app.get('/continue/:userId', async (c) => {
  const userId = c.req.param('userId');
  const session = await kv.get(`session:${userId}`);

  if (!session) return c.json({ type: 'cold', items: [] });

  // Pega os últimos 3 itens vistos
  const lastViewed = session.last_viewed?.slice(0, 3) || [];
  
  if (!lastViewed.length) return c.json({ type: 'cold', items: [] });

  // Busca detalhes no Meili (Mget)
  const items = await meili.search('', { filter: [`id IN [${lastViewed.join(',')}]`] });
  
  return c.json({
    type: 'history',
    items: items.hits,
    context: {
      lastSearch: session.last_search,
      lastCategory: session.last_category
    }
  });
});

// "Compre Junto" (Cross-sell na PDP)
app.get('/bundle/:sku', async (c) => {
  const sku = c.req.param('sku');
  
  // 1. Tentar pegar bundle "curado" (definido manualmente no Search Ops)
  const curated = await kv.get(`bundle:${sku}`);
  if (curated) {
    const items = await meili.search('', { filter: [`id IN [${curated.items.join(',')}]`] });
    return c.json({ type: 'curated', title: curated.title, items: items.hits });
  }

  // 2. Se não existir, gerar "smart bundle" baseado em categoria complementar
  // Ex: Se viu amortecedor, sugere kit batente ou bieleta compatível
  
  // Primeiro, pega o produto base
  const baseProductRes = await meili.getDocument(sku);
  const baseProduct = baseProductRes;
  
  if (!baseProduct) return c.json({ items: [] });

  // Lógica simples de "Complementary Categories"
  // Em produção, isso viria de uma tabela de correlação (ex: amortecedor -> kit batente)
  // Aqui vamos simular com busca por modelo compatível
  
  const modelFilter = baseProduct.modelos?.[0] ? `modelos = "${baseProduct.modelos[0]}"` : '';
  const yearFilter = baseProduct.anos?.[0] ? `anos = "${baseProduct.anos[0]}"` : '';
  
  // Busca itens compatíveis, excluindo a própria categoria
  const filters = [
    modelFilter,
    yearFilter,
    `category_ids != "${baseProduct.category_ids?.[0]}"`,
    `price < ${baseProduct.price * 0.6}` // Itens mais baratos (add-on)
  ].filter(Boolean);

  const candidates = await meili.search('', { 
    filter: filters.join(' AND '),
    limit: 2,
    sort: ['popularity:desc', 'price:asc'] // Idealmente ordenado por popularidade
  });

  return c.json({
    type: 'smart_complementary',
    title: `Complete a manutenção do seu ${baseProduct.modelos?.[0] || 'veículo'}`,
    items: candidates.hits
  });
});

// ─── Coupons & Upsell (Carrinho) ─────────────────────────────────────────────

app.post('/cart/optimize', async (c) => {
  const { cartTotal, cartItems, userId } = await c.req.json();
  
  // Lógica de "Smart Coupon"
  // Se faltam < 20% para frete grátis (ex: 300), sugere upsell
  const FREE_SHIPPING_THRESHOLD = 300;
  
  const suggestions = [];
  let coupon = null;

  if (cartTotal < FREE_SHIPPING_THRESHOLD && cartTotal > (FREE_SHIPPING_THRESHOLD * 0.7)) {
    const diff = FREE_SHIPPING_THRESHOLD - cartTotal;
    // Sugerir item barato para bater a meta
    const filler = await meili.search('', {
      filter: [`price <= ${diff * 1.5}`, `price >= ${diff}`],
      limit: 1,
      sort: ['popularity:desc']
    });
    
    if (filler.hits.length) {
      suggestions.push({
        type: 'upsell_shipping',
        message: `Adicione ${filler.hits[0].name} para ganhar Frete Grátis!`,
        item: filler.hits[0]
      });
    }
  }

  // Se for primeira compra (simulado via flag do usuário ou histórico vazio)
  // Poderíamos checar session:{userId} -> history.length
  
  return c.json({
    suggestions,
    coupon
  });
});

export { app as recommendations };
