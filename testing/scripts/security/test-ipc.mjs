// KRN-1, WIN-4/NET-2, WIN-7, KRN-13, APP-9 — the kernel's `wos-ipc` window listener must not
// serve windows the kernel didn't register (and registered frames only within their policy).
//
//   KRN-1  an unregistered sandbox="allow-scripts" frame in the OS posts to parent
//   KRN-1  a cross-site page window.open()s the OS and posts to the popup
//   WIN-4  a cross-site page shown in the Browser app (ui.iframe) posts to top
//   WIN-7  the dock frame and the canvas-wallpaper frame (opaque, but registered) ask for a secret
//   KRN-13 a cross-site frame in the top document receives no kernel broadcasts (window titles)
//   APP-9  a bookmark to a cross-site page: no opener, no IPC answer
//
// Pass = no successful wos-ipc reply carrying data, nothing written, no opener.
import {
  BASE_URL, newSession, boot, addFrame, openWindow, ensureApp, findFrame, startAttacker, step, report, done, sleep, pollFor,
  vfsWrite, vfsExists, IPC_ATTACK_JS, ipcSuccesses, isBooted, waitBooted, closeAllWindows,
} from './lib/harness.mjs';

const SECRET = 'SEC-IPC-' + Math.random().toString(36).slice(2);
const SECRET_PATH = '/home/user1/sec-ipc/secret.txt';
const ATTACK = IPC_ATTACK_JS(SECRET_PATH);

const attacker = await startAttacker({
  '/embed.html': { body: `<!doctype html><title>sec-embed</title><body>embedded third-party page<script>${ATTACK}
    __probe(top, 'embed'); setTimeout(() => __probe(top, 'embed'), 1500);</script></body>` },
  '/opener.html': { body: `<!doctype html><title>sec-opener</title><button id="go">go</button><script>${ATTACK}
    document.getElementById('go').onclick = () => {
      window.victim = window.open(${JSON.stringify(BASE_URL + '/')}, 'sec-victim');
      setInterval(() => { try { __probe(window.victim, 'popup'); } catch (_) {} }, 1000);
    };</script>` },
  '/bm.html': { body: `<!doctype html><title>sec-bookmark</title><body>bookmark target<script>${ATTACK}
    window.__hadOpener = !!window.opener; window.__framed = window.parent !== window;
    const go = () => { if (window.opener) __probe(window.opener, 'bm-opener'); if (window.parent !== window) __probe(top, 'bm-top'); };
    go(); setTimeout(go, 1500);</script></body>` },
  '/listener.html': { body: `<!doctype html><title>sec-listener</title><body>listener<script>${ATTACK}</script></body>` },
});

const leakDetail = (resp) => {
  const ok = ipcSuccesses(resp);
  return `${resp.length} replies, ${ok.length} successful` + (ok.length ? ': ' + JSON.stringify(ok.map((r) => ({ id: r.id, result: String(JSON.stringify(r.result)).slice(0, 60) }))) : '');
};
const leaked = (resp) => ipcSuccesses(resp).some((r) => typeof r.result === 'string' && r.result.includes(SECRET));

