// Spike Q4 — response-header sandboxing on a throwaway server (http://localhost:8099):
//  - a page served with `Content-Security-Policy: sandbox allow-scripts`, opened top-level
//    and inside a plain (no sandbox attribute) same-origin iframe → opaque origin?
//  - the same header on a Response *constructed by a service worker* (what src/sw.ts could do
//    for /(sw)/ vfs pages) → honoured? are that page's subresources still SW-intercepted?
// Run: node testing/scripts/security/spike-csp-header.mjs   (does not need the OS dev server)
import { launch, startServer, print } from './spike-lib.mjs';

const PORT = 8099;
const ORIGIN = `http://localhost:${PORT}`;
const PROBE_PAGE = (label) => `<!doctype html><html><head><title>${label}</title><script>
  window.__r = { label: ${JSON.stringify(label)}, origin: self.origin };
  try { indexedDB.open('csp-spike'); window.__r.indexedDB = 'ALLOWED' } catch (e) { window.__r.indexedDB = 'BLOCKED ' + e.name }
  try { window.__r.localStorage = 'ALLOWED len=' + localStorage.length } catch (e) { window.__r.localStorage = 'BLOCKED ' + e.name }
  try { window.__r.parentDocument = (parent === window) ? 'top-level' : 'ALLOWED ' + parent.document.title } catch (e) { window.__r.parentDocument = 'BLOCKED ' + e.name }
  try { window.__r.controlled = !!(navigator.serviceWorker && navigator.serviceWorker.controller) } catch (e) { window.__r.controlled = 'ERR ' + e.name }
</script>
<script src="/via-sw/sub.js" onerror="window.__r.subresourceViaSW = 'error (not intercepted)'"></script>
</head><body>${label}</body></html>`;

const SW_JS = `
const PAGE = ${JSON.stringify(PROBE_PAGE('sw-constructed + CSP sandbox'))};
const PAGE_NOCSP = ${JSON.stringify(PROBE_PAGE('sw-constructed, no CSP'))};
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (u.pathname === '/via-sw/page.html') e.respondWith(new Response(PAGE, { headers: { 'Content-Type': 'text/html', 'Content-Security-Policy': 'sandbox allow-scripts' } }));
  else if (u.pathname === '/via-sw/page-nocsp.html') e.respondWith(new Response(PAGE_NOCSP, { headers: { 'Content-Type': 'text/html' } }));
  else if (u.pathname === '/via-sw/sub.js') e.respondWith(new Response("window.__r.subresourceViaSW = 'served by SW'", { headers: { 'Content-Type': 'application/javascript' } }));
});`;

const server = await startServer(PORT, {
  '/csp-page.html': { headers: { 'Content-Type': 'text/html', 'Content-Security-Policy': 'sandbox allow-scripts' }, body: PROBE_PAGE('server CSP sandbox') },
  '/plain-framer.html': { body: `<!doctype html><title>framer</title><iframe name="inner" src="/csp-page.html"></iframe>` },
  '/sw-register.html': { body: `<!doctype html><title>reg</title><script>navigator.serviceWorker.register('/test-sw.js', { scope: '/' })</script>` },
  '/test-sw.js': { headers: { 'Content-Type': 'application/javascript' }, body: SW_JS },
  '/sw-framer.html': { body: `<!doctype html><title>sw-framer</title><iframe name="viasw" src="/via-sw/page.html"></iframe><iframe name="viasw-nocsp" src="/via-sw/page-nocsp.html"></iframe>` },
});

const browser = await launch();
const context = await browser.newContext();
const page = await context.newPage();
const readTop = () => page.evaluate(() => window.__r).catch((e) => ({ evalError: e.message }));
const readFrame = async (name) => {
  for (let i = 0; i < 50 && !page.frame({ name }); i++) await page.waitForTimeout(100);
  const f = page.frame({ name });
  await f.waitForLoadState('load').catch(() => {});
  return f.evaluate(() => window.__r).catch((e) => ({ evalError: e.message }));
};

try {
  await page.goto(`${ORIGIN}/csp-page.html`); await page.waitForTimeout(500);
  print('Q4 server header, top-level navigation', await readTop());

  await page.goto(`${ORIGIN}/plain-framer.html`); await page.waitForTimeout(500);
  const parentView = await page.evaluate(() => { const f = document.querySelector('iframe'); try { return f.contentDocument === null ? 'contentDocument null' : 'ACCESSIBLE'; } catch (e) { return 'BLOCKED ' + e.name; } });
  print('Q4 server header, plain iframe (no sandbox attribute)', { ...(await readFrame('inner')), parentView });

  await page.goto(`${ORIGIN}/sw-register.html`);
  for (let i = 0; i < 50; i++) {
    if (await page.evaluate(() => !!navigator.serviceWorker.controller)) break;
    await page.waitForTimeout(200);
    if (i === 10) await page.reload();
  }
  await page.goto(`${ORIGIN}/via-sw/page-nocsp.html`); await page.waitForTimeout(500);
  print('Q4 SW-constructed response WITHOUT CSP (control), top-level', await readTop());
  await page.goto(`${ORIGIN}/via-sw/page.html`); await page.waitForTimeout(500);
  print('Q4 SW-constructed response WITH `CSP: sandbox allow-scripts`, top-level', await readTop());
  await page.goto(`${ORIGIN}/sw-framer.html`); await page.waitForTimeout(800);
  print('Q4 SW-constructed + CSP, in a plain same-origin iframe', await readFrame('viasw'));
  print('Q4 SW-constructed, no CSP, in a plain same-origin iframe (control)', await readFrame('viasw-nocsp'));
} finally {
  await browser.close();
  server.close();
}
