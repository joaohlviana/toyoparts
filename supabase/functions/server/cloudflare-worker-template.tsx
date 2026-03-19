// ─── Cloudflare Worker Template — Crawler-Aware SSG Proxy ────────────────────
// 
// COMO USAR:
// 1. Crie um Worker no Cloudflare Dashboard (Workers & Pages > Create Worker)
// 2. Cole este código (sem as importações Deno — ele roda no Cloudflare)
// 3. Configure as variáveis de ambiente:
//    - SUPABASE_URL: URL do projeto Supabase
//    - SUPABASE_ANON_KEY: chave pública anon do Supabase
//    - ORIGIN_URL: URL de origem do site (SPA) — ex: https://www.toyoparts.com.br
// 4. Configure a rota: toyoparts.com.br/produto/* → este Worker
//
// LÓGICA:
// - Se o User-Agent é um crawler (Googlebot, Bingbot, etc.) → serve HTML estático do SSG
// - Se é um usuário real → faz passthrough para o SPA normalmente
// - Se o snapshot não existe → faz passthrough para o SPA
// - Headers de cache: snapshots têm s-maxage=86400 (CDN cache 24h)
//
// OBSERVAÇÃO: Este arquivo é um TEMPLATE — não é executado pelo servidor Hono.
// Exporte-o e adapte conforme necessário.
// ─────────────────────────────────────────────────────────────────────────────

/*
// ═══ START CLOUDFLARE WORKER CODE ═══

const CRAWLER_USER_AGENTS = [
  'googlebot',
  'bingbot',
  'yandexbot',
  'duckduckbot',
  'baiduspider',
  'slurp',          // Yahoo
  'sogou',
  'exabot',
  'ia_archiver',    // Alexa
  'facebot',        // Facebook
  'facebookexternalhit',
  'twitterbot',
  'rogerbot',       // Moz
  'linkedinbot',
  'embedly',
  'quora link preview',
  'showyoubot',
  'outbrain',
  'pinterest',
  'applebot',
  'semrushbot',
  'ahrefsbot',
  'mj12bot',        // Majestic
  'dotbot',
  'petalbot',       // Huawei
  'bytespider',     // TikTok
  'gptbot',         // OpenAI
  'claudebot',      // Anthropic
  'whatsapp',       // WhatsApp link preview
  'telegrambot',    // Telegram link preview
  'slackbot',       // Slack link preview
  'discordbot',     // Discord link preview
  'viber',
];

function isCrawler(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return CRAWLER_USER_AGENTS.some(bot => ua.includes(bot));
}

function extractSkuFromPath(pathname) {
  // Match /produto/:sku or /produto/:sku/:slug
  const match = pathname.match(/^\/produto\/([^\/]+)/);
  return match ? match[1] : null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const userAgent = request.headers.get('User-Agent') || '';
    
    // Only intercept product pages
    const sku = extractSkuFromPath(url.pathname);
    if (!sku) {
      // Not a product page — passthrough to origin
      return fetch(request);
    }

    // Check if this is a crawler
    if (!isCrawler(userAgent)) {
      // Regular user — passthrough to SPA
      return fetch(request);
    }

    // ─── Crawler detected — serve SSG snapshot ─────────────────────────
    console.log(`[CF Worker] Crawler detected: ${userAgent.slice(0, 50)}... → serving snapshot for ${sku}`);

    try {
      const snapshotUrl = `${env.SUPABASE_URL}/functions/v1/make-server-1d6e33e0/snapshot/product/${sku}`;
      
      const snapshotRes = await fetch(snapshotUrl, {
        headers: {
          'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`,
          'User-Agent': 'Toyoparts-CF-Worker/1.0',
        },
        cf: {
          // Cache the snapshot at the edge for 24h
          cacheTtl: 86400,
          cacheEverything: true,
        },
      });

      if (snapshotRes.ok) {
        const html = await snapshotRes.text();
        
        return new Response(html, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
            'X-Served-By': 'toyoparts-ssg',
            'X-Robots-Tag': 'index, follow',
            // Vary on User-Agent so CDN caches differently for bots vs humans
            'Vary': 'User-Agent',
          },
        });
      }

      // Snapshot not found or error — fall back to SPA
      console.log(`[CF Worker] Snapshot not available (${snapshotRes.status}), falling back to SPA`);
      return fetch(request);
      
    } catch (err) {
      console.error(`[CF Worker] Error fetching snapshot for ${sku}:`, err.message);
      // On any error, fall back to SPA
      return fetch(request);
    }
  },
};

// ═══ END CLOUDFLARE WORKER CODE ═══
*/

// ─── Crawler detection (reusable by server routes) ──────────────────────────

export const CRAWLER_USER_AGENTS = [
  'googlebot', 'bingbot', 'yandexbot', 'duckduckbot', 'baiduspider',
  'slurp', 'sogou', 'exabot', 'ia_archiver',
  'facebot', 'facebookexternalhit', 'twitterbot', 'linkedinbot',
  'embedly', 'pinterest', 'applebot', 'semrushbot', 'ahrefsbot',
  'whatsapp', 'telegrambot', 'slackbot', 'discordbot',
  'gptbot', 'claudebot', 'bytespider', 'petalbot',
];

export function isCrawler(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return CRAWLER_USER_AGENTS.some(bot => ua.includes(bot));
}
