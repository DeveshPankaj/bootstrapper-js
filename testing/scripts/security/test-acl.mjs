// KRN-5 (+ I4) and WIN-10 — the per-app Namespace ACL normalises paths, is deny-by-default for
// other apps' data, never grants kernel-owned paths, and isn't mutable through window props.
//
//   KRN-5  Namespace.checkWrite('/tmp/../etc/crontab') and friends throw (traversal, //, NUL)
//   KRN-5  another app's ~/.local/share/<id> is unreadable
//   KRN-5  kernel-owned paths (I4) — incl. the app's own /opt/apps/<id> — are not writable
//   KRN-5  /tmp is per app (/tmp/<id>), /var/log not world-writable
//   KRN-5  an id like ../../etc gets no write scope
//   KRN-5  ProxyFS and a real app's AppSDK port (snake-game) refuse the same traversal / secret read
//   WIN-10 window props don't hand out a live, mutable namespace that widens the app's ACL
import { newSession, boot, openWindow, ensureApp, findFrame, step, report, done, sleep, pollFor, vfsWrite, vfsExists, closeAllWindows } from './lib/harness.mjs';

const SECRET = 'SEC-ACL-SECRET-' + Math.random().toString(36).slice(2);
const S = await newSession();
try {
  const page = await boot(S.context);
  await vfsWrite(page, { '/home/user1/.local/share/remote-machines/connections.json': JSON.stringify([{ host: 'x', password: SECRET }]) });

  // checks run in the top page against the live ProcessManager / Namespace classes
  const nsCheck = (id, kind, paths) => page.evaluate(({ id, kind, paths }) => {
    const pm = (window.platform.host.getProcessManager && window.platform.host.getProcessManager()) || window.__wosProcessManager;
    let ns;
    try { ns = pm.spawn(id, { label: 'sec-acl' }); } catch (e) { return { spawnThrew: String(e.message || e).slice(0, 100) }; }
    const out = {};
    for (const p of paths) { try { ns[kind](p); out[p] = 'ALLOWED'; } catch (e) { out[p] = 'denied'; } }
    try { pm.kill(ns.pid); } catch (_) {}
    return { pid: ns.pid, appDir: ns.appDir, out };
  }, { id, kind, paths });
  const allDenied = (r) => !!r && (!!r.spawnThrew || Object.values(r.out).every((v) => v === 'denied'));
  const allowedOf = (r) => r && r.out ? Object.entries(r.out).filter(([, v]) => v === 'ALLOWED').map(([k]) => k.replace('\u0000', '\\0')) : [];

  await step('KRN-5', 'namespace-traversal-write-denied', async () => {
    const r = await nsCheck('sec-acl-app', 'checkWrite', ['/tmp/../etc/crontab', '/tmp//../etc/crontab', '/tmp/sec-acl-app/../../etc/widgets/x.js',
      '/home/user1/.local/share/sec-acl-app/../../../../etc/crontab', '/home/user1/.local/share/sec-acl-app/x\u0000/../../../../../etc/crontab']);
    return { pass: allDenied(r), detail: `allowed=${JSON.stringify(allowedOf(r))}` };
  });
  await step('KRN-5', 'namespace-foreign-app-data-unreadable', async () => {
    const r = await nsCheck('sec-acl-app', 'checkRead', ['/home/user1/.local/share/remote-machines/connections.json', '/home/user1/.local/share/remote-machines/secrets.json', '/home/user1/.local/share/sec-acl-app/../remote-machines/connections.json']);
    return { pass: allDenied(r), detail: `allowed=${JSON.stringify(allowedOf(r))}` };
  });
  await step('KRN-5', 'namespace-kernel-owned-not-writable', async () => {
    const r = await nsCheck('sec-acl-app', 'checkWrite', ['/etc/crontab', '/opt/window-manager.js', '/bin/sec.run', '/usr/bin/sec.js', '/meta.json', '/.initd.run', '/home/user1/initd.run', '/opt/apps/sec-acl-app/main.js']);
    return { pass: allDenied(r), detail: `allowed=${JSON.stringify(allowedOf(r))}` };
  });
  await step('KRN-5', 'namespace-tmp-per-app', async () => {
    const r = await nsCheck('sec-acl-app', 'checkWrite', ['/tmp/other-app/x', '/tmp/x', '/var/log/sec.log']);
    const own = await nsCheck('sec-acl-app', 'checkWrite', ['/tmp/sec-acl-app/x', '/home/user1/.local/share/sec-acl-app/x']);
    return { pass: allDenied(r), detail: `shared allowed=${JSON.stringify(allowedOf(r))}; own dirs=${JSON.stringify(own && own.out)}` };
  });
  await step('KRN-5', 'namespace-bad-id-no-write-scope', async () => {
    const r = await nsCheck('../../etc', 'checkWrite', ['/etc/crontab', '/opt/apps/../../etc/crontab', '/etc/widgets/x.js']);
    return { pass: allDenied(r), detail: r.spawnThrew ? 'spawn refused: ' + r.spawnThrew : `appDir=${r.appDir}; allowed=${JSON.stringify(allowedOf(r))}` };
  });

  await step('KRN-5', 'proxyfs-refuses-traversal-and-secret', async () => {
    const r = await page.evaluate(async (SECRET) => {
      const host = window.platform.host;
      const pm = (host.getProcessManager && host.getProcessManager()) || window.__wosProcessManager;
      const ns = pm.spawn('sec-acl-proxy', { label: 'sec-acl-proxy' });
      const pfs = host.getProxyFs(ns.pid);
      if (!pfs) return { err: 'no ProxyFS for pid' };
      const out = {};
      try { await pfs.writeText('/tmp/../etc/sec-acl-proxy.txt', 'x'); out.write = 'ALLOWED'; } catch (e) { out.write = 'denied'; }
      try { const t = await pfs.readText('/home/user1/.local/share/remote-machines/connections.json'); out.read = t.includes(SECRET) ? 'LEAKED' : 'read-other'; } catch (e) { out.read = 'denied'; }
      out.onDisk = window.fs.existsSync('/etc/sec-acl-proxy.txt');
      try { pm.kill(ns.pid); } catch (_) {}
      return out;
    }, SECRET);
    if (r.err) return { pass: null, detail: r.err };
    return { pass: r.write === 'denied' && r.read === 'denied' && !r.onDisk, detail: JSON.stringify(r) };
  });

  await step('KRN-5', 'appsdk-port-refuses-traversal-and-secret', async () => {
    if (!(await ensureApp(page, 'snake-game', 'ui.snake-game'))) return { pass: null, detail: 'snake-game could not be installed' };
    await openWindow(page, 'ui.snake-game');
    const f = await findFrame(page, { urlPart: 'snake-game/', predicate: () => !!window.AppSDK, timeout: 30000 });
    if (!f) return { pass: null, detail: 'snake-game AppSDK frame not found' };
    await sleep(1500);
    const r = await f.evaluate(async (SECRET) => {
      const t = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))]);
      const out = {};
      try { await t(window.AppSDK.writeText('/tmp/../etc/sec-acl-sdk.txt', 'x')); out.write = 'ALLOWED'; } catch (e) { out.write = 'denied: ' + e.message.slice(0, 60); }
      try { const s = await t(window.AppSDK.readText('/home/user1/.local/share/remote-machines/connections.json')); out.read = String(s).includes(SECRET) ? 'LEAKED' : 'read-other'; } catch (e) { out.read = 'denied: ' + e.message.slice(0, 60); }
      try { await t(window.AppSDK.writeText('/opt/window-manager.js', '// sec')); out.kernel = 'ALLOWED'; } catch (e) { out.kernel = 'denied: ' + e.message.slice(0, 40); }
      return out;
    }, SECRET);
    const onDisk = await vfsExists(page, '/etc/sec-acl-sdk.txt');
    const wm = await page.evaluate(() => { try { return window.fs.readFileSync('/opt/window-manager.js', 'utf8') === '// sec'; } catch (_) { return false; } });
    await closeAllWindows(page);
    const timedOut = [r.write, r.read].every((v) => /timeout/.test(v));
    if (timedOut) return { pass: null, detail: 'AppSDK calls never answered: ' + JSON.stringify(r) };
    return { pass: /^denied/.test(r.write) && /^denied/.test(r.read) && /^denied/.test(r.kernel) && !onDisk && !wm, detail: `${JSON.stringify(r)}; /etc/sec-acl-sdk.txt=${onDisk}; window-manager.js overwritten=${wm}` };
  });

  // ── WIN-10: props.namespace / props.proxyFs ───────────────────────────────
  await step('WIN-10', 'props-cannot-widen-acl', async () => {
    await page.evaluate(() => {
      window.platform.host.registerCommand('sec.win10', (body, props) => { window.__secWin10Props = props; props.setWindowView(true); }, { title: 'sec win10' });
    });
    await openWindow(page, 'sec.win10');
    await pollFor(() => page.evaluate(() => !!window.__secWin10Props), 8000);
    const r = await page.evaluate(async () => {
      const props = window.__secWin10Props;
      if (!props) return { err: 'props not captured' };
      const out = { namespaceExposed: !!props.namespace, proxyFsExposed: !!props.proxyFs };
      try { if (props.namespace) { const acl = props.namespace.acl || props.namespace._acl; if (acl && acl.push) { acl.push({ path: '/etc', read: true, write: true }); acl.unshift({ path: '/etc', read: true, write: true }); } out.aclPushed = !!acl; } } catch (e) { out.aclPushed = 'threw ' + e.message.slice(0, 40); }
      try { if (props.proxyFs) { await props.proxyFs.writeText('/etc/sec-win10.txt', 'x'); out.write = 'ALLOWED'; } } catch (e) { out.write = 'denied'; }
      out.onDisk = window.fs.existsSync('/etc/sec-win10.txt');
      return out;
    });
    await closeAllWindows(page);
    if (r.err) return { pass: null, detail: r.err };
    return { pass: !r.onDisk && r.write !== 'ALLOWED', detail: JSON.stringify(r) };
  });
} catch (e) {
  report('KRN-5', null, 'script error: ' + (e && e.stack || e), { check: 'harness' });
} finally {
  await S.close();
}
done('test-acl');
