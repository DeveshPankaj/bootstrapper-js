// Verifies TODO 1A.3 (audit KRN-7, decisions.md D11): every /(sw)/ and /cache/ response from
// src/sw.ts carries `Content-Security-Policy: sandbox allow-scripts allow-forms allow-modals`,
// `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin` and a real
// Content-Type (default application/octet-stream); the only exemption is an iframe navigation
// to a page under /opt/apps (normalised path); top-level navigations are always sandboxed;
// network fallbacks are wrapped the same way; Cache Storage is never consulted.
// Run: node testing/scripts/security/verify-kernel-sw-headers.mjs   (OS dev server on :8080)
import { launch, bootOS, addFrame, check, finish, sleep, pollFor, OS_URL } from './verify-kernel-lib.mjs';

const PROBE = (label) => `<!doctype html><html><head><meta charset="utf-8"><title>${label}</title></head><body>${label}<script>
  window.__r = { origin: self.origin };
  try { localStorage.length; window.__r.localStorage = 'ALLOWED'; } catch (e) { window.__r.localStorage = 'BLOCKED ' + e.name; }
  try { indexedDB.open('kh-probe'); window.__r.indexedDB = 'ALLOWED'; } catch (e) { window.__r.indexedDB = 'BLOCKED ' + e.name; }
  try { window.__r.parentDoc = parent === window ? 'top-level' : 'ALLOWED ' + typeof parent.document.title; } catch (e) { window.__r.parentDoc = 'BLOCKED ' + e.name; }
</script></body></html>`;

const EXT_TYPES = {
  'x.html': 'text/html', 'x.htm': 'text/html', 'a.js': 'text/javascript', 'm.mjs': 'text/javascript', 's.css': 'text/css',
  'd.json': 'application/json', 'n.ipynb': 'application/json', 'w.wasm': 'application/wasm', 't.txt': 'text/plain',
  'r.md': 'text/markdown', 'c.csv': 'text/csv', 'x.xml': 'application/xml', 'cmd.run': 'text/plain', 'a.mp3': 'audio/mpeg',
  'a.wav': 'audio/wav', 'a.ogg': 'audio/ogg', 'v.mp4': 'video/mp4', 'v.webm': 'video/webm', 'p.pdf': 'application/pdf',
  'f.woff': 'font/woff', 'f.woff2': 'font/woff2', 'f.ttf': 'font/ttf', 'a.js.map': 'application/json', 'i.png': 'image/png',
  'i.svg': 'image/svg+xml', 'noext': 'application/octet-stream', 'data.bin': 'application/octet-stream', 'x.unknownext': 'application/octet-stream',
  'UPPER.HTML': 'text/html',
};

