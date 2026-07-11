const SITEMAP_ORIGIN = 'https://hkxjnykrnhjtkkabgece.supabase.co/storage/v1/object/public/make-1d6e33e0-sitemaps';

const ALLOWED_SITEMAP_FILES = /^(sitemap_index|sitemap_static|sitemap_(?:products|categories|filters|out_of_stock)(?:_[0-9]+)?)\.xml$/;

function normalizeSitemapFile(rawFile) {
  const joined = Array.isArray(rawFile) ? rawFile[0] : String(rawFile || '');
  const fileName = joined.trim().replace(/^\/+/, '');
  return ALLOWED_SITEMAP_FILES.test(fileName) ? fileName : null;
}

function setSitemapHeaders(res, upstreamResponse) {
  const etag = upstreamResponse.headers.get('etag');
  const lastModified = upstreamResponse.headers.get('last-modified');

  if (etag) res.setHeader('ETag', etag);
  if (lastModified) res.setHeader('Last-Modified', lastModified);

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  // Sitemap generation replaces these objects in place. Keep the CDN window
  // short so Google does not receive a superseded URL set for hours.
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
}

export default async function handler(req, res) {
  const fileName = normalizeSitemapFile(req.query?.file);

  if (!fileName) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.status(404).send('Sitemap not found');
    return;
  }

  const upstreamResponse = await fetch(`${SITEMAP_ORIGIN}/${fileName}`, {
    headers: {
      accept: 'application/xml,text/xml,*/*',
      'user-agent': req.headers['user-agent'] || 'ToyopartsSitemapProxy/1.0',
    },
  });

  if (!upstreamResponse.ok) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    res.status(upstreamResponse.status).send('Sitemap not found');
    return;
  }

  setSitemapHeaders(res, upstreamResponse);

  const body = Buffer.from(await upstreamResponse.arrayBuffer());
  res.status(200).send(body);
}
