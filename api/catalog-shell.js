const SUPABASE_CATALOG_SHELL_BASE =
  'https://hkxjnykrnhjtkkabgece.supabase.co/functions/v1/make-server-1d6e33e0/catalog/shell';
import fs from 'node:fs';

let cachedStylesheetTag = null;

function normalizeShellPath(rawPath) {
  const joined = Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath || '');
  const trimmed = joined.trim();
  if (!trimmed) return '/';

  let normalized = trimmed;
  if (!normalized.startsWith('/')) normalized = `/${normalized}`;
  normalized = normalized.replace(/\/{2,}/g, '/');
  if (normalized.length > 1) normalized = normalized.replace(/\/+$/, '');
  return normalized || '/';
}

function buildUpstreamUrl(request, shellPath) {
  const upstream = new URL(`${SUPABASE_CATALOG_SHELL_BASE}${shellPath === '/' ? '/' : shellPath}`);

  for (const [key, value] of Object.entries(request.query || {})) {
    if (key === 'path') continue;
    if (Array.isArray(value)) {
      for (const item of value) upstream.searchParams.append(key, item);
      continue;
    }
    if (typeof value === 'string') upstream.searchParams.set(key, value);
  }

  return upstream;
}

function getShellStylesheetTag() {
  if (cachedStylesheetTag !== null) {
    return cachedStylesheetTag;
  }

  try {
    const indexHtmlPath = new URL('../dist/index.html', import.meta.url);
    const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
    const stylesheetMatch = indexHtml.match(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/i);
    cachedStylesheetTag = stylesheetMatch
      ? `<link rel="stylesheet" crossorigin href="${stylesheetMatch[1]}">`
      : '';
  } catch {
    cachedStylesheetTag = '';
  }

  return cachedStylesheetTag;
}

function injectShellStylesheet(html) {
  const stylesheetTag = getShellStylesheetTag();
  if (!stylesheetTag) return html;
  if (html.includes('rel="stylesheet"') && html.includes('/assets/')) return html;
  return html.replace('</head>', `  ${stylesheetTag}\n    </head>`);
}

export default async function handler(req, res) {
  const shellPath = normalizeShellPath(req.query?.path);
  const upstreamUrl = buildUpstreamUrl(req, shellPath);
  const upstreamResponse = await fetch(upstreamUrl.toString(), {
    headers: {
      Accept: 'text/html',
      'User-Agent': 'toyoparts-vercel-catalog-shell-proxy',
    },
  });

  const html = injectShellStylesheet(await upstreamResponse.text());
  const passThroughHeaders = [
    'cache-control',
    'etag',
    'last-modified',
    'x-catalog-version',
  ];

  for (const headerName of passThroughHeaders) {
    const headerValue = upstreamResponse.headers.get(headerName);
    if (headerValue) {
      res.setHeader(headerName, headerValue);
    }
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(upstreamResponse.status).send(html);
}
