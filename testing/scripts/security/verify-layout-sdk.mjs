// verify-layout-sdk.mjs — TODO 1C.5 (audit WIN-10, KRN-6) + window hardening:
// props no longer expose the live namespace/ProxyFS (a frozen facade instead);
// sandboxAppIframe posts the SDK port per document, pinned to this origin, and
// a re-navigation gets a fresh port; window and app frames have the kernel's
// window.open hardening (cross-origin opens get no opener).
//
//   node testing/scripts/security/verify-layout-sdk.mjs
import { launch, bootOS, startServer } from './spike-lib.mjs';

const results = [];
const check = (id, ok, detail = '') => {
  results.push({ id, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${detail ? '  — ' + detail : ''}`);
};

const PORT = Number(process.env.FOREIGN_PORT || 8097);
const FOREIGN = `http://127.0.0.1:${PORT}`;
const server = await startServer(PORT, {
  '/probe.html': {
    body: `<!doctype html><title>foreign</title><script>
      window.__inits = [];
      addEventListener('message', (e) => { if (e.data && e.data.type === 'wos:sdk-init') window.__inits.push(e.ports.length); });
    </script><p>foreign page</p>`,
  },
});

const sdkCall = (frame, expr) => frame.evaluate((expr) => Promise.race([
  (0, eval)(expr).then((r) => ({ ok: true, r }), (e) => ({ ok: false, e: String(e && e.message || e) })),
  new Promise((r) => setTimeout(() => r({ ok: false, e: 'timeout — no SDK port' }), 4000)),
]), expr);

const findFrame = async (page, pred, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const f = page.frames().find(pred);
    if (f) return f;
    await page.waitForTimeout(200);
  }
  return null;
};

const browser = await launch();
try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await bootOS(context);
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  // ── props: no namespace, frozen ProxyFS facade
  await page.evaluate(() => {
    window.platform.host.registerCommand('verify.sdk', (body, props) => {
      window.top.__sdkProps = props;
      props.setWindowView(true);
    }, { title: 'SDK probe' });
    window.platform.host.openWindow('verify.sdk');
  });
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) { await page.waitForTimeout(250); ready = await page.evaluate(() => !!window.top.__sdkProps); }
  const facade = await page.evaluate(() => {
    const p = window.top.__sdkProps;
    const f = p.proxyFs;
    const before = f.writeText;
    try { f.writeText = () => 'hijacked'; } catch (_) {}
    try { f.ns = { acl: [] }; } catch (_) {}
    return {
      hasNamespace: 'namespace' in p, frozen: Object.isFrozen(f), keys: Object.keys(f).sort(),
      ns: f.ns === undefined && f.fs === undefined, unchanged: f.writeText === before,
    };
  });
  check('props has no namespace', facade.hasNamespace === false);
  check('props.proxyFs is a frozen facade without ns/fs', facade.frozen && facade.ns && facade.unchanged, JSON.stringify(facade));
  const fsOps = await page.evaluate(async () => {
    const f = window.top.__sdkProps.proxyFs;
    const own = await f.writeText('/home/user1/.local/share/verify.sdk/a.txt', 'hi').then(() => window.fs.readFileSync('/home/user1/.local/share/verify.sdk/a.txt', 'utf8'), (e) => 'ERR ' + e.message);
    const sys = await f.writeText('/etc/verify-sdk.txt', 'x').then(() => 'written', (e) => 'ERR ' + e.message);
    const exists = await f.exists('/home/user1/.local/share/verify.sdk/a.txt');
    return { own, sys, exists, sysOnDisk: window.fs.existsSync('/etc/verify-sdk.txt') };
  });
  check('facade methods work within the ACL', fsOps.own === 'hi' && fsOps.exists === true, JSON.stringify(fsOps));
  check('facade still enforces the ACL', fsOps.sys.startsWith('ERR') && !fsOps.sysOnDisk, fsOps.sys);

  // ── Window frames are hardened (cross-origin window.open → no opener)
  const winOpenWrapped = await page.evaluate(() => {
    const pid = window.top.__sdkProps.pid;
    const f = document.querySelector(`.window[data-pid="${pid}"] > iframe`);
    return !String(f.contentWindow.open).includes('[native code]');
  });
  check('window iframe has the hardened window.open', winOpenWrapped);
  const [popup] = await Promise.all([
    context.waitForEvent('page', { timeout: 10000 }).catch(() => null),
    page.evaluate((url) => {
      const pid = window.top.__sdkProps.pid;
      document.querySelector(`.window[data-pid="${pid}"] > iframe`).contentWindow.open(url, '_blank');
    }, `${FOREIGN}/probe.html`),
  ]);
  let popupOpener = 'no popup';
  if (popup) {
    await popup.waitForLoadState('load').catch(() => {});
    popupOpener = await popup.evaluate(() => window.opener === null ? 'null' : 'present').catch((e) => 'eval failed: ' + e.message);
    await popup.close();
  }
  check('cross-origin popup from a window has no opener', popupOpener === 'null', popupOpener);
  await page.evaluate(() => window.top.__sdkProps.close());

  // ── model-builder uses props.proxyFs (mkdir/exists/writeText)
  await page.evaluate(() => window.platform.host.openWindow('ui.model-builder'));
  let log = false;
  for (let i = 0; i < 40 && !log; i++) { await page.waitForTimeout(250); log = await page.evaluate(() => window.fs.existsSync('/home/user1/.local/share/model-builder/model-builder.log')); }
  check('model-builder creates its log through the facade', log);
  await page.evaluate(() => window.platform.host.callCommand('process.list').forEach((p) => window.platform.host.callCommand('process.kill', p.pid)));
  await page.waitForTimeout(400);

  // ── sandboxAppIframe: SDK port per document, pinned origin, re-navigation = new port
  await page.evaluate(() => window.platform.host.openWindow('ui.snake-game'));
  let app = await findFrame(page, (f) => f.url().includes('/opt/apps/snake-game/main.html'));
  check('snake-game app frame loads', !!app);
  await page.waitForTimeout(800);
  const first = await sdkCall(app, "AppSDK.exists('/opt/apps/snake-game')");
  check('AppSDK works in the sandboxed app frame', first.ok && first.r === true, JSON.stringify(first));
  const appHardened = await app.evaluate(() => !String(window.open).includes('[native code]'));
  check('sandboxed app frame has the hardened window.open', appHardened);

  await app.evaluate(() => { location.href = '/(sw)/opt/apps/trainboard/main.html'; });
  app = await findFrame(page, (f) => f.url().includes('/opt/apps/trainboard/main.html'));
  await page.waitForTimeout(1000);
  const second = app ? await sdkCall(app, "AppSDK.exists('/opt/apps/snake-game')") : { ok: false, e: 'frame missing' };
  check('after a same-origin re-navigation the new document gets a fresh port', second.ok && second.r === true, JSON.stringify(second));
  // Informational (kernel's hardenWindow): is the re-navigated document's window.open wrapped too?
  const reHardened = app ? await app.evaluate(() => !String(window.open).includes('[native code]')) : null;
  console.log(`info  re-navigated app document has the hardened window.open: ${reHardened} (src/kernel/ipc-bus.ts hardenWindow)`);

  await app.evaluate((url) => { location.href = url; }, `${FOREIGN}/probe.html`);
  const foreign = await findFrame(page, (f) => f.url().startsWith(FOREIGN));
  await page.waitForTimeout(1500);
  const inits = foreign ? await foreign.evaluate(() => window.__inits) : 'frame missing';
  check('a cross-origin document in the app frame gets no SDK port', Array.isArray(inits) && inits.length === 0, JSON.stringify(inits));

  check('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} pass, ${failed.length} fail`);
process.exit(failed.length ? 1 : 0);
