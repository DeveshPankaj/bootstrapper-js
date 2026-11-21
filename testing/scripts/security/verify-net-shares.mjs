// NET-10 (TODO 1E.8): no read-write shares of system folders (or their ancestors), and
// ~/.local/share (other apps' settings and secrets) is never shared — not directly, not
// inside a shared parent. Kernel-owned files stay unwritable through a share.
// Run: node testing/scripts/security/verify-net-shares.mjs   (dev server on :8080)
import { launchBrowser, bootPage, connectPair, openWindow, appFrame, waitFor, check, finish } from './verify-net-lib.mjs';

const browser = await launchBrowser();
const pA = await bootPage(browser), pB = await bootPage(browser);
const { fA, fB, idB } = await connectPair(pA, pB);
const cli = (cmd) => fA.evaluate((c) => window.__webrtcApp.runCli(c.split(' ')), cmd);   // the window's own CLI entry (no NET-6 prompt)

await pA.evaluate(() => {
  const fs = window.fs, mk = (d) => { let c = ''; for (const p of d.split('/').filter(Boolean)) { c += '/' + p; if (!fs.existsSync(c)) fs.mkdirSync(c); } };
  mk('/home/user1/.local/share/remote-machines'); fs.writeFileSync('/home/user1/.local/share/remote-machines/secrets.json', '{"c1":"SECRET"}');
  mk('/mnt/ssh/box'); mk('/home/user1/docs'); fs.writeFileSync('/home/user1/docs/a.txt', 'a');
  if (!fs.existsSync('/home/user1/initd.run')) fs.writeFileSync('/home/user1/initd.run', '// boot');
});

for (const [path, mode] of [['/etc', 'rw'], ['/etc/widgets', 'rw'], ['/opt', 'rw'], ['/opt/apps', 'rw'], ['/usr', 'rw'], ['/bin', 'rw'], ['/proc', 'rw'], ['/mnt', 'rw'], ['/mnt/ssh/box', 'rw']]) {
  const r = await cli(`share add ${path} x ${mode}`);
  check(`NET-10: "share add ${path} x ${mode}" is refused`, r.ok === false && /read-only|system folder/.test(r.out), r.out);
}
for (const [path, mode] of [['/', 'ro'], ['/home/user1/.local/share', 'ro'], ['/home/user1/.local/share/remote-machines', 'rw']]) {
  const r = await cli(`share add ${path} x ${mode}`);
  check(`NET-10: "share add ${path} x ${mode}" is refused`, r.ok === false, r.out);
}
const etcRo = await cli('share add /etc etc ro');
check('NET-10: a system folder may still be shared read-only', etcRo.ok === true, etcRo.out);
const mode = await cli('share mode etc rw');
check('NET-10: raising a system share to read & write is refused', mode.ok === false && (await fA.evaluate(() => [...window.__webrtcApp.shares.values()].find((s) => s.name === 'etc').mode)) === 'ro', mode.out);
const home = await cli('share add /home/user1 home rw');
check('NET-10: an ordinary folder (the home folder) can be shared read & write', home.ok === true, home.out);

// Bob gets read & write on the home share; the owner-side guards apply to every request.
await fA.evaluate((b) => { const app = window.__webrtcApp; const s = [...app.shares.values()].find((x) => x.name === 'home'); app.setGrant(app.peers.get(b), s, 'rw'); }, idB);
await waitFor(() => fB.evaluate(() => [...window.__webrtcApp.peers.values()][0].remoteShares.some((s) => s.name === 'home')), 10000);
const rq = (op, path, extra) => fB.evaluate(async ({ op, path, extra }) => {
  const app = window.__webrtcApp; const p = [...app.peers.values()][0]; const s = p.remoteShares.find((x) => x.name === 'home');
  try { const { res } = await app.vfsCall(p, s, op, path, extra); return { ok: true, res }; } catch (e) { return { ok: false, err: e.message }; }
}, { op, path, extra });
const up = (path, text) => fB.evaluate(async ({ path, text }) => {
  const app = window.__webrtcApp; const p = [...app.peers.values()][0]; const s = p.remoteShares.find((x) => x.name === 'home');
  try { await app.vfsUpload(p, s, path, new File([text], path.split('/').pop())); return { ok: true }; } catch (e) { return { ok: false, err: e.message }; }
}, { path, text });

