// TARSMusic share-link pages.
//
// Answers https://<Discover address>/s/<song|album|artist|playlist>/<id>, the links
// the app shares. A browser gets a small page with the cover, the name and an
// "Abrir no TARSMusic" button; WhatsApp and Telegram read its preview tags. Android
// checks /.well-known/assetlinks.json so the installed app opens these links itself.
//
// Names and covers come from Navidrome through the Subsonic API, with the account in
// NAVIDROME_USER / NAVIDROME_PASSWORD. No other part of the library is exposed.
'use strict';

const crypto = require('crypto');
const http = require('http');

const PORT = Number(process.env.PORT || 8086);
const HOST = process.env.HOST || '127.0.0.1';
const NAVIDROME_URL = (process.env.NAVIDROME_URL || 'http://127.0.0.1:4533').replace(/\/+$/, '');
const NAVIDROME_USER = process.env.NAVIDROME_USER || '';
const NAVIDROME_PASSWORD = process.env.NAVIDROME_PASSWORD || '';
const ANDROID_PACKAGE = process.env.ANDROID_PACKAGE || 'com.douglas.substreamer.discover';
// Signing certificate of the APKs on GitHub (the Expo template debug keystore).
const ANDROID_CERT_SHA256 =
  process.env.ANDROID_CERT_SHA256 ||
  'FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C';
const DOWNLOAD_URL = process.env.DOWNLOAD_URL || 'https://github.com/5douglas/TARSMusic/releases/latest';
const APP_SCHEME = 'substreamer';

const KINDS = new Set(['song', 'album', 'artist', 'playlist']);
const ID_RE = /^[A-Za-z0-9._-]{1,128}$/;

function subsonicUrl(method, params) {
  const salt = crypto.randomBytes(8).toString('hex');
  const token = crypto.createHash('md5').update(NAVIDROME_PASSWORD + salt).digest('hex');
  const query = new URLSearchParams({
    u: NAVIDROME_USER,
    t: token,
    s: salt,
    v: '1.16.1',
    c: 'tarsmusic-share',
    f: 'json',
    ...params,
  });
  return `${NAVIDROME_URL}/rest/${method}?${query}`;
}

