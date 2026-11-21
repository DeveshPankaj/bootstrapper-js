// Spike Q2 — what an opaque-origin sandboxed iframe (sandbox="allow-scripts") inside the
// booted OS can still reach: parent DOM/globals, origin storage, SW, caches, the
// 'wos-deeplink' BroadcastChannel, top navigation, popups, and what its postMessages
// look like to the parent.
// Run: node testing/scripts/security/spike-isolation.mjs   (dev server on :8080)
import { launch, bootOS, addFrame, print, PROBE_HELPERS } from './spike-lib.mjs';

const browser = await launch();
const context = await browser.newContext();
const page = await bootOS(context);
const consoleMsgs = [];
page.on('console', (m) => { if (/sandbox|allow-|Blocked|Unsafe attempt/i.test(m.text())) consoleMsgs.push(m.text().slice(0, 200)); });

// Top-page listeners: window messages from the sandbox, and the deep-link BroadcastChannel.
await page.evaluate(() => {
  window.__spikeMsgs = [];
  window.addEventListener('message', (e) => {
    if (!e.data || !e.data.spike) return;
    const f = document.querySelector('iframe[name="iso"]');
    window.__spikeMsgs.push({ origin: e.origin, sourceIsIframe: !!f && e.source === f.contentWindow, data: e.data });
  });
  window.__bcMsgs = [];
  window.__spikeBc = new BroadcastChannel('wos-deeplink');
  window.__spikeBc.onmessage = (e) => { if (e.data && e.data.spike) window.__bcMsgs.push(e.data); };
});

const frame = await addFrame(page, { name: 'iso', sandbox: 'allow-scripts', srcdoc: `<!doctype html><html><head><script>${PROBE_HELPERS}</script></head><body>iso</body></html>` });

const res = await frame.evaluate(async () => {
  const p = window.__probe, ap = window.__aprobe, out = {};
  out['self.origin'] = self.origin;
  out['location.href'] = location.href;
  out['parent.document'] = p(() => parent.document.title);
  out['top.platform'] = p(() => typeof top.platform);
  out['top.fs'] = p(() => typeof top.fs);
  out['top.__wosHost'] = p(() => typeof top.__wosHost);
  out['window.frameElement'] = p(() => window.frameElement);
  out['top.frames.length'] = p(() => top.frames.length);
  out['indexedDB.open'] = await new Promise((res) => {
    try {
      const r = indexedDB.open('spike-iso');
      r.onsuccess = () => res('ALLOWED: opened');
      r.onerror = () => res('BLOCKED: ' + r.error);
    } catch (e) { res('BLOCKED: ' + e.name + ': ' + e.message.slice(0, 140)); }
  });
  out['indexedDB.databases'] = await ap(async () => JSON.stringify((await indexedDB.databases()).map((d) => d.name)));
  out['localStorage'] = p(() => localStorage.length);
  out['sessionStorage'] = p(() => sessionStorage.length);
  out['document.cookie (read)'] = p(() => document.cookie);
  out['document.cookie (write)'] = p(() => { document.cookie = 'spike=1'; return document.cookie; });
  out['navigator.serviceWorker'] = p(() => typeof navigator.serviceWorker);
  out['serviceWorker.register'] = await ap(() => navigator.serviceWorker.register('/sw.bundle.js'));
  out['caches.open'] = await ap(() => caches.open('WebOS_v1'));
  out['navigator.storage.estimate'] = await ap(async () => JSON.stringify(await navigator.storage.estimate()));
  out['requestStorageAccess'] = await ap(() => document.requestStorageAccess());
  out['document.domain set'] = p(() => { document.domain = 'localhost'; return document.domain; });
  out['window.open'] = p(() => { const w = window.open('about:blank'); return w === null ? 'returned null' : 'returned a window'; });
  out['BroadcastChannel ctor'] = p(() => { const bc = new BroadcastChannel('wos-deeplink'); bc.postMessage({ spike: 'from-sandbox' }); return 'posted'; });
  out['parent.postMessage'] = p(() => { parent.postMessage({ spike: 'pm-from-sandbox' }, '*'); return 'posted'; });
  out['top.frames[0].postMessage'] = p(() => { top.frames[0].postMessage({ spike: 'pm-to-frame0' }, '*'); return 'posted (any frame in the page is reachable)'; });
  return out;
});

// Positive control for the BroadcastChannel: a same-origin (non-sandboxed) iframe posts too.
const ctrl = await addFrame(page, { name: 'bc-ctrl', srcdoc: '<!doctype html><body>ctrl</body>' });
await ctrl.evaluate(() => new BroadcastChannel('wos-deeplink').postMessage({ spike: 'from-same-origin-control' }));
await page.waitForTimeout(800);

const top = await page.evaluate(() => {
  const f = document.querySelector('iframe[name="iso"]');
  let postToNullOrigin;
  try { f.contentWindow.postMessage('x', 'null'); postToNullOrigin = 'ALLOWED'; } catch (e) { postToNullOrigin = 'BLOCKED: ' + e.name + ': ' + e.message.slice(0, 100); }
  let contentDocument;
  try { contentDocument = f.contentDocument === null ? 'null (cannot reach the sandbox DOM)' : 'ACCESSIBLE'; } catch (e) { contentDocument = 'BLOCKED: ' + e.name; }
  return { windowMessages: window.__spikeMsgs, bcMessagesSeenByTop: window.__bcMsgs, "postMessage(x, 'null')": postToNullOrigin, 'iframe.contentDocument': contentDocument };
});

// Top navigation last (if it were allowed it would replace the OS page).
const before = page.url();
const nav = await frame.evaluate(() => window.__probe(() => { top.location.href = 'http://localhost:8080/?spike-topnav=1'; return 'no exception'; }));
await page.waitForTimeout(1500);
const after = page.url();

print('Q2 probes inside sandbox="allow-scripts" srcdoc', res);
print('Q2 seen from the top page', top);
print('Q2 top navigation', { 'top.location.href = …': nav, 'page url before': before, 'page url after': after });
console.log('\n=== relevant console messages');
for (const m of [...new Set(consoleMsgs)]) console.log('  ' + m);

await browser.close();
