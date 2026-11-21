// Verifies TODO 1A.9 (audit KRN-6, WIN-10 — service-worker side): the AppSDK bootstrap that
// src/sw.ts injects into /(sw)/opt/apps/**.html accepts `wos:sdk-init` only from its parent
// window, isn't hijacked by a nested child frame racing in first, and isn't consumed by
// unrelated messages; real sandboxAppIframe apps (snake-game) still get a working AppSDK.
// Run: node testing/scripts/security/verify-kernel-sdk-init.mjs   (OS dev server on :8080)
import { launch, bootOS, addFrame, check, finish, sleep, pollFor } from './verify-kernel-lib.mjs';

const browser = await launch();
const context = await browser.newContext();
try {
  const page = await bootOS(context);

  // ── INFO: which window does a page see as ev.source when the post is made by code
  //    running in another same-origin realm (like the layout bundle's module iframe)?
  await page.evaluate(() => {
    const fs = window.fs;
    if (!fs.existsSync('/opt/apps/khsdk')) fs.mkdirSync('/opt/apps/khsdk');
    fs.writeFileSync('/opt/apps/khsdk/probe.html', `<!doctype html><html><head><meta charset="utf-8"></head><body>probe<script>
      window.__src = [];
      addEventListener('message', (e) => {
        if (!e.data || !e.data.probe) return;
        let who;
        try { who = e.source === parent ? 'parent' : e.source === top ? 'top' : 'window named ' + JSON.stringify(e.source && e.source.name); } catch (_) { who = 'cross-origin window'; }
        window.__src.push(who);
      });
    </script></body></html>`);
  });
  const realm = await addFrame(page, { name: 'kh-realm', srcdoc: '<!doctype html><body>other realm</body>' });
  const holder = await addFrame(page, { name: 'kh-holder', srcdoc: '<!doctype html><body></body>' });
  await holder.evaluate(() => {
    const f = document.createElement('iframe');
    f.name = 'kh-app';
    f.src = '/(sw)/opt/apps/khsdk/probe.html';
    document.body.appendChild(f);
  });
  const app = await pollFor(async () => {
    const f = page.frame({ name: 'kh-app' });
    return f && (await f.evaluate(() => Array.isArray(window.__src)).catch(() => false)) ? f : null;
  }, 15000);
  await realm.evaluate(() => {
    const target = parent.document.querySelector('iframe[name="kh-holder"]').contentDocument.querySelector('iframe[name="kh-app"]').contentWindow;
    target.postMessage({ probe: 'from another realm' }, '*');
  });
  await holder.evaluate(() => document.querySelector('iframe[name="kh-app"]').contentWindow.postMessage({ probe: 'from the parent realm' }, '*'));
  await sleep(300);
  console.log('INFO  ev.source seen by a nested app page:', JSON.stringify(await app.evaluate(() => window.__src)));

  // ── The bootstrap itself: hijack attempts, unrelated messages, one port only ──
  const FAKE_INIT = `<script>window.__stolen = []; const ch = new MessageChannel(); ch.port1.onmessage = (e) => window.__stolen.push(e.data);
    parent.postMessage({ type: 'wos:sdk-init' }, '*', [ch.port2]);<\/script>`;
  await page.evaluate((fake) => {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    window.fs.writeFileSync('/opt/apps/khsdk/app.html', `<!doctype html><html><head><meta charset="utf-8"></head><body>app
      <iframe name="kh-child-opaque" sandbox="allow-scripts" srcdoc="${esc(fake)}"></iframe>
      <iframe name="kh-child-same" srcdoc="${esc(fake)}"></iframe>
      <script>window.__calls = []; window.__call = (n) => AppSDK.exists('/x' + n).then((r) => window.__calls.push(['ok', n, r]), (e) => window.__calls.push(['err', n, e.message]));<\/script>
      </body></html>`);
  }, FAKE_INIT);
  await addFrame(page, { name: 'kh-sdk', src: '/(sw)/opt/apps/khsdk/app.html' });
  const sdk = await pollFor(async () => {
    const f = page.frame({ name: 'kh-sdk' });
    return f && (await f.evaluate(() => typeof window.__call === 'function' && !!window.AppSDK).catch(() => false)) ? f : null;
  }, 15000);
  check('bootstrap injected into a /(sw)/opt/apps page', !!sdk);
  await sleep(800); // both child frames have posted their fake inits by now
  // Unrelated / malformed messages from the parent first — must not consume the listener.
  await page.evaluate(() => {
    const w = document.querySelector('iframe[name="kh-sdk"]').contentWindow;
    w.postMessage({ type: 'something-else' }, '*');
    w.postMessage(null, '*');
    w.postMessage({ type: 'wos:sdk-init' }, '*'); // no port
  });
  // (don't return the pending promise: awaiting it from evaluate() tears the page down)
  await sdk.evaluate(() => { window.__call(1); return true; });
  await sleep(400);
  const stolen = async () => {
    const out = {};
    for (const n of ['kh-child-opaque', 'kh-child-same']) {
      const f = page.frame({ name: n });
      out[n] = f ? await f.evaluate(() => window.__stolen).catch((e) => 'eval: ' + e.message) : 'no frame';
    }
    return out;
  };
  const s1 = await stolen();
  check('a child frame (opaque or same-origin) racing in with a fake wos:sdk-init gets no calls',
    Array.isArray(s1['kh-child-opaque']) && s1['kh-child-opaque'].length === 0 && Array.isArray(s1['kh-child-same']) && s1['kh-child-same'].length === 0, s1);
  check('calls stay queued until the host sends the port', (await sdk.evaluate(() => window.__calls.length)) === 0);

  // The legit init from the parent (top realm): queued call is delivered to it.
  await page.evaluate(() => {
    const w = document.querySelector('iframe[name="kh-sdk"]').contentWindow;
    const mk = (tag) => { const ch = new MessageChannel(); window['__' + tag] = []; ch.port1.onmessage = (e) => { window['__' + tag].push(e.data); ch.port1.postMessage({ id: e.data.id, r: tag, err: null }); }; return ch.port2; };
    w.postMessage({ type: 'wos:sdk-init' }, '*', [mk('legit')]);
  });
  await sleep(400);
  check('after unrelated messages, the real init still binds and drains the queue', JSON.stringify(await sdk.evaluate(() => window.__calls)) === JSON.stringify([['ok', 1, 'legit']]),
    await sdk.evaluate(() => window.__calls));
  // A second init (even from the parent) is ignored: calls keep going to the first port.
  await page.evaluate(() => {
    const w = document.querySelector('iframe[name="kh-sdk"]').contentWindow;
    const ch = new MessageChannel(); window.__second = []; ch.port1.onmessage = (e) => window.__second.push(e.data);
    w.postMessage({ type: 'wos:sdk-init' }, '*', [ch.port2]);
  });
  await sleep(200);
  await sdk.evaluate(() => { window.__call(2); return true; });
  await sleep(400);
  const calls = await sdk.evaluate(() => window.__calls);
  check('a second wos:sdk-init is ignored (the port is taken once)', calls.length === 2 && calls[1][2] === 'legit' && (await page.evaluate(() => window.__second.length)) === 0, calls);
  const s2 = await stolen();
  check('child frames never received a call', s2['kh-child-opaque'].length === 0 && s2['kh-child-same'].length === 0, s2);

  // ── A real sandboxAppIframe app (port posted by the layout bundle's realm) still works ──
  await page.evaluate(() => window.platform.host.callCommand('ui.snake-game'));
  const snake = await pollFor(async () => {
    for (const f of page.frames()) {
      if (!f.url().includes('/(sw)/opt/apps/snake-game/main.html')) continue;
      if (await f.evaluate(() => !!window.AppSDK).catch(() => false)) return f;
    }
    return null;
  }, 20000);
  const snakeSdk = snake ? await snake.evaluate(() => Promise.race([
    window.AppSDK.exists('/opt/apps/snake-game').then((r) => 'resolved: ' + r, (e) => 'rejected: ' + e.message),
    new Promise((r) => setTimeout(() => r('timeout'), 5000)),
  ])) : 'snake-game frame not found';
  check('snake-game (sandboxAppIframe) AppSDK call resolves', snakeSdk === 'resolved: true', snakeSdk);
} finally {
  await browser.close();
}
finish('verify-kernel-sdk-init (1A.9)');