const browser = await launch();
const context = await browser.newContext();
try {
  const page = await bootOS(context);
  await page.evaluate(() => {
    const fs = window.fs;
    const mk = (d) => { let cur = ''; for (const p of d.split('/').slice(1)) { cur += '/' + p; if (!fs.existsSync(cur)) fs.mkdirSync(cur); } };
    mk('/tmp/kh'); mk('/opt/apps/khtest'); mk('/home/user1/kh');
  });
  await page.evaluate(({ files }) => { for (const [p, c] of files) window.fs.writeFileSync(p, c); }, {
    files: [
      ...Object.keys(EXT_TYPES).filter((n) => /\.html?$/i.test(n)).map((n) => ['/tmp/kh/' + n, PROBE('tmp ' + n)]),
      ...Object.keys(EXT_TYPES).filter((n) => !/\.html?$/i.test(n)).map((n) => ['/tmp/kh/' + n, 'content of ' + n]),
      ['/tmp/kh/probe.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>window.__svg = self.origin</script></svg>'],
      ['/opt/apps/khtest/page.html', PROBE('opt-apps page')],
      ['/home/user1/kh/page.html', PROBE('home page')],
      ['/tmp/kh/w.js', "postMessage({ origin: self.origin, idb: (() => { try { indexedDB.open('w'); return 'ALLOWED' } catch (e) { return 'BLOCKED ' + e.name } })() })"],
    ],
  });

  // --- headers on fetch() responses ---
  const head = (url) => page.evaluate(async (u) => {
    const r = await fetch(u);
    const text = await r.text();
    return { status: r.status, type: r.headers.get('content-type'), csp: r.headers.get('content-security-policy'),
      nosniff: r.headers.get('x-content-type-options'), corp: r.headers.get('cross-origin-resource-policy'), body: text.slice(0, 80) };
  }, url);
  const secure = (h, { sandbox = true } = {}) => h.nosniff === 'nosniff' && h.corp === 'same-origin'
    && (sandbox ? h.csp === 'sandbox allow-scripts allow-forms allow-modals' : true);

  const typeFails = [];
  for (const [name, type] of Object.entries(EXT_TYPES)) {
    const h = await head('/(sw)/tmp/kh/' + encodeURIComponent(name));
    if (!(h.type && h.type.startsWith(type) && secure(h))) typeFails.push({ name, got: h.type, csp: h.csp, nosniff: h.nosniff, corp: h.corp });
  }
  check(`Content-Type + CSP sandbox + nosniff + CORP on ${Object.keys(EXT_TYPES).length} /(sw)/ file types`, typeFails.length === 0, typeFails);

  const q = await head('/(sw)/tmp/kh/x.html?signal=abc');
  check('query string does not change the type (?signal= on an html page)', q.type && q.type.startsWith('text/html') && secure(q), q);

  const cacheRoute = await head('/cache/tmp/kh/t.txt');
  check('/cache/ responses get the same headers', cacheRoute.status === 200 && cacheRoute.type.startsWith('text/plain') && secure(cacheRoute) && cacheRoute.body === 'content of t.txt', cacheRoute);
  const cacheMissing = await head('/cache/tmp/kh/missing.txt');
  check('/cache/ missing file → 404 with headers', cacheMissing.status === 404 && secure(cacheMissing), cacheMissing);

  const missing = await head('/(sw)/tmp/kh/missing.html');
  check('missing vfs file → wrapped 404 text, not the OS boot page', missing.status === 404 && missing.type.startsWith('text/plain') && secure(missing) && !/bootstrapper/i.test(missing.body), missing);
  const staticFallback = await head('/(sw)/public/manifest.json');
  check('network fallback (bare static path) gets the headers', staticFallback.status === 200 && secure(staticFallback) && staticFallback.type.startsWith('application/json'), staticFallback);
  const badEncoding = await head('/(sw)/tmp/kh/%E0%A4%A');
  check('malformed percent-encoding → 400 with headers', badEncoding.status === 400 && secure(badEncoding), badEncoding);

  // --- Cache Storage is never consulted ---
  await page.evaluate(async () => {
    const c = await caches.open('WebOS_v1');
    await c.put('/(sw)/tmp/kh/poison.html', new Response('<script>POISON</script>', { headers: { 'Content-Type': 'text/html' } }));
    await c.put(location.origin + '/(sw)/tmp/kh/t.txt', new Response('POISON', { headers: { 'Content-Type': 'text/plain' } }));
  });
  const p1 = await head('/(sw)/tmp/kh/poison.html');
  const p2 = await head('/(sw)/tmp/kh/t.txt');
  check('poisoned Cache Storage entries are ignored', !p1.body.includes('POISON') && p1.status === 404 && p2.body === 'content of t.txt', { p1, p2 });

  // --- iframe navigations inside the OS ---
  const frameProbe = async (name, src) => {
    const f = await addFrame(page, { name, src });
    await sleep(400);
    return f.evaluate(() => window.__r).catch((e) => ({ evalError: e.message }));
  };
  const optFrame = await frameProbe('kh-opt', '/(sw)/opt/apps/khtest/page.html');
  check('iframe → /(sw)/opt/apps/** stays same-origin (transitional exemption)', optFrame.origin === new URL(OS_URL).origin && optFrame.parentDoc.startsWith('ALLOWED'), optFrame);
  const homeFrame = await frameProbe('kh-home', '/(sw)/home/user1/kh/page.html');
  check('iframe → /(sw)/home/... is an opaque sandbox', homeFrame.origin === 'null' && homeFrame.localStorage.startsWith('BLOCKED') && homeFrame.parentDoc.startsWith('BLOCKED'), homeFrame);
  const trickFrame = await frameProbe('kh-trick', '/(sw)/opt/apps/khtest%2F..%2F..%2F..%2Fhome%2Fuser1%2Fkh%2Fpage.html');
  check('encoded ../ out of /opt/apps is normalised first → sandboxed', trickFrame.origin === 'null', trickFrame);
  const cacheFrame = await frameProbe('kh-cache', '/cache/opt/apps/khtest/page.html');
  check('iframe → /cache/opt/apps/** is sandboxed (exemption is /(sw)/ only)', cacheFrame.origin === 'null', cacheFrame);

  // --- top-level navigations are always sandboxed ---
  const top = await context.newPage();
  const topProbe = async (url) => {
    await top.goto(OS_URL + url, { waitUntil: 'load' });
    await sleep(300);
    return top.evaluate(() => window.__r || { origin: self.origin }).catch((e) => ({ evalError: e.message }));
  };
  const t1 = await topProbe('/(sw)/tmp/kh/x.html');
  check('top-level /(sw)/tmp/x.html → opaque origin, no storage', t1.origin === 'null' && t1.localStorage.startsWith('BLOCKED') && t1.indexedDB.startsWith('BLOCKED'), t1);
  const t2 = await topProbe('/(sw)/opt/apps/khtest/page.html');
  check('top-level /(sw)/opt/apps/** → opaque origin too', t2.origin === 'null' && t2.localStorage.startsWith('BLOCKED'), t2);
  await top.goto(OS_URL + '/(sw)/tmp/kh/probe.svg', { waitUntil: 'load' });
  await sleep(300);
  const svg = await top.evaluate(() => window.__svg).catch((e) => 'evalError: ' + e.message);
  check('top-level SVG with script runs only in an opaque origin', svg === 'null', svg);
  await top.close();

  // --- a first-party app (terminal: /(sw)/opt/apps/terminal/main.html in a window) still works ---
  await page.evaluate(() => window.platform.host.openWindow('ui.terminal'));
  const term = await pollFor(async () => {
    for (const f of page.frames()) {
      if (!f.url().includes('/(sw)/opt/apps/terminal/main.html')) continue;
      const ok = await f.evaluate(() => !!(window.__terminalApp && window.platform)).catch(() => false);
      if (ok) return f;
    }
    return null;
  }, 20000);
  check('terminal app window loads same-origin with window.platform + __terminalApp', !!term);

  // --- INFO: what a Worker started from /(sw)/ gets ---
  const w = await page.evaluate(() => new Promise((res) => {
    try {
      const wk = new Worker('/(sw)/tmp/kh/w.js');
      wk.onmessage = (e) => res(e.data); wk.onerror = (e) => res('error: ' + (e.message || 'load failed'));
      setTimeout(() => res('timeout'), 4000);
    } catch (e) { res('throw: ' + e.message); }
  }));
  console.log('INFO  Worker from /(sw)/tmp/kh/w.js:', JSON.stringify(w));
} finally {
  await browser.close();
}
finish('verify-kernel-sw-headers (1A.3)');
