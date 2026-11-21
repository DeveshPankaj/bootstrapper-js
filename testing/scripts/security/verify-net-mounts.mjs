// NET-3 (TODO 1E.2): a WebRTC remote mount must not write outside /mnt/webrtc/<label>, whatever
// names the peer lists. The peer here is genuinely malicious: Bob replaces his owner-side
// request handler (handleVfsRequest, a global of the classic script) and serves traversal
// names and bytes over the real data channel; Alice mounts his share.
// Run: node testing/scripts/security/verify-net-mounts.mjs   (dev server on :8080)
import { launchBrowser, bootPage, connectPair, waitFor, check, finish, sleep } from './verify-net-lib.mjs';

const browser = await launchBrowser();
const pA = await bootPage(browser), pB = await bootPage(browser);
const { fA, fB, idA } = await connectPair(pA, pB);

check('settings persist (the settings mkdirp is no longer shadowed by the mount helper)',
  await waitFor(() => pA.evaluate(() => window.fs.existsSync('/home/user1/.local/share/webrtc/settings.json')), 5000));

// Bob shares a real folder and grants Alice read & write, then turns evil.
await pB.evaluate(() => { const fs = window.fs; if (!fs.existsSync('/home/user1/shared')) fs.mkdirSync('/home/user1/shared'); fs.writeFileSync('/home/user1/shared/real.txt', 'real'); });
await fB.evaluate((a) => { const app = window.__webrtcApp; const s = app.addShare('/home/user1/shared', 'stuff', 'rw'); app.setGrant(app.peers.get(a), s, 'rw'); }, idA);
check('Alice sees Bob\'s share', await waitFor(() => fA.evaluate(() => [...window.__webrtcApp.peers.values()][0].remoteShares.length === 1), 10000));
await fB.evaluate(() => {
  const EVIL = {
    '': [
      { n: '../../../etc/widgets/pwn.js', d: false, s: 5, m: 1 },
      { n: '..', d: true, s: 0, m: 1 },
      { n: '.', d: true, s: 0, m: 1 },
      { n: 'a/b.txt', d: false, s: 5, m: 1 },
      { n: '..\\..\\x.txt', d: false, s: 5, m: 1 },
      { n: 'nul\u0000.txt', d: false, s: 5, m: 1 },
      { n: 'x'.repeat(300), d: false, s: 5, m: 1 },
      { n: 42, d: false, s: 5, m: 1 },
      { n: 'ok.txt', d: false, s: 5, m: 1 },
      { n: 'sub', d: true, s: 0, m: 1 },
    ],
    'sub': [
      { n: '../../../../../.initd.run', d: false, s: 5, m: 1 },
      { n: 'inner.txt', d: false, s: 5, m: 1 },
    ],
  };
  window.__evilServed = [];
  // eslint-disable-next-line no-global-assign
  handleVfsRequest = function (peer, m) {
    window.__evilServed.push(m.op + ':' + m.path);
    if (m.op === 'list') return sendPeer(peer, { t: 'vfs-res', rid: m.rid, ok: true, op: 'list', entries: EVIL[m.path] || [] });
    if (m.op === 'read') return void sendBlob(peer.conn, new Blob(['PWNED']), { name: 'f', mime: 'text/plain', kind: 'vfs', rid: m.rid }).catch(() => {});
    return sendPeer(peer, { t: 'vfs-res', rid: m.rid, ok: true });
  };
});

const mounted = await fA.evaluate(async () => {
  const app = window.__webrtcApp; const p = [...app.peers.values()][0];
  try { const m = await app.mountShare(p, p.remoteShares[0]); return { ok: true, path: m.path }; } catch (e) { return { ok: false, err: e.message }; }
});
check('Alice mounts the (evil) share', mounted.ok, JSON.stringify(mounted));
await sleep(4000);   // a couple of background sync passes

const scan = await pA.evaluate((mountPath) => {
  const fs = window.fs, hits = [], seen = new Set();
  const walk = (dir, depth) => {
    if (depth > 6 || seen.has(dir)) return; seen.add(dir);
    let names = []; try { names = fs.readdirSync(dir); } catch (_) { return; }
    for (const n of names) {
      const p = (dir === '/' ? '' : dir) + '/' + n;
      let st; try { st = fs.statSync(p); } catch (_) { continue; }
      if (st.isDirectory()) { if (!p.startsWith('/proc')) walk(p, depth + 1); }
      else if (st.size === 5) { try { if (fs.readFileSync(p, 'utf8') === 'PWNED') hits.push(p); } catch (_) {} }
    }
  };
  walk('/', 0);
  return {
    hits,
    outside: hits.filter((h) => !(h === mountPath || h.startsWith(mountPath + '/'))),
    widget: fs.existsSync('/etc/widgets/pwn.js'), initd: fs.existsSync('/.initd.run') && fs.readFileSync('/.initd.run', 'utf8') === 'PWNED',
    inMount: (() => { try { return fs.readdirSync(mountPath).sort(); } catch (e) { return String(e); } })(),
    sub: (() => { try { return fs.readdirSync(mountPath + '/sub').sort(); } catch (e) { return String(e); } })(),
  };
}, mounted.path);
check('NET-3: nothing written outside the mount', scan.outside.length === 0, JSON.stringify(scan.outside));
check('NET-3: /etc/widgets/pwn.js was not created', scan.widget === false);
check('NET-3: /.initd.run was not overwritten', scan.initd === false);
check('NET-3: valid entries are still mounted (ok.txt, sub/inner.txt)', JSON.stringify(scan.inMount) === JSON.stringify(['ok.txt', 'sub']) && JSON.stringify(scan.sub) === JSON.stringify(['inner.txt']), JSON.stringify({ inMount: scan.inMount, sub: scan.sub }));
check('NET-3: mounted files got the peer\'s bytes (sync works)', scan.hits.includes(mounted.path + '/ok.txt') && scan.hits.includes(mounted.path + '/sub/inner.txt'), JSON.stringify(scan.hits));
const err = await fA.evaluate(() => [...window.__webrtcApp.mounts.values()][0].lastError || '');
check('NET-3: invalid names are reported, not silently used', /invalid file name/.test(err) || (await fA.evaluate(() => !![...document.querySelectorAll('.toast')].find((t) => /invalid file name/.test(t.textContent)))), err);
const served = await fB.evaluate(() => window.__evilServed.filter((x) => x.startsWith('read:')));
check('NET-3: Alice never asked for an invalid name', served.every((x) => ['read:ok.txt', 'read:sub/inner.txt'].includes(x)), JSON.stringify(served));

// Owner-side mount path from hostile display names stays a single segment under /mnt/webrtc.
const label = await fA.evaluate(() => { const app = window.__webrtcApp; const m = [...app.mounts.values()][0]; return m.path; });
check('NET-3: the mount point is a direct child of /mnt/webrtc', /^\/mnt\/webrtc\/[^/]+$/.test(label), label);

await fA.evaluate(() => { const app = window.__webrtcApp; for (const m of [...app.mounts.values()]) app.unmountOne(m); });
check('no page errors', !pA.__errors.length && !pB.__errors.length, [...pA.__errors, ...pB.__errors].join(' | '));
await finish(browser);
