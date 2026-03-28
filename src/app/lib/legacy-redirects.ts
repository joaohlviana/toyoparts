import legacyRedirectUrlsRaw from '../../imports/legacy-301-urls.txt?raw';
import { slugify } from '../seo-config';

export interface LegacyRedirectSeed {
  url: string;
  pathname: string;
  sku: string | null;
  reason: string | null;
}

export interface LegacyRedirectResolved extends LegacyRedirectSeed {
  productName: string;
  slug: string;
  destination: string;
}

export interface LegacyRedirectPending extends LegacyRedirectSeed {
  reason: string;
}

export interface LegacyProductLookup {
  sku: string;
  name: string;
  url_key?: string | null;
}

const EXPLICIT_SKU_PATTERNS = [
  /(?:^|[-/])cod-([a-z0-9]{6,})/i,
  /(?:^|[-/])(pv[a-z0-9]{6,})$/i,
  /(?:^|[-/])(pc[a-z0-9]{6,})$/i,
  /(?:^|[-/])(ph[a-z0-9]{6,})$/i,
  /(?:^|[-/])(pw[a-z0-9]{6,})$/i,
  /(?:^|[-/])(pz[a-z0-9]{6,})$/i,
  /(?:^|[-/])(p[hzvcw][a-z0-9]{6,})/i,
];

function isYearToken(token: string) {
  if (!/^\d{4}$/.test(token)) return false;
  const year = Number(token);
  return year >= 1900 && year <= 2099;
}

function isSkuToken(token: string) {
  if (token.length < 6) return false;
  if (!/[0-9]/.test(token)) return false;
  if (isYearToken(token)) return false;
  if (!/^[a-z0-9]+$/i.test(token)) return false;
  return true;
}

export function extractLegacySku(pathname: string) {
  const normalizedPath = pathname.toLowerCase().replace(/\/+$/, '');

  for (const pattern of EXPLICIT_SKU_PATTERNS) {
    const match = normalizedPath.match(pattern);
    if (match?.[1]) {
      return {
        sku: match[1].toUpperCase(),
        reason: null,
      };
    }
  }

  const tokens = normalizedPath.split(/[^a-z0-9]+/i).filter(Boolean);
  const candidates = tokens.filter(isSkuToken);

  if (candidates.length === 0) {
    return { sku: null, reason: 'sem SKU identificavel' };
  }

  const preferred =
    [...candidates].reverse().find((token) => /[a-z]/i.test(token)) ??
    candidates[candidates.length - 1];

  return {
    sku: preferred.toUpperCase(),
    reason: null,
  };
}

export function loadLegacyRedirectSeeds(): LegacyRedirectSeed[] {
  return legacyRedirectUrlsRaw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((url) => {
      try {
        const parsed = new URL(url);
        const { sku, reason } = extractLegacySku(parsed.pathname);
        return {
          url,
          pathname: parsed.pathname,
          sku,
          reason,
        };
      } catch {
        return {
          url,
          pathname: '/',
          sku: null,
          reason: 'URL invalida',
        };
      }
    });
}

export function buildResolvedRedirect(seed: LegacyRedirectSeed, product: LegacyProductLookup): LegacyRedirectResolved {
  const canonicalSlug = product.url_key?.trim() || slugify(product.name);
  const sku = product.sku.trim().toUpperCase();

  return {
    ...seed,
    sku,
    productName: product.name,
    slug: canonicalSlug,
    destination: `/produto/${encodeURIComponent(sku)}/${canonicalSlug}`,
  };
}

export function buildPendingRedirect(seed: LegacyRedirectSeed, reason?: string): LegacyRedirectPending {
  return {
    ...seed,
    reason: reason || seed.reason || 'produto nao encontrado',
  };
}

export function formatVercelRedirectsSection(redirects: LegacyRedirectResolved[]) {
  return JSON.stringify(
    {
      redirects: redirects.map((redirect) => ({
        source: redirect.pathname,
        destination: redirect.destination,
        permanent: true,
      })),
    },
    null,
    2
  );
}

export function formatPendingRedirectsCsv(items: LegacyRedirectPending[]) {
  const header = ['url_antiga', 'path_antigo', 'sku_extraido', 'motivo'];
  const rows = items.map((item) => [item.url, item.pathname, item.sku ?? '', item.reason]);

  return [header, ...rows]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}
