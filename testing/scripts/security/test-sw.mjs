// KRN-7 / KRN-8 — the service worker serves vfs files as data, never as same-origin documents,
// and only the OS kernel it asked can answer a vfs file request.
//
// KRN-7  top-level navigation to /(sw)/…/x.html, x.svg and /(sw)/opt/apps/…/page.html → opaque origin
//        a plain iframe navigated to /(sw)/home/… → opaque origin (only /opt/apps iframes are exempt)
//        /(sw)/ and /cache/ responses carry CSP sandbox, nosniff, CORP same-origin, octet-stream default
// KRN-8  a forged fs/reply from a same-origin frame / a second same-origin tab is not served
//        request ids are unpredictable
import { BASE_URL, newSession, boot, addFrame, step, report, done, sleep, vfsWrite } from './lib/harness.mjs';

const PROBE = (label) => `<!doctype html><html><head><meta charset="utf-8"><title>${label}</title></head><body>${label}<script>
  window.__r = { origin: String(self.origin) };
  try { localStorage.length; window.__r.localStorage = 'ALLOWED'; } catch (e) { window.__r.localStorage = 'BLOCKED ' + e.name; }
  try { indexedDB.open('sec-sw-probe'); window.__r.indexedDB = 'ALLOWED'; } catch (e) { window.__r.indexedDB = 'BLOCKED ' + e.name; }
  try { window.__r.parentPlatform = parent !== window && !!parent.platform; } catch (e) { window.__r.parentPlatform = 'BLOCKED ' + e.name; }
</script></body></html>`;
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>window.__r = { origin: String(self.origin) }; try { localStorage.length; window.__r.localStorage = 'ALLOWED'; } catch (e) { window.__r.localStorage = 'BLOCKED ' + e.name; }</script><rect width="10" height="10"/></svg>`;
const opaque = (r) => !!r && r.origin === 'null' && /^BLOCKED/.test(r.localStorage || '');

const S = await newSession();
try {
  const os = await boot(S.context);
  await vfsWrite(os, {
    '/tmp/sec-sw/x.html': PROBE('tmp html'),
    '/tmp/sec-sw/x.svg': SVG,
    '/tmp/sec-sw/a.unknownext': 'opaque bytes',
    '/tmp/sec-sw/t.txt': 'plain text',
    '/tmp/sec-sw/real.txt': 'REAL-CONTENT',
    '/home/user1/sec-sw/page.html': PROBE('home html'),
    '/opt/apps/sec-swtest/page.html': PROBE('opt-apps html'),
  });

  const navTop = async (path) => {
    const p = await S.context.newPage();
    try {
      await p.goto(BASE_URL + path, { waitUntil: 'load', timeout: 30000 });
      await sleep(800);
      return await p.evaluate(() => window.__r || { origin: String(self.origin), note: 'probe script did not run' });
    } finally { await p.close().catch(() => {}); }
  };

  // ── KRN-7: top-level navigations ───────────────────────────────────────────
  await step('KRN-7', 'top-level-html-is-opaque', async () => {
    const r = await navTop('/(sw)/tmp/sec-sw/x.html');
    return { pass: opaque(r), detail: JSON.stringify(r) };
  });
  await step('KRN-7', 'top-level-svg-is-opaque', async () => {
    const r = await navTop('/(sw)/tmp/sec-sw/x.svg');
    return { pass: r.note ? r.origin === 'null' : opaque(r), detail: JSON.stringify(r) };
  });
  await step('KRN-7', 'top-level-opt-apps-is-opaque', async () => {
    const r = await navTop('/(sw)/opt/apps/sec-swtest/page.html');
    return { pass: opaque(r), detail: JSON.stringify(r) };
  });

  // ── KRN-7: a plain (no sandbox attribute) iframe navigated to a user file ─
  await step('KRN-7', 'iframe-home-html-is-opaque', async () => {
    const f = await addFrame(os, { name: 'sec-sw-home', src: '/(sw)/home/user1/sec-sw/page.html' });
    await sleep(800);
    const r = await f.evaluate(() => window.__r || { origin: String(self.origin), note: 'probe script did not run' });
    return { pass: r.note ? r.origin === 'null' : opaque(r) && r.parentPlatform !== true, detail: JSON.stringify(r) };
  });

  // ── KRN-7: response headers ────────────────────────────────────────────────
  await step('KRN-7', 'vfs-response-headers', async () => {
    const res = await os.evaluate(async () => {
      const out = {};
      for (const u of ['/(sw)/tmp/sec-sw/x.html', '/(sw)/tmp/sec-sw/a.unknownext', '/cache/tmp/sec-sw/t.txt']) {
        const r = await fetch(u);
        await r.text();
        out[u] = { status: r.status, type: r.headers.get('content-type'), csp: r.headers.get('content-security-policy'),
          nosniff: r.headers.get('x-content-type-options'), corp: r.headers.get('cross-origin-resource-policy') };
      }
      return out;
    });
    const bad = Object.entries(res).filter(([, h]) => !(h.csp && /(^|;)\s*sandbox\b/.test(h.csp) && !/allow-same-origin/.test(h.csp) && h.nosniff === 'nosniff' && h.corp === 'same-origin'));
    const unknown = res['/(sw)/tmp/sec-sw/a.unknownext'];
    const typeOk = !!unknown.type && unknown.type.startsWith('application/octet-stream');
    return { pass: bad.length === 0 && typeOk, detail: JSON.stringify(res) };
  });

  // ── KRN-8: request ids ─────────────────────────────────────────────────────
  await step('KRN-8', 'request-ids-unpredictable', async () => {
    const ids = await os.evaluate(async () => {
      const ids = [];
      const h = (e) => { if (e.data && e.data.type === 'fs/file-request') ids.push(String(e.data.payload && e.data.payload.request_id)); };
      navigator.serviceWorker.addEventListener('message', h);
      for (let i = 0; i < 4; i++) await (await fetch('/(sw)/tmp/sec-sw/real.txt?n=' + i)).text();
      navigator.serviceWorker.removeEventListener('message', h);
      return ids;
    });
    const numeric = ids.length > 0 && ids.every((x) => /^\d+$/.test(x));
    const consecutive = numeric && ids.every((x, i) => i === 0 || Number(x) === Number(ids[i - 1]) + 1);
    return { pass: ids.length >= 4 && !numeric && new Set(ids).size === ids.length && ids.every((x) => x.length >= 16), detail: `ids=${JSON.stringify(ids)} consecutiveIntegers=${consecutive}` };
  });

  // Mute the OS tab's own replies (so only a forger could answer), and relay each request id.
  await os.evaluate(() => {
    const orig = ServiceWorker.prototype.postMessage;
    window.__secRestoreSw = () => { ServiceWorker.prototype.postMessage = orig; };
    ServiceWorker.prototype.postMessage = function (m, ...rest) {
      if (m && m.type === 'fs/reply' && !m.__secAllow) return undefined;
      return orig.call(this, m, ...rest);
    };
    window.__secBc = new BroadcastChannel('sec-krn8');
    window.__secRelay = (e) => {
      if (!(e.data && e.data.type === 'fs/file-request')) return;
      const id = e.data.payload && e.data.payload.request_id;
      window.__secBc.postMessage({ forge: id });
      const f = document.querySelector('iframe[name="sec-forger"]');
      if (f) f.contentWindow.postMessage({ forge: id }, '*');
    };
    navigator.serviceWorker.addEventListener('message', window.__secRelay);
  });
  const fetchFromOs = (u) => os.evaluate(async (u) => {
    const t0 = performance.now();
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 25000);
    try { const r = await fetch(u, { signal: ctl.signal }); return { status: r.status, body: (await r.text()).slice(0, 60), ms: Math.round(performance.now() - t0) }; }
    catch (e) { return { error: String(e), ms: Math.round(performance.now() - t0) }; }
    finally { clearTimeout(t); }
  }, u);

  // ── KRN-8 (a): forged reply from a same-origin frame inside the OS ────────
  await step('KRN-8', 'forged-reply-from-nested-frame', async () => {
    const f = await addFrame(os, { name: 'sec-forger', srcdoc: '<!doctype html><body>forger</body>' });
    await f.evaluate(() => {
      window.__direct = 0;
      navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'fs/file-request') window.__direct++; });
      addEventListener('message', (e) => {
        if (!e.data || !e.data.forge) return;
        navigator.serviceWorker.controller.postMessage({ type: 'fs/reply', payload: { request_id: e.data.forge, data: new TextEncoder().encode('FORGED-BY-FRAME'), error: '' } });
      });
    });
    const r = await fetchFromOs('/(sw)/tmp/sec-sw/real.txt?a=1');
    const direct = await f.evaluate(() => window.__direct);
    await os.evaluate(() => document.querySelector('iframe[name="sec-forger"]')?.remove());
    return { pass: !String(r.body || '').includes('FORGED'), detail: `${JSON.stringify(r)}; nestedFrameGotRequestsDirectly=${direct}` };
  });

  // ── KRN-8 (b) INFO: forged reply from a second same-origin top-level tab (not an OS) ──
  // Phase-2 residual, by decision: the kernel asks every top-level tab (multi-tab OS support) and
  // only same-origin, already-privileged code can be a top-level SW client (vfs documents are
  // CSP-sandboxed/opaque). Target: one registered kernel client per request.
  await step('KRN-8', 'forged-reply-from-second-tab', async () => {
    const tab = await S.context.newPage();
    await tab.goto(BASE_URL + '/public/mount/meta.json', { waitUntil: 'load' });
    const controlled = await tab.evaluate(() => !!navigator.serviceWorker.controller);
    await tab.evaluate(() => {
      window.__direct = 0;
      const forge = (id) => navigator.serviceWorker.controller && navigator.serviceWorker.controller.postMessage({ type: 'fs/reply', payload: { request_id: id, data: new TextEncoder().encode('FORGED-BY-TAB'), error: '' } });
      navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.type === 'fs/file-request') { window.__direct++; forge(e.data.payload.request_id); } });
      new BroadcastChannel('sec-krn8').onmessage = (e) => { if (e.data && e.data.forge) forge(e.data.forge); };
    });
    const r = await fetchFromOs('/(sw)/tmp/sec-sw/real.txt?b=1');
    const direct = await tab.evaluate(() => window.__direct);
    await tab.close().catch(() => {});
    if (!controlled) return { pass: null, detail: 'second tab is not SW-controlled' };
    return { pass: !String(r.body || '').includes('FORGED'), detail: `${JSON.stringify(r)}; secondTabGotRequestsDirectly=${direct} (residual: one registered kernel client per request)` };
  }, { phase: 'info' });

  // Positive control (info): with the mute lifted, the OS tab still serves the file.
  await step('KRN-8', 'os-tab-still-serves', async () => {
    await os.evaluate(() => { window.__secRestoreSw(); navigator.serviceWorker.removeEventListener('message', window.__secRelay); });
    const r = await fetchFromOs('/(sw)/tmp/sec-sw/real.txt?c=1');
    return { pass: r.body === 'REAL-CONTENT', detail: JSON.stringify(r) };
  }, { phase: 'info' });
} catch (e) {
  report('KRN-7', null, 'script error: ' + (e && e.stack || e), { check: 'harness' });
} finally {
  await S.close();
}
done('test-sw');
