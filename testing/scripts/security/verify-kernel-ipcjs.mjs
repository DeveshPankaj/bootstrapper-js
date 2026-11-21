// Verifies the /usr/lib/ipc.js client SDK (TODO 1A.1 follow-up, reported during 1B):
//  - a registered frame nested inside another frame (ui.sandboxed-app sits inside a window's
//    about:blank iframe) reaches the kernel bus — requests go up the ancestor chain;
//  - responses are accepted only from the OS window (ancestor / pinned), with random ids:
//    a forged response from a sibling frame, even with the right id, is ignored;
//  - wos-ipc-events are accepted from the kernel and same-origin OS realms, not from a sibling;
//  - an unregistered caller's call rejects with a timeout instead of hanging forever.
// Run: node testing/scripts/security/verify-kernel-ipcjs.mjs   (OS dev server on :8080; ~45 s)
import { launch, bootOS, addFrame, check, finish, sleep, pollFor } from './verify-kernel-lib.mjs';

const browser = await launch();
const context = await browser.newContext();
try {
  const page = await bootOS(context);
  const sdkSource = await page.evaluate(() => window.fs.readFileSync('/usr/lib/ipc.js', 'utf8'));
  check('vfs /usr/lib/ipc.js is the refreshed copy (ancestor chain + timeout)', sdkSource.includes('ancestorOrigins') && sdkSource.includes('TIMEOUT_MS'));
  await page.evaluate(() => {
    const fs = window.fs;
    if (!fs.existsSync('/home/user1/kipcjs')) fs.mkdirSync('/home/user1/kipcjs');
    fs.writeFileSync('/home/user1/kipcjs/a.txt', 'A-CONTENT');
  });

  // Builds an opaque srcdoc frame with the SDK inlined, the way the layout / ui.sandboxed-app do.
  const SRCDOC = (sdk) => `<!doctype html><html><head><script>${sdk.replace(/<\/script>/gi, '<\\/script>')}<\/script></head><body>sdk frame<script>
    window.__events = []; ipc.on('wm.windowsChanged', (d) => window.__events.push(d));
  <\/script></body></html>`;
  const srcdoc = SRCDOC(sdkSource);

  // 1) nested: top → same-origin holder (like a window iframe) → opaque sdk frame
  const holder = await addFrame(page, { name: 'kj-holder', srcdoc: '<!doctype html><body></body>' });
  await holder.evaluate((sd) => {
    const f = document.createElement('iframe');
    f.name = 'kj-nested'; f.setAttribute('sandbox', 'allow-scripts'); f.srcdoc = sd;
    document.body.appendChild(f);
  }, srcdoc);
  const nested = await pollFor(async () => {
    const f = page.frame({ name: 'kj-nested' });
    return f && (await f.evaluate(() => !!window.ipc).catch(() => false)) ? f : null;
  }, 10000);
  // 2) direct child of the OS window, like a dock
  const direct = await addFrame(page, { name: 'kj-direct', sandbox: 'allow-scripts', srcdoc });
  // 3) attacker sibling and an unregistered sdk frame
  const attacker = await addFrame(page, { name: 'kj-attacker', sandbox: 'allow-scripts', srcdoc: '<!doctype html><body>attacker</body>' });
  const unreg = await addFrame(page, { name: 'kj-unreg', sandbox: 'allow-scripts', srcdoc });

  await page.evaluate(() => {
    const nestedWin = document.querySelector('iframe[name="kj-holder"]').contentDocument.querySelector('iframe[name="kj-nested"]').contentWindow;
    const policy = (id) => ({ id, events: ['fs.readText', 'wm.getWindows'], fs: { read: ['/home/user1/kipcjs'] } });
    window.platform.host.registerIpcFrame(nestedWin, policy('verify:kj-nested'));
    window.platform.host.registerIpcFrame(document.querySelector('iframe[name="kj-direct"]').contentWindow, policy('verify:kj-direct'));
  });

  // The unregistered call starts now; it is checked at the end (30 s timeout).
  await unreg.evaluate(() => {
    window.__unreg = { state: 'pending', t0: Date.now() };
    ipc.fs.readText('/home/user1/kipcjs/a.txt').then((r) => { window.__unreg = { state: 'resolved', r }; },
      (e) => { window.__unreg = { state: 'rejected', msg: e.message, ms: Date.now() - window.__unreg.t0 }; });
  });

  const call = (frame, fn) => frame.evaluate(fn).catch((e) => 'eval: ' + e.message);
  const r1 = await call(nested, () => ipc.fs.readText('/home/user1/kipcjs/a.txt').then((r) => 'ok: ' + r, (e) => 'err: ' + e.message));
  check('registered frame nested inside another frame reaches the bus', r1 === 'ok: A-CONTENT', r1);
  const r2 = await call(direct, () => ipc.call('wm.getWindows').then((r) => 'ok: ' + Array.isArray(r), (e) => 'err: ' + e.message));
  check('registered direct child (dock-like) still works', r2 === 'ok: true', r2);
  const r3 = await call(nested, () => ipc.fs.readText('/home/user1/secret.txt').then((r) => 'ok: ' + r, (e) => 'err: ' + e.message));
  check('policy still enforced through the SDK', typeof r3 === 'string' && r3.startsWith('err:') && r3.includes('permission denied'), r3);

  // Forged response with the right id, from a sibling: make the unregistered frame's next id
  // predictable, then let the attacker answer it. Nothing legitimate ever answers it.
  await unreg.evaluate(() => {
    crypto.getRandomValues = (a) => { a.fill(7); return a; };
    window.__forged = 'pending';
    ipc.call('wm.getWindows').then((r) => { window.__forged = 'resolved: ' + JSON.stringify(r); }, (e) => { window.__forged = 'rejected: ' + e.message; });
  });
  await page.evaluate(() => {
    const target = document.querySelector('iframe[name="kj-unreg"]').contentWindow;
    const attackerWin = document.querySelector('iframe[name="kj-attacker"]').contentWindow;
    attackerWin.postMessage({ relay: true }, '*');
    window.__kjTarget = target;
  });
  await attacker.evaluate(() => {
    const id = 'wos-' + '07'.repeat(16);
    parent.frames['kj-unreg'].postMessage({ type: 'wos-ipc-response', id, result: 'FORGED' }, '*');
  });
  await sleep(1000);
  const forged = await unreg.evaluate(() => window.__forged);
  check('forged wos-ipc-response from a sibling (right id) is ignored', forged === 'pending', forged);

  // Events: from the kernel → delivered; from a sibling → ignored; from a same-origin OS realm → delivered.
  await attacker.evaluate(() => {
    for (const name of ['kj-direct']) parent.frames[name].postMessage({ type: 'wos-ipc-event', event: 'wm.windowsChanged', data: 'FROM-ATTACKER' }, '*');
  });
  await page.evaluate(() => window.__wosKernel.broadcastIpcEvent('wm.windowsChanged', 'FROM-KERNEL'));
  await holder.evaluate(() => parent.document.querySelector('iframe[name="kj-direct"]').contentWindow.postMessage({ type: 'wos-ipc-event', event: 'wm.windowsChanged', data: 'FROM-OS-REALM' }, '*'));
  await sleep(500);
  const evDirect = await direct.evaluate(() => window.__events);
  const evNested = await nested.evaluate(() => window.__events);
  check('event from a sibling frame is ignored', !evDirect.includes('FROM-ATTACKER'), evDirect);
  check('event from the kernel broadcast is delivered (direct and nested frames)', evDirect.includes('FROM-KERNEL') && evNested.includes('FROM-KERNEL'), { evDirect, evNested });
  check('event from a same-origin OS realm (e.g. the layout bundle) is delivered', evDirect.includes('FROM-OS-REALM'), evDirect);

  // Unregistered caller: rejected with a timeout after ~30 s, not left hanging.
  const unregResult = await pollFor(async () => {
    const s = await unreg.evaluate(() => window.__unreg);
    return s.state !== 'pending' ? s : null;
  }, 40000, 1000);
  check('unregistered caller gets a timeout rejection (no reply from the bus)', unregResult && unregResult.state === 'rejected' && /timeout/i.test(unregResult.msg), unregResult);
} finally {
  await browser.close();
}
finish('verify-kernel-ipcjs (ipc.js SDK)');
