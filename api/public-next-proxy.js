const PUBLIC_NEXT_ORIGIN = 'https://toyoparts-public-next-joaohlvianas-projects.vercel.app';

function normalizePublicPath(rawPath) {
  const joined = Array.isArray(rawPath) ? rawPath.join('/') : String(rawPath || '');
  const trimmed = joined.trim();
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/{2,}/g, '/');
}

function buildUpstreamUrl(req, publicPath) {
  const upstream = new URL(publicPath, PUBLIC_NEXT_ORIGIN);
  for (const [key, value] of Object.entries(req.query || {})) {
    if (key === 'path') continue;
    if (Array.isArray(value)) {
      for (const item of value) upstream.searchParams.append(key, item);
    } else if (typeof value === 'string') {
      upstream.searchParams.set(key, value);
    }
  }
  return upstream;
}

function buildForwardHeaders(req) {
  const allowed = ['accept', 'accept-language', 'rsc', 'next-router-prefetch', 'next-router-state-tree', 'next-url', 'purpose', 'user-agent'];
  const headers = {};
  for (const name of allowed) {
    const value = req.headers[name];
    if (value) headers[name] = Array.isArray(value) ? value.join(', ') : value;
  }
  headers.host = new URL(PUBLIC_NEXT_ORIGIN).host;
  return headers;
}

function setResponseHeaders(res, upstreamResponse) {
  for (const name of ['content-type', 'etag', 'last-modified', 'vary']) {
    const value = upstreamResponse.headers.get(name);
    if (value) res.setHeader(name, value);
  }

  if (upstreamResponse.ok) {
    res.setHeader('X-Robots-Tag', 'index, follow, max-image-preview:large');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
  } else if (upstreamResponse.status === 404) {
    res.setHeader('X-Robots-Tag', 'noindex, follow');
    res.setHeader('Cache-Control', 'no-store');
  } else {
    res.setHeader('Retry-After', '60');
    res.setHeader('Cache-Control', 'no-store');
  }
}

function protectNextScriptsFromRocketLoader(res, upstreamResponse, body) {
  const contentType = upstreamResponse.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('text/html')) return body;

  const html = body.toString('utf8').replace(
    /<script(?![^>]*\bdata-cfasync=)/gi,
    '<script data-cfasync="false"',
  );
  res.removeHeader('ETag');
  return Buffer.from(html, 'utf8');
}

export default async function handler(req, res) {
  try {
    const publicPath = normalizePublicPath(req.query?.path);
    const upstreamResponse = await fetch(buildUpstreamUrl(req, publicPath), {
      headers: buildForwardHeaders(req),
      redirect: 'manual',
    });
    setResponseHeaders(res, upstreamResponse);

    const location = upstreamResponse.headers.get('location');
    if (location && upstreamResponse.status >= 300 && upstreamResponse.status < 400) {
      const target = new URL(location, PUBLIC_NEXT_ORIGIN);
      res.setHeader('Location', `${target.pathname}${target.search}`);
    }

    const body = Buffer.from(await upstreamResponse.arrayBuffer());
    res.status(upstreamResponse.status).send(protectNextScriptsFromRocketLoader(res, upstreamResponse, body));
  } catch (error) {
    res.setHeader('Retry-After', '60');
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).send('Serviço temporariamente indisponível.');
  }
}