const lsLocal = await rq('list', '.local');
check('NET-10: ~/.local/share is hidden when listing a shared parent', lsLocal.ok && !lsLocal.res.entries.some((e) => e.n === 'share'), JSON.stringify(lsLocal.res?.entries || lsLocal.err));
check('NET-10: listing ~/.local/share through the share is denied', !(await rq('list', '.local/share')).ok);
const dl = await fB.evaluate(async () => { const app = window.__webrtcApp; const p = [...app.peers.values()][0]; const s = p.remoteShares.find((x) => x.name === 'home'); try { await app.vfsDownload(p, s, '.local/share/remote-machines/secrets.json'); return 'downloaded'; } catch (e) { return e.message; } });
check('NET-10: reading another app\'s secrets through the share is denied', dl !== 'downloaded', dl);
const initd = await up('initd.run', 'evil()');
check('NET-10: writing the kernel-owned ~/initd.run through the share is refused', !initd.ok && (await pA.evaluate(() => window.fs.readFileSync('/home/user1/initd.run', 'utf8'))) !== 'evil()', JSON.stringify(initd));
check('NET-10: deleting ~/.local (holds app data) is refused', !(await rq('delete', '.local')).ok && (await pA.evaluate(() => window.fs.existsSync('/home/user1/.local/share/remote-machines/secrets.json'))));
check('NET-10: writing into ~/.local/share is refused', !(await up('.local/share/remote-machines/secrets.json', 'x')).ok);
const okUp = await up('docs/b.txt', 'hello');
check('NET-10: ordinary writes in the share still work', okUp.ok && (await pA.evaluate(() => window.fs.readFileSync('/home/user1/docs/b.txt', 'utf8'))) === 'hello', JSON.stringify(okUp));
check('NET-10: ordinary deletes in the share still work', (await rq('delete', 'docs/a.txt')).ok && !(await pA.evaluate(() => window.fs.existsSync('/home/user1/docs/a.txt'))));

// Shares restored from settings.json (a writable VFS file) follow the same rules.
const pC = await bootPage(browser);
await pC.evaluate(() => {
  const fs = window.fs, dir = '/home/user1/.local/share/webrtc'; let c = '';
  for (const p of dir.split('/').filter(Boolean)) { c += '/' + p; if (!fs.existsSync(c)) fs.mkdirSync(c); }
  fs.writeFileSync(dir + '/settings.json', JSON.stringify({ name: 'Carol', shares: [
    { id: 'aaaaaaa1', name: 'etc', path: '/etc', mode: 'rw' },
    { id: 'aaaaaaa2', name: 'data', path: '/home/user1/.local/share', mode: 'ro' },
    { id: 'aaaaaaa3', name: 'root', path: '/', mode: 'ro' },
    { id: 'aaaaaaa4', name: 'home', path: '/home/user1', mode: 'rw' },
  ] }));
});
await openWindow(pC, 'ui.webrtc');
const fC = await appFrame(pC, 'webrtc/main.html');
await waitFor(() => fC.evaluate(() => !!window.__webrtcApp), 20000);
const restored = await fC.evaluate(() => [...window.__webrtcApp.shares.values()].map((s) => `${s.path}:${s.mode}`).sort());
check('NET-10: saved shares are re-checked on load (system rw → ro, app data and / dropped)', JSON.stringify(restored) === JSON.stringify(['/etc:ro', '/home/user1:rw']), JSON.stringify(restored));

check('no page errors', ![pA, pB, pC].some((p) => p.__errors.length), [pA, pB, pC].flatMap((p) => p.__errors).join(' | '));
await finish(browser);
