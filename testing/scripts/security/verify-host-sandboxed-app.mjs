// Verifies 1B.8: ui.sandboxed-app registers its opaque frame with the kernel IPC bus —
// read-only fs events, scoped to the HTML file's own folder — and unregisters it when the
// window closes.
//
// Run: node testing/scripts/security/verify-host-sandboxed-app.mjs   (OS dev server on :8080)
// Exit code: 0 = all checks pass, 1 = a check failed.
import { launch, bootOS } from './spike-lib.mjs';

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const DIR = '/home/user1/sbx-verify';
// The app records every reply it gets; Playwright reads window.__r inside the opaque frame.
// Requests go straight to window.top (where the kernel's wos-ipc listener lives) so this
// checks the frame's registration/policy; `sdkReadOwn` goes through the inlined
// /usr/lib/ipc.js SDK, which (owner: kernel) currently posts to window.parent — for a
// frame nested inside an OS window that is the window's own document, so the SDK path
// only works once ipc.js targets window.top (reported as PENDING, not counted).
const APP = `<!doctype html><html><head><title>sbx-verify</title></head><body>sandboxed
<script>
  window.__r = {};
  let n = 0;
  const pending = {};
  addEventListener('message', (e) => {
    const d = e.data; if (!d || d.type !== 'wos-ipc-response' || !pending[d.id]) return;
    const k = pending[d.id]; delete pending[d.id];
    window.__r[k] = d.error ? 'ERR:' + String(d.error).slice(0, 120) : 'OK:' + JSON.stringify(d.result).slice(0, 80);
  });
  const ask = (k, event, data) => { const id = 'v' + (++n); pending[id] = k; top.postMessage({ type: 'wos-ipc', id, event, data }, '*'); };
  ask('readOwn', 'fs.readText', { path: '${DIR}/data.txt' });
  ask('listOwn', 'fs.list', { path: '${DIR}' });
  ask('statOwn', 'fs.stat', { path: '${DIR}/data.txt' });
  ask('readOutside', 'fs.readText', { path: '/home/user1/sbx-secret.txt' });
  ask('readTraversal', 'fs.readText', { path: '${DIR}/../sbx-secret.txt' });
  ask('write', 'fs.write', { path: '${DIR}/written.txt', content: 'x' });
  ask('wm', 'wm.getWindows', {});
  ipc.fs.readText('${DIR}/data.txt').then((v) => { window.__r.sdkReadOwn = 'OK:' + JSON.stringify(v); }, (e) => { window.__r.sdkReadOwn = 'ERR:' + e.message; });
</script></body></html>`;

