// Dev-Proxy für Cardmarket-Produktbilder.
//
// Cardmarkets S3-CloudFront blockt Cross-Origin-Loads ohne
// Referer: https://www.cardmarket.com/. Der Browser kann den Referer
// aus Cross-Origin-Sicherheitsgründen nicht fälschen (Weg 1 der Recherche
// schlug fehl: opaque Responses haben 0 Bytes). Dieser Dev-Proxy ist Weg 2:
// er läuft auf dem lokalen Dev-Server, holt das Bild serverseitig mit dem
// korrekten Referer und liefert es als same-origin-Response an den Browser.
//
// Aufruf: GET /cardmarket-image-proxy?productId=886394&categoryId=51&setCode=cri
//
// Start: `npm run start:dev:proxy` (kombiniert http-server + diesen Proxy)
//
// ⚠️ Lokaler Test-Modus: hitft beim Entwickeln und Debuggen. In Production
// müsste dieser Proxy durch einen gehosteten Service ersetzt werden
// (z.B. Cloudflare Worker, Vercel Edge Function, etc.), weil GitHub Pages
// keine Server-Endpoints unterstützt.

import { createServer } from 'node:http';
import { URL } from 'node:url';

const PORT = Number(process.env.CARDMARKET_PROXY_PORT || 8090);
const UPSTREAM_HOST = 'product-images.s3.cardmarket.com';
const UPSTREAM_REFERER = 'https://www.cardmarket.com/';
const ALLOW_ORIGIN = process.env.CARDMARKET_PROXY_CORS || '*';
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function buildUpstreamUrl(params) {
  const { productId, categoryId, setCode } = params;
  if (!productId || !categoryId || !setCode) return null;
  return `https://${UPSTREAM_HOST}/${categoryId}/${setCode}/${productId}/${productId}.jpg`;
}

function sendError(res, status, message) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': ALLOW_ORIGIN
  });
  res.end(`Cardmarket dev proxy: ${message}\n`);
}

async function handleImage(req, res, params) {
  const upstreamUrl = buildUpstreamUrl(params);
  if (!upstreamUrl) {
    sendError(res, 400, 'Pflichtparameter fehlen. Erwartet: ?productId=...&categoryId=...&setCode=...');
    return;
  }

  let upstream;
  try {
    upstream = await fetch(upstreamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VeraTcgTracker-DevProxy/1.0)',
        'Referer': UPSTREAM_REFERER,
        'Accept': 'image/avif,image/webp,image/png,image/jpeg,image/*'
      }
    });
  } catch (err) {
    sendError(res, 502, `Upstream fetch failed: ${err?.message || err}`);
    return;
  }

  if (!upstream.ok) {
    sendError(res, upstream.status, `Upstream returned ${upstream.status}`);
    return;
  }

  const body = Buffer.from(await upstream.arrayBuffer());
  const contentType = upstream.headers.get('Content-Type') || 'image/jpeg';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': body.byteLength,
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
    'X-Proxy-Source': 'dev-cardmarket-proxy'
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  // Only handle the proxy path; everything else is a 404.
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': ALLOW_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }
  if (req.method === 'GET' && url.pathname === '/cardmarket-image-proxy') {
    await handleImage(req, res, {
      productId: url.searchParams.get('productId'),
      categoryId: url.searchParams.get('categoryId'),
      setCode: url.searchParams.get('setCode')
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok\n');
    return;
  }
  sendError(res, 404, `Unknown path: ${url.pathname}`);
});

server.listen(PORT, () => {
  console.log(`[dev-cardmarket-proxy] listening on http://localhost:${PORT}`);
  console.log(`[dev-cardmarket-proxy] example: /cardmarket-image-proxy?productId=886394&categoryId=51&setCode=cri`);
});

process.on('SIGINT', () => { server.close(() => process.exit(0)); });
process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
