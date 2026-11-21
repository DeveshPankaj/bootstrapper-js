// KRN-11 (+ D12) — the OS refuses to run inside a cross-site frame, drops window.opener, and pages
// it opens cross-origin get no opener; index.html / 404.html carry the meta CSP.
//
//   a cross-site page iframes the OS                 → the framed OS does not boot
//   a cross-site page window.open()s the OS          → in the OS, window.opener === null
//   the OS (top page / an app window) opens a cross-site page → that page has no opener
//   GET / and /404.html                              → <meta http-equiv=Content-Security-Policy> with object-src 'none' + base-uri 'self'
import { BASE_URL, newSession, boot, waitBooted, openWindow, windowFrame, startAttacker, step, report, done, sleep, pollFor, closeAllWindows } from './lib/harness.mjs';

const attacker = await startAttacker({
  '/framer.html': { body: `<!doctype html><title>framer</title><iframe id="os" src="${BASE_URL}/" style="width:900px;height:600px"></iframe>` },
  '/opener.html': { body: `<!doctype html><title>opener</title><button id="go">go</button><script>document.getElementById('go').onclick = () => { window.victim = window.open(${JSON.stringify(BASE_URL + '/')}, 'sec-framing-victim'); };</script>` },
  '/opened.html': { body: '<!doctype html><title>opened</title><script>window.__hadOpener = !!window.opener; window.__referrer = document.referrer;</script>opened' },
});

const S = await newSession();
try {
  const page = await boot(S.context);

  await step('KRN-11', 'cross-site-embed-refused', async () => {
    const framer = await S.context.newPage();
    await framer.goto(attacker.url('/framer.html'), { waitUntil: 'load' });
    await sleep(2000);
    // reload once so the (partitioned) SW is active, then give the framed OS time to boot
    await framer.reload({ waitUntil: 'load' });
    let state = null;
    const end = Date.now() + 30000;
    while (Date.now() < end) {
      const f = framer.frames().find((x) => x.url().startsWith(BASE_URL));
      if (f) state = await f.evaluate(() => ({ fs: !!window.fs, platform: !!window.platform, ipc: !!window.__wosIpcInit, desktop: !!document.querySelector('.content-area'), text: (document.body?.innerText || '').slice(0, 80) })).catch(() => state);
      if (state && (state.fs || state.platform || state.desktop)) break;
      await sleep(1000);
    }
    await framer.close().catch(() => {});
    if (!state) return { pass: null, detail: 'framed OS document never appeared' };
    return { pass: !state.fs && !state.platform && !state.desktop && !state.ipc, detail: JSON.stringify(state) };
  });

  await step('KRN-11', 'os-popup-drops-opener', async () => {
    const atk = await S.context.newPage();
    await atk.goto(attacker.url('/opener.html'));
    const [popup] = await Promise.all([S.context.waitForEvent('page', { timeout: 15000 }), atk.click('#go')]);
    await popup.waitForLoadState('load').catch(() => {});
    const booted = await waitBooted(popup, 90000);
    const opener = await popup.evaluate(() => window.opener !== null).catch((e) => 'eval failed ' + e.message);
    const reachable = await atk.evaluate(() => { try { return !!(window.victim && window.victim.closed === false); } catch (e) { return 'err'; } });
    await popup.close().catch(() => {});
    await atk.close().catch(() => {});
    return { pass: opener === false, detail: `popupBooted=${booted}; popup.window.opener set=${opener}; attackerStillHoldsHandle=${reachable}` };
  });

  const openedFrom = async (evaluateIn, tag) => {
    const pP = S.context.waitForEvent('page', { timeout: 10000 }).catch(() => null);
    const ret = await evaluateIn.evaluate((u) => { try { const w = window.open(u, '_blank'); return w === null ? 'null' : 'window'; } catch (e) { return 'threw ' + e.message; } }, attacker.url('/opened.html?from=' + tag));
    const p = await pP;
    if (!p) return { ret, opened: false };
    await p.waitForLoadState('load').catch(() => {});
    await sleep(500);
    const r = await p.evaluate(() => ({ hadOpener: window.__hadOpener, referrer: window.__referrer })).catch((e) => ({ err: e.message }));
    await p.close().catch(() => {});
    return { ret, opened: true, ...r };
  };

  await step('KRN-11', 'window-open-from-top-has-no-opener', async () => {
    const r = await openedFrom(page, 'top');
    if (!r.opened) return { pass: null, detail: 'no page opened: ' + JSON.stringify(r) };
    return { pass: r.hadOpener === false, detail: JSON.stringify(r) };
  });

  await step('KRN-11', 'window-open-from-app-window-has-no-opener', async () => {
    await closeAllWindows(page);
    await openWindow(page, 'ui.notepad');
    const f = await windowFrame(page, 'ui.notepad');
    if (!f) return { pass: null, detail: 'no app window frame' };
    const r = await openedFrom(f, 'app');
    await closeAllWindows(page);
    if (!r.opened) return { pass: null, detail: 'no page opened: ' + JSON.stringify(r) };
    return { pass: r.hadOpener === false, detail: JSON.stringify(r) };
  });

  await step('KRN-11', 'meta-csp-in-index-and-404', async () => {
    const out = {};
    for (const p of ['/', '/404.html']) {
      const html = await (await fetch(BASE_URL + p)).text();
      const m = html.match(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/i);
      const cm = m && (m[0].match(/content\s*=\s*"([^"]*)"/i) || m[0].match(/content\s*=\s*'([^']*)'/i));
      const content = cm ? cm[1] : null;
      out[p] = { meta: !!m, objectSrcNone: !!content && /object-src\s+'none'/.test(content), baseUriSelf: !!content && /base-uri\s+'self'/.test(content), scriptSrc: !!content && /script-src/.test(content) };
    }
    const pass = Object.values(out).every((x) => x.meta && x.objectSrcNone && x.baseUriSelf && x.scriptSrc);
    return { pass, detail: JSON.stringify(out) };
  });
} catch (e) {
  report('KRN-11', null, 'script error: ' + (e && e.stack || e), { check: 'harness' });
} finally {
  await S.close();
  await attacker.close();
}
done('test-framing');
