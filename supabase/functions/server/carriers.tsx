// ─── Carriers Config — CRUD + Frenet sync + keyword match ──────────────────
// KV key: meta:carriers_config → { carriers: [...], updated_at }

import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';
import { logAuditEvent } from './audit.tsx';

export const carriers = new Hono();

const CARRIERS_KEY = 'meta:carriers_config';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Carrier {
  id: string;
  name: string;
  services: string;       // "PAC, SEDEX, SEDEX 10"
  tracking_url: string;   // must contain {codigo}
  panel_url: string;
  hint: string;
  keywords: string[];     // for fuzzy matching
  active: boolean;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_CARRIERS: Carrier[] = [
  {
    id: 'correios',
    name: 'Correios',
    services: 'PAC, SEDEX, SEDEX 10, SEDEX 12',
    tracking_url: 'https://rastreamento.correios.com.br/app/index.php?objetos={codigo}',
    panel_url: 'https://cas.correios.com.br',
    hint: 'Acesse o SRO/CAS Correios, busque pelo CPF do cliente e copie o código (ex: AA123456789BR).',
    keywords: ['correios', 'pac', 'sedex', 'e-sedex', 'esedex'],
    active: true,
  },
  {
    id: 'jadlog',
    name: 'Jadlog',
    services: '.Package, .Com, .Expresso, .Econômico',
    tracking_url: 'https://www.jadlog.com.br/jadlog/tracking.jad?cte={codigo}',
    panel_url: 'https://www.jadlog.com.br/embarcador',
    hint: 'Acesse o painel Jadlog Embarcador, localize o pedido e copie o CTE de rastreamento.',
    keywords: ['jadlog', '.package', '.com', '.expresso', '.economico', 'econômico'],
    active: true,
  },
  {
    id: 'totalexpress',
    name: 'Total Express',
    services: 'Expresso, Econômico',
    tracking_url: 'https://tracking.totalexpress.com.br/?p={codigo}',
    panel_url: 'https://app.totalexpress.com.br',
    hint: 'Acesse o painel Total Express, localize o pedido e copie o código de rastreio.',
    keywords: ['total express', 'totalexpress', 'total'],
    active: true,
  },
  {
    id: 'azulcargo',
    name: 'Azul Cargo',
    services: 'Expresso, Econômico',
    tracking_url: 'https://www.azulcargo.com.br/rastreamento?codigo={codigo}',
    panel_url: 'https://www.azulcargo.com.br/clientes',
    hint: 'Acesse o portal Azul Cargo e copie o código de rastreio gerado para este pedido.',
    keywords: ['azul cargo', 'azulcargo', 'azul'],
    active: true,
  },
  {
    id: 'sequoia',
    name: 'Sequoia',
    services: 'Expresso',
    tracking_url: 'https://www.sequoialog.com.br/rastreamento?codigo={codigo}',
    panel_url: 'https://www.sequoialog.com.br',
    hint: 'Acesse o portal Sequoia e copie o código de rastreio gerado para este pedido.',
    keywords: ['sequoia'],
    active: true,
  },
];

// ─── Helpers (exported for use in orders.tsx) ─────────────────────────────────

export async function getCarriers(): Promise<Carrier[]> {
  try {
    const stored = await kv.get(CARRIERS_KEY);
    if (stored?.carriers && Array.isArray(stored.carriers)) {
      return stored.carriers;
    }
  } catch (e) {
    console.error('[Carriers] Error reading config:', e);
  }
  return DEFAULT_CARRIERS;
}

// Keyword-based fuzzy match (longest keyword wins = most specific)
export function matchCarrier(list: Carrier[], carrierName: string, serviceName = ''): Carrier | null {
  const combined = `${carrierName} ${serviceName}`.toLowerCase();
  let best: Carrier | null = null;
  let bestScore = 0;
  for (const carrier of list) {
    if (!carrier.active) continue;
    let score = 0;
    for (const kw of carrier.keywords ?? []) {
      if (combined.includes(kw.toLowerCase())) score += kw.length;
    }
    if (score > bestScore) { bestScore = score; best = carrier; }
  }
  return best;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /carriers
carriers.get('/', async (c) => {
  try {
    return c.json({ carriers: await getCarriers() });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// POST /carriers — save full list
carriers.post('/', async (c) => {
  try {
    const { carriers: newList } = await c.req.json();
    if (!Array.isArray(newList)) return c.json({ error: 'carriers deve ser um array' }, 400);

    // Validate: active carriers with tracking_url must contain {codigo}
    for (const cr of newList) {
      if (cr.active && cr.tracking_url && !cr.tracking_url.includes('{codigo}')) {
        return c.json({ error: `Transportadora "${cr.name}": URL de rastreio deve conter {codigo}` }, 400);
      }
    }

    const previous = await getCarriers();
    await kv.set(CARRIERS_KEY, { carriers: newList, updated_at: new Date().toISOString() });
    console.log(`[Carriers] Saved ${newList.length} carriers`);

    // Audit: log carrier config change
    const addedIds   = newList.filter(n => !previous.find((p: Carrier) => p.id === n.id)).map(c => c.id);
    const removedIds = previous.filter((p: Carrier) => !newList.find(n => n.id === p.id)).map((c: Carrier) => c.id);
    const modified   = newList.filter(n => {
      const p = previous.find((p: Carrier) => p.id === n.id);
      return p && JSON.stringify(p) !== JSON.stringify(n);
    }).map(c => c.id);

    await logAuditEvent({
      action:      'carriers.config.updated',
      entity_type: 'carrier_config',
      entity_id:   'all',
      before:      { count: previous.length, ids: previous.map((c: Carrier) => c.id) },
      after:       { count: newList.length, ids: newList.map(c => c.id), added: addedIds, removed: removedIds, modified },
      source:      'admin_ui',
    });

    return c.json({ success: true, carriers: newList });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /carriers/match?name=Correios&service=PAC
carriers.get('/match', async (c) => {
  try {
    const name = c.req.query('name') || '';
    const service = c.req.query('service') || '';
    const list = await getCarriers();
    const matched = matchCarrier(list, name, service);
    return c.json({ matched });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /carriers/frenet-sync — auto-discover new carriers from Frenet account
carriers.get('/frenet-sync', async (c) => {
  try {
    const FRENET_TOKEN = Deno.env.get('FRENET_TOKEN');
    if (!FRENET_TOKEN) return c.json({ error: 'FRENET_TOKEN não configurado' }, 400);

    const res = await fetch('https://api.frenet.com.br/DataProvider/GetAllServices', {
      headers: { 'token': FRENET_TOKEN },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return c.json({ error: `Frenet API: ${res.status}` }, 502);

    const data = await res.json();
    const frenetNames: string[] = [];
    if (Array.isArray(data)) {
      for (const svc of data) {
        const n = svc.Carrier || svc.carrier || svc.CarrierName || svc.carrierName;
        if (n && !frenetNames.includes(n)) frenetNames.push(n);
      }
    }

    const current = await getCarriers();
    const existingNames = current.map(c => c.name.toLowerCase());
    const toAdd: Carrier[] = [];

    for (const name of frenetNames) {
      if (!existingNames.includes(name.toLowerCase())) {
        toAdd.push({
          id: name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_'),
          name,
          services: '',
          tracking_url: '',
          panel_url: '',
          hint: 'Configure a URL de rastreio para esta transportadora.',
          keywords: [name.toLowerCase()],
          active: false, // inactive until configured
        });
      }
    }

    if (toAdd.length > 0) {
      await kv.set(CARRIERS_KEY, { carriers: [...current, ...toAdd], updated_at: new Date().toISOString() });
    }

    return c.json({
      success: true,
      frenet_services: frenetNames,
      added: toAdd.map(c => c.name),
      unchanged: frenetNames.filter(n => existingNames.includes(n.toLowerCase())),
    });
  } catch (err: any) {
    console.error('[Carriers] Frenet sync error:', err);
    return c.json({ error: err.message }, 500);
  }
});