async function subsonic(method, params) {
  const res = await fetch(subsonicUrl(method, params), { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const body = await res.json();
  const r = body && body['subsonic-response'];
  return r && r.status === 'ok' ? r : null;
}

/** { title, subtitle, coverArt, label } for a shared item, or null when Navidrome has none. */
async function lookup(kind, id) {
  if (kind === 'song') {
    const r = await subsonic('getSong', { id });
    const s = r && r.song;
    return s && { title: s.title, subtitle: s.artist || '', coverArt: s.coverArt || s.albumId, label: 'Música' };
  }
  if (kind === 'album') {
    const r = await subsonic('getAlbum', { id });
    const a = r && r.album;
    if (!a) return null;
    const types = (a.releaseTypes || []).map((t) => String(t).toLowerCase());
    const label = types.includes('ep') ? 'EP' : types.includes('single') ? 'Single' : 'Álbum';
    return { title: a.name, subtitle: [a.artist, a.year].filter(Boolean).join(' • '), coverArt: a.coverArt || a.id, label };
  }
  if (kind === 'artist') {
    const r = await subsonic('getArtist', { id });
    const a = r && r.artist;
    return a && { title: a.name, subtitle: '', coverArt: a.coverArt || a.id, label: 'Artista' };
  }
  const r = await subsonic('getPlaylist', { id });
  const p = r && r.playlist;
  // Only public playlists: a private one stays private.
  if (!p || !p.public) return null;
  return { title: p.name, subtitle: p.owner ? `de ${p.owner}` : '', coverArt: p.coverArt || p.id, label: 'Playlist' };
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function publicOrigin(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

function page(req, kind, id, item) {
  const origin = publicOrigin(req);
  const link = `${origin}/s/${kind}/${encodeURIComponent(id)}`;
  const appPath = `s/${kind}/${encodeURIComponent(id)}`;
  const intent =
    `intent://${appPath}#Intent;scheme=${APP_SCHEME};package=${ANDROID_PACKAGE};` +
    `S.browser_fallback_url=${encodeURIComponent(DOWNLOAD_URL)};end`;
  const title = item ? item.title : 'TARSMusic';
  const subtitle = item ? [item.label, item.subtitle].filter(Boolean).join(' • ') : 'Item não encontrado no servidor';
  const cover = item ? `${origin}/s/cover/${kind}/${encodeURIComponent(id)}` : '';
  const e = escapeHtml;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)}${item ? ' | TARSMusic' : ''}</title>
<meta property="og:site_name" content="TARSMusic">
<meta property="og:type" content="${kind === 'song' ? 'music.song' : kind === 'album' ? 'music.album' : 'website'}">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(subtitle)}">
<meta property="og:url" content="${e(link)}">
${cover ? `<meta property="og:image" content="${e(cover)}">\n<meta name="twitter:card" content="summary_large_image">` : ''}
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #fff;
    background: linear-gradient(180deg, #1d3557 0%, #121826 60%); }
  main { width: min(360px, calc(100% - 32px)); text-align: center; padding: 32px 0; }
  img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: ${kind === 'artist' ? '50%' : '8px'};
    box-shadow: 0 12px 40px rgba(0,0,0,.5); background: #1f2937; }
  h1 { font-size: 24px; margin: 24px 0 6px; }
  p { margin: 0 0 28px; color: #b3b3b3; }
  a.btn { display: block; padding: 14px; border-radius: 999px; font-weight: 700; text-decoration: none; margin-top: 12px; }
  a.open { background: #3b82f6; color: #fff; }
  a.get { border: 1px solid #6b7280; color: #fff; }
  small { display: block; margin-top: 24px; color: #6b7280; }
</style>
</head>
<body>
<main>
  ${cover ? `<img src="${e(cover)}" alt="">` : ''}
  <h1>${e(title)}</h1>
  <p>${e(subtitle)}</p>
  <a class="btn open" id="open" href="${e(`${APP_SCHEME}://${appPath}`)}">Abrir no TARSMusic</a>
  <a class="btn get" href="${e(DOWNLOAD_URL)}">Baixar o TARSMusic</a>
  <small>Para ouvir, você precisa de uma conta neste servidor.</small>
</main>
<script>
  if (/Android/i.test(navigator.userAgent)) document.getElementById('open').href = ${JSON.stringify(intent)};
</script>
</body>
</html>`;
}

async function cover(res, kind, id) {
  const item = await lookup(kind, id);
  if (!item || !item.coverArt) {
    res.writeHead(404).end();
    return;
  }
  const upstream = await fetch(subsonicUrl('getCoverArt', { id: item.coverArt, size: '600' }), {
    signal: AbortSignal.timeout(15000),
  });
  const type = upstream.headers.get('content-type') || '';
  if (!upstream.ok || !type.startsWith('image/')) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400' });
  res.end(Buffer.from(await upstream.arrayBuffer()));
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    if (pathname === '/.well-known/assetlinks.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify([
          {
            relation: ['delegate_permission/common.handle_all_urls'],
            target: { namespace: 'android_app', package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: [ANDROID_CERT_SHA256] },
          },
        ]),
      );
      return;
    }
    const coverMatch = /^\/s\/cover\/([a-z]+)\/([^/]+)$/.exec(pathname);
    if (coverMatch && KINDS.has(coverMatch[1])) {
      const id = decodeURIComponent(coverMatch[2]);
      if (!ID_RE.test(id)) return void res.writeHead(404).end();
      await cover(res, coverMatch[1], id);
      return;
    }
    const match = /^\/s\/([a-z]+)\/([^/]+)\/?$/.exec(pathname);
    if (match && KINDS.has(match[1])) {
      const kind = match[1];
      const id = decodeURIComponent(match[2]);
      const item = ID_RE.test(id) ? await lookup(kind, id).catch(() => null) : null;
      res.writeHead(item ? 200 : 404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
      res.end(page(req, kind, id, item));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  } catch (err) {
    console.error('[share]', err && err.message ? err.message : err);
    if (!res.headersSent) res.writeHead(502);
    res.end();
  }
});

if (require.main === module) {
  if (!NAVIDROME_USER || !NAVIDROME_PASSWORD) {
    console.error('NAVIDROME_USER and NAVIDROME_PASSWORD are required');
    process.exit(1);
  }
  server.listen(PORT, HOST, () => console.log(`[share] listening on ${HOST}:${PORT}`));
}

module.exports = { server, lookup, page };
