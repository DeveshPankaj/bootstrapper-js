// Verifies TODO 1A.4 (audit KRN-8): the service worker's vfs file requests (src/sw.ts ↔
// src/kernel/sw-bridge.ts) use random request ids, go only to top-level window clients, accept
// an fs/reply only from a client the request was sent to, survive malformed messages, and
// don't hang on directories or silent tabs; a success from any asked OS tab wins.
// Run: node testing/scripts/security/verify-kernel-sw-bridge.mjs   (OS dev server on :8080)
import { launch, bootOS, addFrame, check, finish, sleep, OS_URL } from './verify-kernel-lib.mjs';

const browser = await launch();
const context = await browser.newContext();
const fetchText = (page, url) => page.evaluate(async (u) => {
  const t0 = performance.now();
  const r = await fetch(u);
  return { status: r.status, body: (await r.text()).slice(0, 60), ms: Math.round(performance.now() - t0) };
}, url);
try {
  const a = await bootOS(context);
  await a.evaluate(() => {
    const fs = window.fs;
    if (!fs.existsSync('/tmp/kb4')) fs.mkdirSync('/tmp/kb4');
    fs.writeFileSync('/tmp/kb4/real.txt', 'REAL');
    // Record every request this tab gets (ids + paths) without touching the bridge.
    window.__reqs = [];
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'fs/file-request') window.__reqs.push(e.data.payload); });
  });

  // A nested same-origin frame inside the OS (controlled by the SW, like a window iframe).
  const nested = await addFrame(a, { name: 'kb4-nested', srcdoc: '<!doctype html><body>nested</body>' });
  await nested.evaluate(() => {
    window.__got = 0;
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'fs/file-request') window.__got++; });
  });

  for (let i = 0; i < 4; i++) await fetchText(a, `/(sw)/tmp/kb4/real.txt?i=${i}`);
  await fetchText(a, '/(sw)/tmp/./kb4//real.txt');
  const reqs = await a.evaluate(() => window.__reqs.slice());
  const ids = reqs.map((r) => r.request_id);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  check('request ids are random UUIDs, all distinct', ids.length >= 5 && ids.every((id) => uuid.test(id)) && new Set(ids).size === ids.length, ids);
  const mine = reqs.filter((r) => r.path.startsWith('/tmp/'));
  check('requests carry the normalised vfs path (query dropped, // and ./ resolved)', mine.length === 5 && mine.every((r) => r.path === '/tmp/kb4/real.txt'), mine.map((r) => r.path));
  check('a nested frame inside the OS is never asked for files', (await nested.evaluate(() => window.__got)) === 0);

  // Forged reply from the nested (not asked) frame, while the real tab stays silent.
  await a.evaluate(() => {
    const orig = ServiceWorker.prototype.postMessage;
    window.__restoreSwPost = () => { ServiceWorker.prototype.postMessage = orig; };
    ServiceWorker.prototype.postMessage = function (m, ...rest) {
      if (m && m.type === 'fs/reply' && !m.__test) return; // mute this tab's bridge
      return orig.call(this, m, ...rest);
    };
    window.__relay = (fn) => { window.__onReq = fn; };
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'fs/file-request' && window.__onReq) window.__onReq(e.data.payload); });
    const nestedWin = document.querySelector('iframe[name="kb4-nested"]').contentWindow;
    window.__onReq = (p) => nestedWin.postMessage({ forge: p.request_id }, '*');
  });
  await nested.evaluate(() => {
    addEventListener('message', (e) => {
      if (!e.data || !e.data.forge) return;
      navigator.serviceWorker.controller.postMessage({ type: 'fs/reply', payload: { request_id: e.data.forge, data: new TextEncoder().encode('FORGED'), error: '' } });
    });
  });
  const forged = await fetchText(a, '/(sw)/tmp/kb4/not-there.txt');
  check('forged fs/reply from a client that was not asked is ignored', !forged.body.includes('FORGED') && forged.status === 404, forged);
  check('a silent tab does not hang the request (times out → fallback 404)', forged.ms >= 9000 && forged.ms < 20000, forged.ms + ' ms');

  // Positive control: the asked tab's own reply is accepted.
  await a.evaluate(() => {
    window.__onReq = (p) => navigator.serviceWorker.controller.postMessage({ __test: true, type: 'fs/reply', payload: { request_id: p.request_id, data: new TextEncoder().encode('FROM-ASKED-TAB'), error: '' } });
  });
  const own = await fetchText(a, '/(sw)/tmp/kb4/whatever.txt');
  check('a reply from the asked tab is accepted', own.body === 'FROM-ASKED-TAB', own);
  await a.evaluate(() => { window.__onReq = null; window.__restoreSwPost(); });

  // Malformed messages to the SW don't break it.
  await a.evaluate(() => {
    const sw = navigator.serviceWorker.controller;
    for (const m of [null, undefined, 0, 'x', {}, { type: 'fs/reply' }, { type: 'fs/reply', payload: null },
      { type: 'fs/reply', payload: { request_id: 5 } }, { type: 'fs/reply', payload: { request_id: 'nope', data: 'x' } }]) sw.postMessage(m);
  });
  await sleep(300);
  const after = await fetchText(a, '/(sw)/tmp/kb4/real.txt');
  check('malformed messages are ignored; the SW keeps serving', after.body === 'REAL' && after.status === 200, after);

  // A directory request is answered (error → 404), not left hanging.
  const dir = await fetchText(a, '/(sw)/tmp/kb4');
  check('directory request → prompt 404', dir.status === 404 && dir.ms < 5000, dir);

  // Two OS tabs with different in-memory views: the tab that has the file wins.
  const c = await bootOS(context);
  await a.evaluate(() => window.fs.writeFileSync('/tmp/kb4/late.txt', 'LATE-IN-A'));
  const seenByC = await c.evaluate(() => window.fs.existsSync('/tmp/kb4/late.txt'));
  const late = await fetchText(c, '/(sw)/tmp/kb4/late.txt');
  check('with two OS tabs, a success from either wins over the other tab\'s "not found"', late.body === 'LATE-IN-A', { seenByC, late });

  // INFO: a top-level same-origin non-OS page (a static file) is asked too, but never answers.
  const st = await context.newPage();
  await st.goto(OS_URL + '/public/mount/opt/apps/terminal/main.html', { waitUntil: 'load' }).catch(() => {});
  const withStatic = await fetchText(a, '/(sw)/tmp/kb4/real.txt');
  console.log('INFO  with a static same-origin top-level page open:', JSON.stringify(withStatic));
} finally {
  await browser.close();
}
finish('verify-kernel-sw-bridge (1A.4)');