const browser = await launch();
const context = await browser.newContext();
try {
  const page = await bootOS(context);
  await page.evaluate(({ DIR, APP }) => {
    const fs = window.fs;
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(`${DIR}/app.html`, APP);
    fs.writeFileSync(`${DIR}/data.txt`, 'OWN-DATA');
    fs.writeFileSync('/home/user1/sbx-secret.txt', 'SECRET');
    try { fs.unlinkSync(`${DIR}/written.txt`); } catch (_) {}
  }, { DIR, APP });

  // Record what the iframe module registers/unregisters (wraps its Host's registerIpcFrame).
  await page.evaluate(() => {
    window.__ipcLog = [];
    const host = platform.host.getModulePlatform('003-core.iframe').host;
    const orig = host.registerIpcFrame.bind(host);
    host.registerIpcFrame = (win, policy) => {
      window.__ipcLog.push('register ' + policy.id + ' ' + JSON.stringify(policy.fs));
      const unregister = orig(win, policy);
      return () => { window.__ipcLog.push('unregister ' + policy.id); unregister(); };
    };
  });
  const openApp = async (path, title) => {
    await page.evaluate((p) => platform.host.openWindow('ui.sandboxed-app', p), path);
    for (let i = 0; i < 40; i++) {
      for (const f of page.frames()) { if (await f.evaluate((t) => document.title === t && origin === 'null', title).catch(() => false)) return f; }
      await page.waitForTimeout(250);
    }
    return null;
  };
  // Find the opaque app frame (its origin is 'null').
  const frame = await openApp(`${DIR}/app.html`, 'sbx-verify');
  check('ui.sandboxed-app renders the page in an opaque-origin frame', !!frame);
  if (frame) {
    const read = async () => { for (let i = 0; i < 20; i++) { const r = await frame.evaluate(() => window.__r).catch(() => ({})); if (['readOwn','listOwn','statOwn','readOutside','readTraversal','write','wm'].every((k) => k in r)) return r; await page.waitForTimeout(250); } return frame.evaluate(() => window.__r).catch(() => ({})); };
    const r = await read();
    console.log('   replies:', JSON.stringify(r));
    check('reads its own folder (readText/list/stat)', r.readOwn === 'OK:"OWN-DATA"' && r.listOwn?.startsWith('OK:') && r.statOwn?.startsWith('OK:'), JSON.stringify({ readOwn: r.readOwn, listOwn: r.listOwn, statOwn: r.statOwn }));
    check('cannot read outside its folder', r.readOutside?.startsWith('ERR:') && !String(r.readOutside).includes('SECRET'), r.readOutside);
    check('cannot read outside via ..', r.readTraversal?.startsWith('ERR:') && !String(r.readTraversal).includes('SECRET'), r.readTraversal);
    check('cannot write', r.write?.startsWith('ERR:') && !(await page.evaluate((d) => window.fs.existsSync(`${d}/written.txt`), DIR)), r.write);
    check('no window-manager events', r.wm?.startsWith('ERR:'), r.wm);
    if (r.sdkReadOwn === 'OK:"OWN-DATA"') console.log('PASS  (dependency) window.ipc SDK reaches the kernel from a nested frame');
    else console.log(`PENDING  (dependency on 1A) window.ipc SDK reply: ${r.sdkReadOwn ?? 'none'} — /usr/lib/ipc.js must post to window.top`);

    check('registered read-only with its own folder as the scope', (await page.evaluate(() => window.__ipcLog)).includes(`register sandboxed-app:${DIR}/app.html {"read":["${DIR}"]}`), JSON.stringify(await page.evaluate(() => window.__ipcLog)));

    // Closing the window unregisters the frame.
    await page.evaluate(() => document.querySelector('.window[data-name="ui.sandboxed-app"] .wm-close')?.click());
    await page.waitForTimeout(800);
    const log = await page.evaluate(() => window.__ipcLog);
    check('closing the window unregisters the frame', log.includes(`unregister sandboxed-app:${DIR}/app.html`) && !(await page.evaluate(() => !!document.querySelector('.window[data-name="ui.sandboxed-app"]'))), JSON.stringify(log));

    // A frame that navigates away from its srcdoc loses the registration (D4: re-navigation = restart).
    await page.evaluate(({ DIR }) => window.fs.writeFileSync(`${DIR}/nav.html`, '<title>sbx-nav</title>nav'), { DIR });
    const nav = await openApp(`${DIR}/nav.html`, 'sbx-nav');
    const askTop = (f) => f.evaluate((path) => new Promise((res) => {
      let got = 'no reply';
      addEventListener('message', (e) => { if (e.data?.type === 'wos-ipc-response' && e.data.id === 'nv') got = e.data.error ? 'ERR' : 'OK'; });
      top.postMessage({ type: 'wos-ipc', id: 'nv', event: 'fs.readText', data: { path } }, '*');
      setTimeout(() => res(got), 1500);
    }), `${DIR}/data.txt`);
    const before = nav ? await askTop(nav) : 'no frame';
    if (nav) { await nav.evaluate(() => { location.href = 'about:blank'; }).catch(() => {}); await page.waitForTimeout(800); }
    const after = nav ? await askTop(nav).catch((e) => 'eval failed: ' + e.message) : 'no frame';
    check('a frame that navigates away loses its IPC access', before === 'OK' && after === 'no reply', `before=${before} after=${after}`);

    // An HTML file directly in the home folder gets only itself, not all of ~ (other apps' data).
    await page.evaluate(() => window.fs.writeFileSync('/home/user1/sbx-home.html', '<title>sbx-home</title>home'));
    await openApp('/home/user1/sbx-home.html', 'sbx-home');
    check('a page directly in ~ may read only itself', (await page.evaluate(() => window.__ipcLog)).includes('register sandboxed-app:/home/user1/sbx-home.html {"read":["/home/user1/sbx-home.html"]}'), JSON.stringify((await page.evaluate(() => window.__ipcLog)).slice(-1)));
  }
} finally {
  await context.close();
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
