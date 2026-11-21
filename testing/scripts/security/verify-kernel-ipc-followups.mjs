// Verifies the src/kernel/ipc-bus.ts follow-ups reported during 1C (TODO 1A.1 follow-ups):
//  1. hardenWindow decides "already hardened" from the current document, so a frame that
//     re-navigates (same WindowProxy, new document) is wrapped again; about:blank opens keep
//     their handle;
//  2. (type-only) WmBridge launch items have an optional `cmd` — checked by tsc;
//  3. dock.registerSettings takes the dock id from the frame's registration (`dock:<id>`), not
//     from what the frame reports about itself.
// Run: node testing/scripts/security/verify-kernel-ipc-followups.mjs   (OS dev server on :8080)
import { launch, bootOS, addFrame, check, finish, sleep, askAll, IPC_PROBE_SRCDOC, startServer } from './verify-kernel-lib.mjs';

const XO_PORT = 8094;
const server = await startServer(XO_PORT, {
  '/opened.html': { body: '<!doctype html><title>opened</title><script>window.__opener = window.opener === null ? "null" : "present";</script>' },
});
const XO = `http://127.0.0.1:${XO_PORT}`;
const browser = await launch();
const context = await browser.newContext();
try {
  const page = await bootOS(context);

  // ── 1. re-navigation ──
  const f = await addFrame(page, { name: 'kh-renav', srcdoc: '<!doctype html><body>first document</body>' });
  const state = () => page.evaluate(() => {
    const w = document.querySelector('iframe[name="kh-renav"]').contentWindow;
    const d = Object.getOwnPropertyDescriptor(w, 'open');
    return { doc: w.document.body.textContent, configurable: d ? d.configurable : 'none' };
  });
  await page.evaluate(() => window.__wosKernel.hardenWindow(document.querySelector('iframe[name="kh-renav"]').contentWindow));
  const s1 = await state();
  check('first document hardened (open locked)', s1.configurable === false, s1);
  await page.evaluate(() => new Promise((res) => {
    const el = document.querySelector('iframe[name="kh-renav"]');
    el.addEventListener('load', res, { once: true });
    el.srcdoc = '<!doctype html><body>second document</body>';
  }));
  const s2 = await state();
  check('after re-navigation the new document is not hardened yet (precondition)', s2.doc === 'second document' && s2.configurable === true, s2);
  await page.evaluate(() => window.__wosKernel.hardenWindow(document.querySelector('iframe[name="kh-renav"]').contentWindow));
  const s3 = await state();
  check('hardenWindow on the same WindowProxy wraps the new document', s3.configurable === false, s3);
  const [opened] = await Promise.all([
    context.waitForEvent('page'),
    page.evaluate((url) => { window.__ret = document.querySelector('iframe[name="kh-renav"]').contentWindow.open(url, '_blank') === null ? 'null' : 'window'; }, `${XO}/opened.html`),
  ]);
  await opened.waitForLoadState('load');
  const r = { ret: await page.evaluate(() => window.__ret), opener: await opened.evaluate(() => window.__opener) };
  check('the re-navigated document\'s cross-origin window.open is noopener', r.ret === 'null' && r.opener === 'null', r);
  await opened.close();
  const twice = await page.evaluate(() => { const w = document.querySelector('iframe[name="kh-renav"]').contentWindow; window.__wosKernel.hardenWindow(w); return Object.getOwnPropertyDescriptor(w, 'open').configurable; });
  check('hardenWindow stays idempotent on one document', twice === false);
  const blank = await page.evaluate(() => { const w = window.open('about:blank', '_blank'); const ok = !!w; try { w && w.close(); } catch (_) {} return ok; });
  check('window.open("about:blank") from the hardened top keeps its handle', blank === true);

  // ── 3. dock id pinned to the registration ──
  const dock = await addFrame(page, { name: 'kh-dockpin', sandbox: 'allow-scripts', srcdoc: IPC_PROBE_SRCDOC });
  await page.evaluate(() => window.platform.host.registerIpcFrame(document.querySelector('iframe[name="kh-dockpin"]').contentWindow, { id: 'dock:pintest', events: ['dock.*'] }));
  const rd = await askAll(dock, [['p1', 'dock.registerSettings', { dockId: '../../etc/evil', schema: [{ key: 'k', label: 'K', type: 'toggle', value: true }] }]]);
  const bridge = await page.evaluate(() => ({ dockId: window.__wosDockBridge && window.__wosDockBridge.dockId, keys: (window.__wosDockBridge && window.__wosDockBridge.schema || []).map((e) => e.key) }));
  check('dock.registerSettings: dockId comes from the frame registration, not the payload', rd.p1 && rd.p1.result === true && bridge.dockId === 'pintest' && bridge.keys.includes('k'), { reply: rd.p1, bridge });
  await sleep(100);
} finally {
  await browser.close();
  server.close();
}
finish('verify-kernel-ipc-followups');