const S = await newSession();
try {
  const victim = await boot(S.context);
  await vfsWrite(victim, { [SECRET_PATH]: SECRET });

  // ── KRN-1 (i): unregistered opaque frame inside the OS ─────────────────────
  await step('KRN-1', 'unregistered-sandboxed-frame', async () => {
    const f = await addFrame(victim, { name: 'sec-sbx', sandbox: 'allow-scripts', srcdoc: `<!doctype html><body>sbx<script>${ATTACK}__probe(parent, 'sbx');</script></body>` });
    await sleep(4000);
    const resp = await f.evaluate(() => window.__resp);
    const wrote = await vfsExists(victim, '/tmp/sec-pwned-sbx.txt');
    return { pass: ipcSuccesses(resp).length === 0 && !wrote, detail: `${leakDetail(resp)}; secretLeaked=${leaked(resp)}; fileWritten=${wrote}` };
  });

  // ── WIN-4 / NET-2: cross-site page inside the Browser app ─────────────────
  await step('WIN-4', 'browser-app-page-ipc', async () => {
    if (!(await openWindow(victim, 'ui.iframe', attacker.url('/embed.html')))) return { pass: null, detail: 'could not open ui.iframe' };
    const f = await findFrame(victim, { urlPrefix: attacker.origin + '/embed.html', timeout: 15000 });
    if (!f) return { pass: null, detail: 'attacker page frame not found (Browser app did not load it)' };
    await sleep(4000);
    const resp = await f.evaluate(() => window.__resp);
    const wrote = await vfsExists(victim, '/tmp/sec-pwned-embed.txt');
    return { pass: ipcSuccesses(resp).length === 0 && !wrote, detail: `${leakDetail(resp)}; secretLeaked=${leaked(resp)}; fileWritten=${wrote}` };
  });
  await step('WIN-4', 'browser-app-cross-origin-sandboxed', async () => {
    const attrs = await victim.evaluate((o) => {
      const find = (doc, depth) => {
        for (const f of doc.querySelectorAll('iframe')) {
          if ((f.getAttribute('src') || '').startsWith(o)) return { sandbox: f.getAttribute('sandbox'), referrerpolicy: f.getAttribute('referrerpolicy') };
          if (depth < 3) { try { const r = f.contentDocument && find(f.contentDocument, depth + 1); if (r) return r; } catch (_) {} }
        }
        return null;
      };
      return find(document, 0);
    }, attacker.origin);
    if (!attrs) return { pass: null, detail: 'iframe element for the cross-site URL not found' };
    const sb = attrs.sandbox;
    const pass = sb !== null && !/allow-top-navigation|allow-popups-to-escape-sandbox/.test(sb);
    return { pass, detail: `sandbox=${JSON.stringify(sb)} referrerpolicy=${attrs.referrerpolicy}` };
  });
  await closeAllWindows(victim);

  // ── WIN-7: the dock frame (opaque srcdoc, registered with a narrow policy) ──
  await step('WIN-7', 'dock-frame-fs', async () => {
    for (const id of ['gnome', 'macos', 'default']) {
      await victim.evaluate((id) => { try { window.platform.host.callCommand('open-vfs-dock', id); } catch (_) {} }, id);
      if (await pollFor(() => victim.$('#vfs-dock-iframe'), 4000)) break;
    }
    const h = await victim.$('#vfs-dock-iframe');
    if (!h) return { pass: null, detail: 'no dock frame could be opened' };
    const f = await h.contentFrame();
    await f.waitForLoadState('load').catch(() => {});
    await f.evaluate(`(() => { ${ATTACK}
      const send = (id, event, data) => parent.postMessage({ type: 'wos-ipc', id, event, data }, '*');
      send('dock-read', 'fs.readText', { path: ${JSON.stringify(SECRET_PATH)} });
      send('dock-write', 'fs.write', { path: '/tmp/sec-pwned-dock.txt', content: 'x' });
      send('dock-widget', 'fs.write', { path: '/etc/widgets/sec-dock.js', content: 'top.__sec_dock = 1' });
      send('dock-list', 'fs.list', { path: '/home/user1' });
    })()`);
    await sleep(3500);
    const resp = await f.evaluate(() => window.__resp);
    const files = await victim.evaluate(() => ['/tmp/sec-pwned-dock.txt', '/etc/widgets/sec-dock.js'].filter((p) => window.fs.existsSync(p)));
    const dataLeak = ipcSuccesses(resp).filter((r) => ['dock-read', 'dock-list', 'dock-write', 'dock-widget'].includes(r.id));
    return { pass: dataLeak.length === 0 && files.length === 0, detail: `${leakDetail(resp)}; secretLeaked=${leaked(resp)}; written=${JSON.stringify(files)}` };
  });

  // ── WIN-7: the canvas-wallpaper frame ─────────────────────────────────────
  await step('WIN-7', 'wallpaper-frame-fs', async () => {
    await vfsWrite(victim, { '/home/user1/sec-ipc/wall.js': 'export function render(canvas) { const c = canvas.getContext("2d"); c.fillStyle = "#123"; c.fillRect(0, 0, 10, 10); }' });
    await victim.evaluate(() => { try { window.platform.host.callCommand('set-wallpaper', 'canvas:/home/user1/sec-ipc/wall.js'); } catch (_) {} });
    const f = await findFrame(victim, { selector: '#wallpaper-canvas', timeout: 10000 });
    if (!f) return { pass: null, detail: 'canvas wallpaper frame not found' };
    await f.evaluate(`(() => { ${ATTACK}
      const send = (id, event, data) => parent.postMessage({ type: 'wos-ipc', id, event, data }, '*');
      send('wall-read', 'fs.readText', { path: ${JSON.stringify(SECRET_PATH)} });
      send('wall-write', 'fs.write', { path: '/tmp/sec-pwned-wall.txt', content: 'x' });
      send('wall-wins', 'wm.getWindows', {});
    })()`);
    await sleep(3500);
    const resp = await f.evaluate(() => window.__resp);
    const wrote = await vfsExists(victim, '/tmp/sec-pwned-wall.txt');
    const dataLeak = ipcSuccesses(resp).filter((r) => ['wall-read', 'wall-write'].includes(r.id));
    return { pass: dataLeak.length === 0 && !wrote, detail: `${leakDetail(resp)}; secretLeaked=${leaked(resp)}; fileWritten=${wrote}` };
  });
  await victim.evaluate(() => { try { window.platform.host.callCommand('set-wallpaper', ''); } catch (_) {} }).catch(() => {});

  // ── KRN-13: a cross-site frame in the top document hears no kernel broadcasts ──
  await step('KRN-13', 'broadcast-to-foreign-frame', async () => {
    const f = await addFrame(victim, { name: 'sec-listener', src: attacker.url('/listener.html') });
    await sleep(500);
    await openWindow(victim, 'ui.notepad');
    await sleep(1500);
    await closeAllWindows(victim);
    await openWindow(victim, 'ui.settings');
    await sleep(2500);
    const got = await f.evaluate(() => ({ events: window.__events, other: window.__other }));
    await closeAllWindows(victim);
    return { pass: got.events.length === 0, detail: `wos-ipc-events=${got.events.length} ${JSON.stringify(got.events.slice(0, 3))}; other=${JSON.stringify(got.other.slice(0, 3))}` };
  });

  // ── APP-9: bookmark to a cross-site page ──────────────────────────────────
  await step('APP-9', 'bookmark-no-opener-no-ipc', async () => {
    await vfsWrite(victim, { '/home/user1/bookmarks.json': JSON.stringify([{ id: 1, title: 'SecBookmark', url: attacker.url('/bm.html') }]) });
    if (!(await ensureApp(victim, 'bookmarks', 'ui.bookmarks'))) return { pass: null, detail: 'ui.bookmarks not available' };
    await openWindow(victim, 'ui.bookmarks');
    const bf = await findFrame(victim, { text: 'SecBookmark', timeout: 15000 });
    if (!bf) return { pass: null, detail: 'bookmarks UI with the planted bookmark not found' };
    const popupP = S.context.waitForEvent('page', { timeout: 8000 }).catch(() => null);
    await bf.locator('text=SecBookmark').first().click({ force: true });
    const popup = await popupP;
    let where, state;
    if (popup) {
      await popup.waitForLoadState('load').catch(() => {});
      await sleep(3500);
      where = 'popup ' + popup.url().slice(0, 60);
      state = await popup.evaluate(() => ({ hadOpener: window.__hadOpener, openerNow: window.opener !== null, resp: window.__resp || [] })).catch((e) => ({ err: e.message }));
    } else {
      const f = await findFrame(victim, { urlPrefix: attacker.origin + '/bm.html', timeout: 6000 });
      if (!f) return { pass: null, detail: 'clicking the bookmark opened neither a popup nor an in-OS frame' };
      await sleep(3500);
      where = 'in-OS frame';
      state = await f.evaluate(() => ({ hadOpener: window.__hadOpener, openerNow: window.opener !== null, resp: window.__resp || [] }));
    }
    if (state.err) return { pass: null, detail: where + ' eval failed: ' + state.err };
    const pass = !state.hadOpener && ipcSuccesses(state.resp).length === 0;
    if (popup) await popup.close().catch(() => {});
    return { pass, detail: `${where}; opener=${state.hadOpener}; ${leakDetail(state.resp)}; secretLeaked=${leaked(state.resp)}` };
  });

  // ── KRN-1 (ii): a cross-site page opens the OS in a popup and talks to it ──
  await step('KRN-1', 'cross-site-popup', async () => {
    const atk = await S.context.newPage();
    await atk.goto(attacker.url('/opener.html'));
    const [popup] = await Promise.all([S.context.waitForEvent('page', { timeout: 15000 }), atk.click('#go')]);
    await popup.waitForLoadState('load').catch(() => {});
    const booted = await waitBooted(popup, 90000);
    await sleep(5000); // a few more probe rounds after boot
    const resp = await atk.evaluate(() => window.__resp);
    const wrote = await popup.evaluate(() => { try { return window.fs.existsSync('/tmp/sec-pwned-popup.txt'); } catch (_) { return false; } }).catch(() => false);
    await popup.close().catch(() => {});
    await atk.close().catch(() => {});
    if (!booted && !resp.length) return { pass: null, detail: 'popup OS never booted; no replies' };
    return { pass: ipcSuccesses(resp).length === 0 && !wrote, detail: `popupBooted=${booted}; ${leakDetail(resp)}; secretLeaked=${leaked(resp)}; fileWritten=${wrote}` };
  });
} catch (e) {
  report('KRN-1', null, 'script error: ' + (e && e.stack || e), { check: 'harness' });
} finally {
  await S.close();
  await attacker.close();
}
done('test-ipc');
