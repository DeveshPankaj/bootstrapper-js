// verify-layout-frames.mjs — TODO 1C.4 (audit WIN-7, KRN-13): the layout's own
// frames (dock srcdoc, canvas wallpaper) are registered with narrow IPC
// policies, layout events reach only them, wm.launch is limited to the
// advertised launch items, and a frame that navigates away is torn down.
//
//   node testing/scripts/security/verify-layout-frames.mjs
//
// Checks that depend on the kernel lock (TODO 1A.1: the bus
// answers only registered frames) are reported as SKIP until it lands.
import { launch, bootOS, addFrame, removeFrame, writeVfs } from './spike-lib.mjs';

const results = [];
const check = (id, ok, detail = '') => {
  results.push({ id, status: ok === null ? 'SKIP' : ok ? 'PASS' : 'FAIL', detail });
  console.log(`${ok === null ? 'SKIP' : ok ? 'PASS' : 'FAIL'}  ${id}${detail ? '  — ' + detail : ''}`);
};

const dockFrame = async (page) => {
  const el = await page.$('#vfs-dock-iframe');
  return el ? el.contentFrame() : null;
};

const windowCount = (page) => page.evaluate(() => window.platform.host.callCommand('process.list').length);

// ipc.call from inside an opaque frame (window.ipc comes from /usr/lib/ipc.js,
// which the layout inlines into the dock srcdoc). Times out instead of hanging
// when the bus doesn't answer (that is what an unregistered sender gets).
const ipcFrom = (frame, event, data, ms = 2500) => frame.evaluate(({ event, data, ms }) => {
  const call = window.ipc
    ? window.ipc.call(event, data)
    : new Promise((resolve, reject) => {
        const id = 'probe-' + Math.random().toString(36).slice(2);
        window.addEventListener('message', function on(e) {
          if (!e.data || e.data.type !== 'wos-ipc-response' || e.data.id !== id) return;
          window.removeEventListener('message', on);
          e.data.error ? reject(new Error(e.data.error)) : resolve(e.data.result);
        });
        parent.postMessage({ type: 'wos-ipc', id, event, data }, '*');
      });
  return Promise.race([
    call.then((r) => ({ ok: true, result: typeof r === 'string' ? r.slice(0, 80) : r }), (e) => ({ ok: false, error: String(e.message || e) })),
    new Promise((r) => setTimeout(() => r({ ok: false, error: 'timeout (no answer)' }), ms)),
  ]);
}, { event, data, ms });

const PROBE_SRCDOC = `<script>
  window.__got = [];
  addEventListener('message', (e) => { if (e.data && (e.data.type === 'wos-ipc-event' || e.data.t)) window.__got.push(e.data.event || e.data.t); });
</script>`;

