const SITE_URL = process.env.TOYOPARTS_SITE_URL || 'https://www.toyoparts.com.br';
const RUNTIME_API = process.env.TOYOPARTS_RUNTIME_API || 'https://hkxjnykrnhjtkkabgece.supabase.co/functions/v1/make-server-1d6e33e0';
const PAGE_SIZE = Number(process.env.TOYOPARTS_AUDIT_PAGE_SIZE || 100);
const MAX_PAGES = Number(process.env.TOYOPARTS_AUDIT_MAX_PAGES || 10);

const VEHICLE_PATTERNS = [
  { slug: 'hilux', label: 'Hilux', aliases: ['hilux'] },
  { slug: 'corolla', label: 'Corolla', aliases: ['corolla'] },
  { slug: 'corolla-cross', label: 'Corolla Cross', aliases: ['corolla cross', 'corolla-cross'] },
  { slug: 'yaris', label: 'Yaris', aliases: ['yaris'] },
  { slug: 'sw4', label: 'SW4', aliases: ['sw4'] },
  { slug: 'etios', label: 'Etios', aliases: ['etios'] },
  { slug: 'rav4', label: 'RAV4', aliases: ['rav4', 'rav 4'] },
  { slug: 'prius', label: 'Prius', aliases: ['prius'] },
];

function detectVehicleSlugs(text) {
  const normalized = String(text || '').toLowerCase();
  return VEHICLE_PATTERNS
    .filter((entry) => entry.aliases.some((alias) => normalized.includes(alias)))
    .map((entry) => entry.slug);
}

function detectYearValues(text) {
  const matches = String(text || '').match(/\b(19|20)\d{2}\b/g) || [];
  return Array.from(new Set(matches));
}

function toStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
}

async function fetchSearchPage(offset) {
  const base = `${RUNTIME_API.replace(/\/+$/, '')}/search`;
  const url = new URL(base);
  url.searchParams.set('q', '');
  url.searchParams.set('limit', String(PAGE_SIZE));
  url.searchParams.set('offset', String(offset));

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while requesting ${url}`);
  }

  return response.json();
}

function formatIssueList(label, issues, formatter) {
  if (issues.length === 0) {
    return `${label}: 0`;
  }

  const samples = issues.slice(0, 10).map(formatter);
  return `${label}: ${issues.length}\n  ${samples.join('\n  ')}`;
}

async function main() {
  const allHits = [];
  let totalHits = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const offset = page * PAGE_SIZE;
    const payload = await fetchSearchPage(offset);
    const hits = Array.isArray(payload?.hits) ? payload.hits : [];
    totalHits = Number(payload?.totalHits || payload?.estimatedTotalHits || totalHits || 0);
    allHits.push(...hits);
    if (hits.length < PAGE_SIZE || allHits.length >= totalHits) break;
  }

  const missingCategoryIds = [];
  const missingCategoryPathIds = [];
  const missingCategoryNames = [];
  const missingModelSlugs = [];
  const missingCompatYears = [];
  const pollutedCompatibility = [];

  for (const hit of allHits) {
    const sku = String(hit?.sku || '').trim();
    const title = String(hit?.name || '').trim();
    const categoryIds = toStringArray(hit?.category_ids);
    const categoryPathIds = toStringArray(hit?.category_path_ids);
    const categoryNames = toStringArray(hit?.category_names);
    const modeloSlugs = toStringArray(hit?.modelo_slugs);
    const compatYears = toStringArray(hit?.compat_years);
    const compatibilityDisplay = toStringArray(hit?.compatibility_display);
    const searchSurface = `${title} ${compatibilityDisplay.join(' ')}`;
    const inferredModels = detectVehicleSlugs(searchSurface);
    const inferredYears = detectYearValues(searchSurface);

    if (categoryIds.length === 0) {
      missingCategoryIds.push({ sku, title });
    }

    if (categoryPathIds.length === 0) {
      missingCategoryPathIds.push({ sku, title });
    }

    if (categoryNames.length === 0) {
      missingCategoryNames.push({ sku, title });
    }

    if (inferredModels.length > 0 && modeloSlugs.length === 0) {
      missingModelSlugs.push({ sku, title, inferredModels });
    }

    if (inferredYears.length > 0 && compatYears.length === 0) {
      missingCompatYears.push({ sku, title, inferredYears });
    }

    if (sku === '040000210L') {
      const invalidYears = compatYears.filter((year) => !['2008', '2009', '2010'].includes(year));
      if (invalidYears.length > 0) {
        pollutedCompatibility.push({ sku, title, invalidYears, compatYears });
      }
    }
  }

  const report = [
    `Catalog runtime audit`,
    `Site: ${SITE_URL}`,
    `Runtime API: ${RUNTIME_API}`,
    `Pages scanned: ${Math.ceil(allHits.length / PAGE_SIZE)}`,
    `Hits scanned: ${allHits.length}${totalHits ? ` of ${totalHits}` : ''}`,
    '',
    formatIssueList('Missing category_ids', missingCategoryIds, (entry) => `${entry.sku} — ${entry.title}`),
    '',
    formatIssueList('Missing category_path_ids', missingCategoryPathIds, (entry) => `${entry.sku} — ${entry.title}`),
    '',
    formatIssueList('Missing category_names', missingCategoryNames, (entry) => `${entry.sku} — ${entry.title}`),
    '',
    formatIssueList('Missing modelo_slugs when title/compatibility implies a vehicle', missingModelSlugs, (entry) => `${entry.sku} — ${entry.title} [${entry.inferredModels.join(', ')}]`),
    '',
    formatIssueList('Missing compat_years when title/compatibility implies years', missingCompatYears, (entry) => `${entry.sku} — ${entry.title} [${entry.inferredYears.join(', ')}]`),
    '',
    formatIssueList('Known polluted compatibility cases', pollutedCompatibility, (entry) => `${entry.sku} — ${entry.title} [invalid: ${entry.invalidYears.join(', ')} | indexed: ${entry.compatYears.join(', ')}]`),
  ].join('\n');

  console.log(report);

  if (
    missingCategoryIds.length > 0
    || missingCategoryPathIds.length > 0
    || missingCategoryNames.length > 0
    || missingModelSlugs.length > 0
    || missingCompatYears.length > 0
    || pollutedCompatibility.length > 0
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[audit-catalog-runtime] failed:', error);
  process.exitCode = 1;
});
