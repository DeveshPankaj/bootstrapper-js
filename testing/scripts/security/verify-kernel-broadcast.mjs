// Verifies TODO 1A.2 (audit KRN-13): broadcastIpcEvent posts `wos-ipc-event`s only to frames
// registered with registerIpcFrame, and only to those whose policy covers the event's
// namespace — through the window.__wosKernel hook and from the kernel's own handlers
// (dock.registerSettings → dock.schemaChanged, dock.setSetting → dock.settingChanged).
// (The layout posts its own events to the frames it attached — TODO 1C.4.)
// Run: node testing/scripts/security/verify-kernel-broadcast.mjs   (OS dev server on :8080)
import { launch, bootOS, addFrame, check, finish, sleep, pollFor, startServer, askAll, IPC_PROBE_SRCDOC } from './verify-kernel-lib.mjs';

const XO_PORT = 8097;
const server = await startServer(XO_PORT, {
  '/listen.html': { body: `<!doctype html><title>xo</title><script>window.__got = []; addEventListener('message', (e) => { if (e.data && e.data.type === 'wos-ipc-event') window.__got.push(e.data.event); });</script>` },
});
const browser = await launch();
const context = await browser.newContext();
const events = async (frame) => frame.evaluate(() => window.__events.map((e) => e.event + (e.fromTop ? '' : '(!top)')));
try {
  const page = await bootOS(context);
  const unreg = await addFrame(page, { name: 'kb-unreg', sandbox: 'allow-scripts', srcdoc: IPC_PROBE_SRCDOC });
  const wm = await addFrame(page, { name: 'kb-wm', sandbox: 'allow-scripts', srcdoc: IPC_PROBE_SRCDOC });
  const fsOnly = await addFrame(page, { name: 'kb-fs', sandbox: 'allow-scripts', srcdoc: IPC_PROBE_SRCDOC });
  const dock = await addFrame(page, { name: 'kb-dock', sandbox: 'allow-scripts', srcdoc: IPC_PROBE_SRCDOC });
  const nav = await addFrame(page, { name: 'kb-nav', sandbox: 'allow-scripts', srcdoc: IPC_PROBE_SRCDOC });
  // A registered sandbox nested in a same-origin frame, like ui.sandboxed-app inside a window.
  const holder = await addFrame(page, { name: 'kb-holder', srcdoc: '<!doctype html><body></body>' });
  await holder.evaluate((srcdoc) => {
    const f = document.createElement('iframe');
    f.name = 'kb-nested'; f.setAttribute('sandbox', 'allow-scripts'); f.srcdoc = srcdoc;
    document.body.appendChild(f);
  }, IPC_PROBE_SRCDOC);
  const nested = await pollFor(async () => page.frame({ name: 'kb-nested' }), 10000);
  await nested.waitForLoadState('load').catch(() => {});

  await page.evaluate(() => {
    const reg = (name, events, doc = document) => window.platform.host.registerIpcFrame(doc.querySelector(`iframe[name="${name}"]`).contentWindow, { id: 'verify:' + name, events });
    reg('kb-wm', ['wm.getWindows', 'wm.toggleWindow']);
    reg('kb-fs', ['fs.*']);
    reg('kb-dock', ['dock.*']);
    reg('kb-nav', ['wm.*']);
    reg('kb-nested', ['wm.*'], document.querySelector('iframe[name="kb-holder"]').contentDocument);
  });

  // 1) kernel copy, via the hook
  await page.evaluate(() => {
    window.__wosKernel.broadcastIpcEvent('wm.windowsChanged', [{ pid: 1, title: 'secret title' }]);
    window.__wosKernel.broadcastIpcEvent('dock.settingChanged', { key: 'k', value: 1 });
  });
  // 2) the kernel's own handlers broadcast dock.* events
  const rd = await askAll(dock, [
    ['d1', 'dock.registerSettings', { dockId: 'verify', schema: [{ key: 'k', label: 'K', type: 'toggle', value: false }] }],
    ['d2', 'dock.setSetting', { key: 'k', value: true }],
  ]);
  check('dock.* handlers answer the registered dock-namespace frame', rd.d1 && rd.d1.result === true && rd.d2 && rd.d2.result === true, rd);
  await sleep(500);

  const got = {
    unreg: await events(unreg), wm: await events(wm), fs: await events(fsOnly), dock: await events(dock),
    nested: await events(nested), nav: await events(nav),
  };
  const count = (list, ev) => list.filter((e) => e === ev).length;
  check('unregistered frame receives no broadcast', got.unreg.length === 0, got.unreg);
  check('frame with only fs.* receives no window titles or dock events', got.fs.length === 0, got.fs);
  check('wm-namespace frame (exact names only) receives wm.windowsChanged', count(got.wm, 'wm.windowsChanged') === 1, got.wm);
  check('wm-namespace frame does not receive dock.* events', got.wm.every((e) => !e.startsWith('dock.')), got.wm);
  check('dock-namespace frame receives the dock.* events and no wm.* events',
    count(got.dock, 'dock.settingChanged') === 2 && count(got.dock, 'dock.schemaChanged') === 1 && got.dock.every((e) => e.startsWith('dock.')), got.dock);
  check('registered frame nested in another frame is reached, from the top window', count(got.nested, 'wm.windowsChanged') === 1 && got.nested.every((e) => !e.endsWith('(!top)')), got.nested);

  // 3) a frame that goes away is dropped from the broadcast set (no throw, others still served)
  await page.evaluate(() => document.querySelector('iframe[name="kb-fs"]').remove());
  await wm.evaluate(() => { window.__events = []; });
  await page.evaluate(() => window.__wosKernel.broadcastIpcEvent('wm.windowsChanged', []));
  await sleep(500);
  check('broadcast after a registered frame was removed still reaches the others', (await events(wm)).length === 1);

  // 4) INFO: a *registered* frame that navigates keeps its WindowProxy, so it keeps receiving
  //    (residual risk, see report; D4's per-instance port fixes it in phase 2).
  await nav.evaluate((url) => { location.href = url; }, `http://127.0.0.1:${XO_PORT}/listen.html`);
  const navFrame = await pollFor(async () => page.frames().find((f) => f.url().startsWith(`http://127.0.0.1:${XO_PORT}/`)), 10000);
  if (navFrame) {
    await navFrame.waitForLoadState('load').catch(() => {});
    await page.evaluate(() => window.__wosKernel.broadcastIpcEvent('wm.windowsChanged', []));
    await sleep(800);
    console.log('INFO  registered frame navigated cross-origin received:', JSON.stringify(await navFrame.evaluate(() => window.__got)));
  }
} finally {
  await browser.close();
  server.close();
}
finish('verify-kernel-broadcast (1A.2)');
