// Verifies TODO 1A.1 (audit KRN-1, WIN-7, NET-2, APP-9): the kernel's wos-ipc listener
// (src/kernel/ipc-bus.ts) answers only frames registered through registerIpcFrame, only
// for the events in their policy, with fs.* paths normalised and checked with path-policy
// isInside against the policy's read/write scopes; system paths are never writable; and
// unregistered senders get no reply at all.
// Run: node testing/scripts/security/verify-kernel-ipc.mjs   (OS dev server on :8080)
// Exit 0 = all checks passed. (spike-ipc-exploit.mjs covers the cross-site opener/popup paths.)
import { launch, bootOS, addFrame, check, finish, askAll, IPC_PROBE_SRCDOC, sleep } from './verify-kernel-lib.mjs';

const ROOT = '/home/user1/kipc';
const browser = await launch();
const context = await browser.newContext();
try {
  const page = await bootOS(context);
  await page.evaluate((root) => {
    const fs = window.fs;
    for (const d of [root, root + '/allowed', root + '/allowed/out', root + '/allowedX']) if (!fs.existsSync(d)) fs.mkdirSync(d);
    fs.writeFileSync(root + '/secret.txt', 'SECRET-CONTENT');
    fs.writeFileSync(root + '/allowed/a.txt', 'ALLOWED-CONTENT');
    fs.writeFileSync(root + '/allowedX/b.txt', 'SIBLING-CONTENT');
    try { fs.unlinkSync(root + '/allowed/out/w.txt'); } catch (_) {}
  }, ROOT);

  // --- the hook ---
  const hook = await page.evaluate(() => {
    const d = Object.getOwnPropertyDescriptor(window, '__wosKernel');
    return { exists: !!d, configurable: d && d.configurable, writable: d && d.writable, frozen: Object.isFrozen(window.__wosKernel),
      members: Object.keys(window.__wosKernel || {}).sort() };
  });
  check('hook: window.__wosKernel is frozen, non-writable, non-configurable', hook.exists && !hook.configurable && !hook.writable && hook.frozen, hook);

  // --- A: unregistered opaque frame gets nothing ---
  const a = await addFrame(page, { name: 'kipc-a', sandbox: 'allow-scripts', srcdoc: IPC_PROBE_SRCDOC });
  const ra = await askAll(a, [
    ['a1', 'fs.readText', { path: ROOT + '/secret.txt' }],
    ['a2', 'fs.write', { path: '/tmp/kipc-pwned.txt', content: 'x' }],
    ['a3', 'wm.getWindows', {}],
    ['a4', 'no.such.event', {}],
  ], 2500);
  check('A unregistered sandboxed frame: no reply at all', Object.keys(ra).length === 0, ra);
  check('A unregistered sandboxed frame: fs.write had no effect', !(await page.evaluate(() => window.fs.existsSync('/tmp/kipc-pwned.txt'))));

  // --- B: registered frame, policy enforced ---
  const b = await addFrame(page, { name: 'kipc-b', sandbox: 'allow-scripts', srcdoc: IPC_PROBE_SRCDOC });
  await page.evaluate((root) => {
    const f = document.querySelector('iframe[name="kipc-b"]');
    window.__kipcUnregB = window.platform.host.registerIpcFrame(f.contentWindow, {
      id: 'verify:kipc-b',
      events: ['fs.readText', 'fs.list', 'fs.write', 'fs.exists', 'wm.getWindows'],
      fs: { read: [root + '/allowed'], write: [root + '/allowed/out', '/etc/kipc-test'] },
    });
  }, ROOT);
  const rb = await askAll(b, [
    ['b1', 'fs.readText', { path: ROOT + '/allowed/a.txt' }],
    ['b2', 'fs.readText', { path: ROOT + '/allowed/../secret.txt' }],
    ['b3', 'fs.readText', { path: ROOT + '/allowedX/b.txt' }],
    ['b4', 'fs.readText', { path: ROOT + '/secret.txt' }],
    ['b5', 'fs.write', { path: ROOT + '/allowed/out/w.txt', content: 'WRITTEN' }],
    ['b6', 'fs.write', { path: ROOT + '/allowed/a.txt', content: 'OVERWRITTEN' }],
    ['b7', 'fs.write', { path: '/etc/kipc-test/x.txt', content: 'SYSTEM' }],
    ['b8', 'fs.rm', { path: ROOT + '/allowed/a.txt' }],
    ['b9', 'fs.stat', { path: ROOT + '/allowed/a.txt' }],
    ['b10', 'wm.getWindows', {}],
    ['b11', 'fs.readText', { path: 'home/user1/kipc/allowed/a.txt' }],
    ['b12', 'fs.list', { path: ROOT + '/allowed' }],
    ['b13', 'fs.readText', { path: ROOT + '/allowed/a.txt\u0000' }],
    ['b14', 'fs.readText', { path: ROOT + '/allowed//./a.txt' }],
    ['b15', 'fs.exists', { path: '/home/user1' }],
    ['b16', 'fs.readText', null],
  ]);
  const ok = (r) => r && r.error === undefined;
  const denied = (r) => r && typeof r.error === 'string';
  check('B1 read inside read scope', ok(rb.b1) && rb.b1.result === 'ALLOWED-CONTENT', rb.b1);
  check('B1 reply comes from the parent (kernel) window', rb.b1 && rb.b1.fromParent, rb.b1 && rb.b1.origin);
  check('B2 ../ traversal out of scope denied', denied(rb.b2) && !String(rb.b2.result).includes('SECRET'), rb.b2);
  check('B3 sibling with common prefix (allowedX) denied', denied(rb.b3), rb.b3);
  check('B4 read outside scope denied', denied(rb.b4), rb.b4);
  check('B5 write inside write scope allowed', ok(rb.b5) && rb.b5.result === true, rb.b5);
  const disk = await page.evaluate((root) => ({
    w: window.fs.existsSync(root + '/allowed/out/w.txt') ? window.fs.readFileSync(root + '/allowed/out/w.txt', 'utf8') : null,
    a: window.fs.readFileSync(root + '/allowed/a.txt', 'utf8'),
    etc: window.fs.existsSync('/etc/kipc-test/x.txt'),
  }), ROOT);
  check('B5 written file on disk', disk.w === 'WRITTEN', disk);
  check('B6 write into read-only scope denied, file unchanged', denied(rb.b6) && disk.a === 'ALLOWED-CONTENT', rb.b6);
  check('B7 write to a system path denied even when in the write scope', denied(rb.b7) && /system path/.test(rb.b7.error) && !disk.etc, rb.b7);
  check('B8 event not in policy (fs.rm) refused', denied(rb.b8) && /not permitted/.test(rb.b8.error), rb.b8);
  check('B9 event not in policy (fs.stat) refused', denied(rb.b9) && /not permitted/.test(rb.b9.error), rb.b9);
  check('B10 wm.getWindows allowed', ok(rb.b10) && Array.isArray(rb.b10.result), rb.b10 && rb.b10.error);
  check('B11 relative path refused', denied(rb.b11), rb.b11);
  check('B12 list inside read scope', ok(rb.b12) && Array.isArray(rb.b12.result) && rb.b12.result.includes('a.txt'), rb.b12);
  check('B13 NUL in path refused', denied(rb.b13), rb.b13);
  check('B14 // and ./ normalised, still inside scope', ok(rb.b14) && rb.b14.result === 'ALLOWED-CONTENT', rb.b14);
  check('B15 exists outside read scope denied', denied(rb.b15), rb.b15);
  check('B16 missing data refused without crashing', denied(rb.b16), rb.b16);

  // --- C: registration made from another realm (a same-origin helper iframe, like the
  //        layout/module bundles) reaches the kernel's registry ---
  const c = await addFrame(page, { name: 'kipc-c', sandbox: 'allow-scripts', srcdoc: IPC_PROBE_SRCDOC });
  const helper = await addFrame(page, { name: 'kipc-helper', srcdoc: '<!doctype html><body>helper</body>' });
  await helper.evaluate((root) => {
    const target = parent.document.querySelector('iframe[name="kipc-c"]').contentWindow;
    window.__unreg = parent.__wosKernel.registerIpcFrame(target, { id: 'verify:kipc-c', events: ['fs.*'], fs: { read: [root + '/allowed'] } });
  }, ROOT);
  const rc = await askAll(c, [['c1', 'fs.readText', { path: ROOT + '/allowed/a.txt' }], ['c2', 'fs.write', { path: ROOT + '/allowed/a.txt', content: 'x' }], ['c3', 'wm.getWindows', {}]]);
  check('C cross-realm registration works (fs.* prefix rule)', ok(rc.c1) && rc.c1.result === 'ALLOWED-CONTENT', rc.c1);
  check('C prefix rule still path-checked (no write scope)', denied(rc.c2), rc.c2);
  check('C event outside the prefix refused', denied(rc.c3), rc.c3);

  // --- D: unregister → silence again ---
  await helper.evaluate(() => window.__unreg());
  await c.evaluate(() => { window.__resp = {}; });
  const rd = await askAll(c, [['d1', 'fs.readText', { path: ROOT + '/allowed/a.txt' }]], 2000);
  check('D after unregister: no reply', Object.keys(rd).length === 0, rd);

  // --- E: a registered frame's sibling can't use its registration ---
  const e = await addFrame(page, { name: 'kipc-e', sandbox: 'allow-scripts', srcdoc: IPC_PROBE_SRCDOC });
  const re = await askAll(e, [['e1', 'fs.readText', { path: ROOT + '/allowed/a.txt' }]], 2000);
  check('E unregistered sibling of a registered frame: no reply', Object.keys(re).length === 0, re);

  // --- F: wm.launch only launches offered launch items ---
  const f = await addFrame(page, { name: 'kipc-f', sandbox: 'allow-scripts', srcdoc: IPC_PROBE_SRCDOC });
  await page.evaluate(() => {
    const fr = document.querySelector('iframe[name="kipc-f"]');
    window.platform.host.registerIpcFrame(fr.contentWindow, { id: 'verify:kipc-f', events: ['wm.launch', 'wm.getLaunchItems'] });
  });
  const rf1 = await askAll(f, [['f0', 'wm.getLaunchItems', {}], ['f1', 'wm.launch', { name: 'ui.iframe' }], ['f2', 'wm.launch', { name: '../evil' }]]);
  const items = (rf1.f0 && rf1.f0.result) || [];
  check('F wm.launch of a command that is not a launch item refused', denied(rf1.f1) && denied(rf1.f2), { f1: rf1.f1, f2: rf1.f2 });
  if (items.length) {
    const before = await page.evaluate(() => document.querySelectorAll('.window').length);
    const rf2 = await askAll(f, [['f3', 'wm.launch', { name: items[0].name }]], 2500);
    const after = await page.evaluate(() => document.querySelectorAll('.window').length);
    check(`F wm.launch of launch item "${items[0].name}" still works`, ok(rf2.f3) && rf2.f3.result === true, { reply: rf2.f3, windowsBefore: before, windowsAfter: after });
  } else {
    check('F wm.getLaunchItems returned items', false, rf1.f0);
  }

  // --- G (informational): do the layout's dock frames answer? (registered by the layout, 1C.4) ---
  const dock = page.frames().find((fr) => fr.name() === '' && fr.parentFrame() === page.mainFrame() && fr.url() === 'about:srcdoc');
  const dockFrame = await page.evaluate(() => !!document.getElementById('vfs-dock-iframe'));
  if (dockFrame) {
    const dockHandle = await page.$('#vfs-dock-iframe');
    const df = await dockHandle.contentFrame();
    const r = await df.evaluate(() => new Promise((res) => {
      if (!window.ipc) return res('no window.ipc in dock');
      const t = setTimeout(() => res('no reply (dock not registered yet)'), 2500);
      window.ipc.call('wm.getWindows').then((w) => { clearTimeout(t); res('answered: ' + (Array.isArray(w) ? w.length + ' windows' : typeof w)); }, (err) => { clearTimeout(t); res('error: ' + err.message); });
    })).catch((err) => 'eval failed: ' + err.message);
    console.log(`INFO  dock frame wm.getWindows → ${r}`);
  } else {
    console.log(`INFO  no dock frame mounted (${dock ? 'srcdoc frames present' : 'none'})`);
  }
  await sleep(100);
} finally {
  await browser.close();
}
finish('verify-kernel-ipc (1A.1)');