const browser = await launch();
try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await bootOS(context);
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  // ── Is the kernel lock (1A.1) in place? An unregistered opaque frame asks for a file.
  const stranger = await addFrame(page, { name: 'stranger', sandbox: 'allow-scripts', srcdoc: PROBE_SRCDOC });
  const strangerRead = await ipcFrom(stranger, 'fs.readText', { path: '/etc/managers.json' });
  const kernelLocked = !strangerRead.ok;
  console.log(`info  kernel lock (1A.1) ${kernelLocked ? 'active' : 'NOT active yet'} — unregistered frame read: ${JSON.stringify(strangerRead)}`);

  // Same-origin probe too: broadcasts used to go to every iframe in the top document.
  await page.evaluate((srcdoc) => {
    const f = document.createElement('iframe');
    f.name = 'probe-same-origin'; f.srcdoc = srcdoc; f.style.cssText = 'position:fixed;width:1px;height:1px;left:0;top:0;opacity:0';
    document.body.appendChild(f);
  }, PROBE_SRCDOC);
  await page.waitForTimeout(500);
  const sameOrigin = page.frame({ name: 'probe-same-origin' });

  // ── Dock: default dock is up and populated (getLaunchItems/getWindows answered)
  let dock = await dockFrame(page);
  check('dock frame present', !!dock);
  await page.waitForTimeout(800);
  const dockItems = dock ? await dock.evaluate(() => document.querySelectorAll('#dock .item').length) : 0;
  check('dock renders launch items', dockItems > 0, `${dockItems} items`);
  await dock.evaluate(() => {
    window.__evts = [];
    addEventListener('message', (e) => { if (e.data && e.data.type === 'wos-ipc-event') window.__evts.push(e.data.event); });
  });

  // Dock policy: own settings file readable, anything else refused (kernel-enforced).
  await writeVfs(page, { '/etc/dock/default.json': '{"verify":"dock-settings"}' });
  const ownSettings = await ipcFrom(dock, 'fs.readText', { path: '/etc/dock/default.json' });
  check('dock reads its own /etc/dock/default.json', ownSettings.ok && String(ownSettings.result).includes('dock-settings'), JSON.stringify(ownSettings));
  const otherFile = await ipcFrom(dock, 'fs.readText', { path: '/etc/managers.json' });
  check('dock cannot read /etc/managers.json', kernelLocked ? !otherFile.ok : null, JSON.stringify(otherFile));
  const traversal = await ipcFrom(dock, 'fs.readText', { path: '/etc/dock/../managers.json' });
  check('dock cannot read /etc/dock/../managers.json', kernelLocked ? !traversal.ok : null, JSON.stringify(traversal));
  const writeTry = await ipcFrom(dock, 'fs.write', { path: '/etc/dock/default.json', content: 'x' });
  check('dock cannot fs.write', kernelLocked ? !writeTry.ok : null, JSON.stringify(writeTry));

  // ── A real click on a dock item opens its app (dock is pinned visible while no window is open)
  const beforeClick = await windowCount(page);
  await dock.locator('#dock .item').nth(1).click({ force: true });
  await page.waitForTimeout(1500);
  const afterClick = await windowCount(page);
  check('clicking a dock item opens a window', afterClick === beforeClick + 1, `windows ${beforeClick} → ${afterClick}`);
  await page.evaluate(() => window.platform.host.callCommand('process.list').forEach((p) => window.platform.host.callCommand('process.kill', p.pid)));
  await page.waitForTimeout(500);

  // ── wm.launch: only advertised launch items
  const launchNames = await page.evaluate(() => window.__wosWmBridge.getLaunchItems().map((i) => i.name));
  const notOffered = await page.evaluate((offered) => {
    for (const n of ['ui.task-manager', 'ui.iframe', 'ui.imageviewer', 'ui.markdown', 'set-layout']) {
      if (!offered.includes(n) && window.platform.host.getCommand(n)) return n;
    }
    return null;
  }, launchNames);
  const before = await windowCount(page);
  await ipcFrom(dock, 'wm.launch', { name: notOffered });
  await page.waitForTimeout(800);
  const afterRefused = await windowCount(page);
  check('wm.launch refuses a command that is not a launch item', afterRefused === before, `${notOffered}: windows ${before} → ${afterRefused}`);
  // The layout's bridge refuses on its own too (the kernel's handler checks first).
  await page.evaluate((n) => window.__wosWmBridge.launch(n), notOffered);
  await page.waitForTimeout(800);
  const afterBridge = await windowCount(page);
  check('layout bridge launch() refuses a non-launch item', afterBridge === before, `${notOffered}: windows ${before} → ${afterBridge}`);
  const offered = launchNames.includes('explorer') ? 'explorer' : launchNames.find((n) => n !== 'ui.app-drawer');
  await ipcFrom(dock, 'wm.launch', { name: offered });
  await page.waitForTimeout(1500);
  const afterLaunch = await windowCount(page);
  check('wm.launch opens an advertised launch item', afterLaunch === before + 1, `${offered}: windows ${before} → ${afterLaunch}`);

  // ── Window-list events reach the dock only
  const dockEvts = await dock.evaluate(() => window.__evts.slice());
  check('dock receives wm.windowsChanged', dockEvts.includes('wm.windowsChanged'), dockEvts.join(','));
  // Events the layout posts itself vs. ones the kernel broadcasts from its own
  // handlers (dock.registerSettings → dock.schemaChanged: kernel TODO 1A.2).
  const LAYOUT_EVENTS = ['wm.windowsChanged', 'dock.settingChanged', 'mouse', 'windows'];
  const strangerGot = await stranger.evaluate(() => window.__got.slice());
  const sameOriginGot = sameOrigin ? await sameOrigin.evaluate(() => window.__got.slice()) : ['probe missing'];
  const layoutLeaks = (got) => got.filter((e) => LAYOUT_EVENTS.includes(e) || e === 'probe missing');
  check('unregistered opaque frame receives no layout events', layoutLeaks(strangerGot).length === 0, strangerGot.join(',') || 'none');
  check('unregistered same-origin frame receives no layout events', layoutLeaks(sameOriginGot).length === 0, sameOriginGot.join(',') || 'none');
  const kernelLeaks = [...strangerGot, ...sameOriginGot].filter((e) => !LAYOUT_EVENTS.includes(e));
  check('(kernel 1A.2) no kernel broadcasts to unregistered frames', kernelLeaks.length === 0 ? true : null,
    kernelLeaks.length ? `still broadcast: ${[...new Set(kernelLeaks)].join(',')} — src/kernel/ipc-bus.ts broadcastIpcEvent` : 'none');
  const dockRunning = await dock.evaluate(() => document.querySelectorAll('#dock .item.running').length);
  check('dock shows the running window', dockRunning > 0, `${dockRunning} running`);

  // ── Dock settings are written to the open dock's file, not a dockId the dock reports
  const reg = await ipcFrom(dock, 'dock.registerSettings', { dockId: '../../etc/pwned', schema: [{ key: 'x', label: 'x', type: 'toggle', value: false }] });
  const setRes = await page.evaluate(() => window.platform.host.callCommand('set-dock-setting', { key: 'x', value: true }));
  const pwned = await page.evaluate(() => window.fs.existsSync('/etc/pwned.json'));
  check('set-dock-setting ignores a forged dockId', !pwned && setRes === false, `registerSettings ${JSON.stringify(reg)}, set → ${setRes}, /etc/pwned.json exists: ${pwned}`);

  // ── Dock ids are validated before building /opt/apps/dock/<id>.html
  await writeVfs(page, { '/home/user1/evil-dock.html': '<p id="evil">evil</p>' });
  await page.evaluate(() => window.platform.host.callCommand('open-vfs-dock', '../../../home/user1/evil-dock'));
  await page.waitForTimeout(500);
  const traversalDock = await page.evaluate(() => !!document.getElementById('vfs-dock-iframe'));
  check('open-vfs-dock rejects a traversal id', !traversalDock);

  // ── Switch docks (Settings → Managers does the same call); gnome renders
  await page.evaluate(() => window.platform.host.callCommand('open-vfs-dock', 'gnome'));
  await page.waitForTimeout(1500);
  dock = await dockFrame(page);
  const gnomeItems = dock ? await dock.evaluate(() => document.querySelectorAll('#dock .item').length) : 0;
  check('gnome dock renders after switching', gnomeItems > 0, `${gnomeItems} items`);

  // ── A dock that navigates away is closed and unregistered
  await dock.evaluate(() => { window.__keep = window.ipc; location.href = 'about:blank'; }).catch(() => {});
  await page.waitForTimeout(1200);
  const dockGone = await page.evaluate(() => !document.getElementById('vfs-dock-iframe'));
  check('dock that navigates away is torn down', dockGone);
  await page.evaluate(() => window.platform.host.callCommand('open-vfs-dock', 'default'));
  await page.waitForTimeout(1500);
  dock = await dockFrame(page);
  const restored = dock ? await dock.evaluate(() => document.querySelectorAll('#dock .item').length) : 0;
  check('default dock reopens', restored > 0, `${restored} items`);

  // ── Canvas wallpaper: registered with no events, still gets pointer + window count
  await writeVfs(page, { '/tmp/verify-wp.js': 'export function render(canvas, api) { window.__wpApi = api; }' });
  await page.evaluate(() => window.platform.host.callCommand('set-wallpaper', 'canvas:/tmp/verify-wp.js'));
  await page.waitForTimeout(1500);
  const wpEl = await page.$('#canvas-wallpaper-iframe');
  const wp = wpEl ? await wpEl.contentFrame() : null;
  check('canvas wallpaper frame present', !!wp);
  // Over empty desktop (the Explorer window opened above covers ~140–940 × 90–570;
  // the probe frames sit bottom-right, so drop them first).
  await removeFrame(page, 'stranger');
  await removeFrame(page, 'probe-same-origin');
  await page.mouse.move(1250, 700);
  await page.mouse.move(1260, 710);
  await page.waitForTimeout(400);
  const wpState = wp ? await wp.evaluate(() => window.__wpApi && { mouse: { ...window.__wpApi.mouse }, count: window.__wpApi.windows.count }) : null;
  check('wallpaper receives pointer position', !!wpState && wpState.mouse.active === true, JSON.stringify(wpState));
  check('wallpaper receives window count', !!wpState && wpState.count === (await windowCount(page)), JSON.stringify(wpState));
  const wpRead = wp ? await ipcFrom(wp, 'fs.readText', { path: '/etc/managers.json' }) : null;
  check('wallpaper gets no fs', kernelLocked ? !!wpRead && !wpRead.ok : null, JSON.stringify(wpRead));
  const wpLaunch = wp ? await ipcFrom(wp, 'wm.getWindows', {}) : null;
  check('wallpaper gets no wm.*', kernelLocked ? !!wpLaunch && !wpLaunch.ok : null, JSON.stringify(wpLaunch));
  await wp.evaluate(() => { location.href = 'about:blank'; }).catch(() => {});
  await page.waitForTimeout(1200);
  const wpGone = await page.evaluate(() => !document.getElementById('canvas-wallpaper-iframe'));
  check('wallpaper that navigates away is torn down', wpGone);
  await page.evaluate(() => window.platform.host.callCommand('set-wallpaper', '/public/wp-11.jpg'));

  check('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.screenshot({ path: 'testing/screenshots/verify-layout-frames.png' });
} finally {
  await browser.close();
}

const failed = results.filter((r) => r.status === 'FAIL');
console.log(`\n${results.filter((r) => r.status === 'PASS').length} pass, ${failed.length} fail, ${results.filter((r) => r.status === 'SKIP').length} skip`);
process.exit(failed.length ? 1 : 0);
