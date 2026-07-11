import fs from 'node:fs/promises';
import path from 'node:path';

const SITE = 'https://www.toyoparts.com.br';
const SEARCH_API = 'https://hkxjnykrnhjtkkabgece.supabase.co/functions/v1/make-server-1d6e33e0/search';
const root = process.cwd();

function slugify(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function normalizeSource(value) {
  const pathname = /^https?:/i.test(value) ? new URL(value).pathname : value;
  return pathname.startsWith('/') ? pathname.replace(/\/+$/, '') || '/' : `/${pathname}`;
}

async function fetchProductMap() {
  const response = await fetch(`${SITE}/sitemap_products.xml`);
  if (!response.ok) throw new Error(`sitemap_products.xml returned ${response.status}`);
  const xml = await response.text();
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1].replaceAll('&amp;', '&'));
  return new Map(urls.map((url) => {
    const parsed = new URL(url);
    const sku = parsed.pathname.match(/^\/produto\/([^/]+)/)?.[1]?.toUpperCase();
    return [sku, parsed.pathname];
  }).filter(([sku]) => sku));
}

async function searchDestination(source, productMap) {
  const query = source.replace(/^\//, '').replace(/-/g, ' ');
  const url = new URL(SEARCH_API);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '5');
  const response = await fetch(url);
  if (!response.ok) return null;
  const data = await response.json();
  const hit = (data.hits || []).find((item) => item?.sku && item?.name);
  if (!hit) return null;
  return productMap.get(String(hit.sku).toUpperCase()) || `/produto/${encodeURIComponent(hit.sku)}/${hit.url_key || slugify(hit.name)}`;
}

const vercel = JSON.parse(await fs.readFile(path.join(root, 'vercel.json'), 'utf8'));
const redirects = new Map();

for (const route of vercel.routes || []) {
  if (route.status === 301 && route.headers?.Location && !String(route.src).includes('(')) {
    redirects.set(normalizeSource(route.src), route.headers.Location);
  }
}

const aliases = {
  '/politica-de-privacidade': '/privacidade',
  '/politica-de-entrega': '/entrega',
  '/trocas-e-devolucoes': '/troca-devolucoes',
  '/rastreamento': '/rastreamento-correios',
  '/categoria/pecas': '/pecas',
  '/pecas-toyota': '/pecas',
};
for (const [source, destination] of Object.entries(aliases)) redirects.set(source, destination);

const productMap = await fetchProductMap();
const legacyText = await fs.readFile(path.join(root, 'src/imports/legacy-301-urls.txt'), 'utf8');
const legacySources = legacyText.split(/\r?\n/).filter((line) => /^https?:/i.test(line)).map(normalizeSource);

for (const source of legacySources) {
  if (redirects.has(source)) continue;
  const normalized = source.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const skuMatch = [...productMap.keys()].find((sku) => sku.length >= 6 && normalized.includes(sku.replace(/[^A-Z0-9]/g, '')));
  const destination = skuMatch ? productMap.get(skuMatch) : await searchDestination(source, productMap);
  if (destination) redirects.set(source, destination);
}

const output = [...redirects.entries()]
  .filter(([source, destination]) => source !== destination)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([source, destination]) => ({ source, destination, permanent: true }));

await fs.writeFile(path.join(root, 'redirects.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(`Generated ${output.length} permanent redirects (${legacySources.filter((source) => redirects.has(source)).length}/${legacySources.length} legacy URLs covered).`);
