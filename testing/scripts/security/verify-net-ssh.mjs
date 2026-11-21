// NET-4 (TODO 1E.3): Remote Machines must not write outside /mnt/ssh/<machine> (the lazy
// mirror) or the folder picked for "Save to Files", whatever names a (malicious) bridge lists.
// There is no SSH bridge here, so the session's rpc is replaced in-page by a fake that
// answers fs.list with traversal names and fs.read with marker bytes.
// Run: node testing/scripts/security/verify-net-ssh.mjs   (dev server on :8080)
import { launchBrowser, bootPage, openWindow, appFrame, waitFor, waitForCommand, check, finish, sleep } from './verify-net-lib.mjs';

const browser = await launchBrowser();
const page = await bootPage(browser);
await waitForCommand(page, 'ui.remote-machines');
await openWindow(page, 'ui.remote-machines');
const f = await appFrame(page, 'remote-machines/main.html');
check('Remote Machines UI loads', await waitFor(() => f.evaluate(() => !!window.__remoteMachines && !!document.querySelector('#bridge')), 20000));

check('NET-4: cleanName refuses "." and ".."', await f.evaluate(() => cleanName('..') === '' && cleanName('.') === '' && cleanName(' .. ') === '' && cleanName('a/b') === 'ab' && cleanName('ok.txt') === 'ok.txt'));

// A fake bridge session: hostile listings, marker contents.
await f.evaluate(() => {
  const EVIL = {
    '/': [
      { name: '../../../etc/widgets/x.js', kind: 'file', size: 5, mtime: 1, path: '/w' },
      { name: '..', kind: 'dir', size: 0, mtime: 1, path: '/..' },
      { name: '.', kind: 'dir', size: 0, mtime: 1, path: '/.' },
      { name: 'a/b.txt', kind: 'file', size: 5, mtime: 1, path: '/a/b.txt' },
      { name: '..\\..\\y.txt', kind: 'file', size: 5, mtime: 1, path: '/y' },
      { name: 'ctl\u0007.txt', kind: 'file', size: 5, mtime: 1, path: '/c' },
      { name: 7, kind: 'file', size: 5, mtime: 1, path: '/n' },
      { name: 'ok.txt', kind: 'file', size: 5, mtime: 1, path: '/ok.txt' },
      { name: 'sub', kind: 'dir', size: 0, mtime: 1, path: '/sub' },
    ],
    '/sub': [
      { name: '../../../../../.initd.run', kind: 'file', size: 5, mtime: 1, path: '/i' },
      { name: 'inner.txt', kind: 'file', size: 5, mtime: 1, path: '/sub/inner.txt' },
    ],
    '/folder': [
      { name: '../../../../etc/crontab', kind: 'file', size: 5, mtime: 1, path: '/folder/x' },
      { name: '..', kind: 'dir', size: 0, mtime: 1, path: '/' },
      { name: 'keep.txt', kind: 'file', size: 5, mtime: 1, path: '/folder/keep.txt' },
    ],
  };
  window.__fakeSession = {
    status: 'online', fg: 0, info: { root: '/' },
    reads: [],
    rpc(method, params = {}) {
      if (method === 'fs.list') return Promise.resolve(JSON.parse(JSON.stringify(EVIL[params.path] || [])));
      if (method === 'fs.read') { this.reads.push(params.path); return Promise.resolve({ encoding: 'utf8', data: 'PWNED' }); }
      if (method === 'fs.stat') return Promise.resolve(null);
      return Promise.resolve({});
    },
    on() { return () => {}; },
    emit() {},
  };
});

// ── The mirror: /mnt/ssh/<machine> ──
const mountPath = await f.evaluate(async () => {
  const { RemoteMount } = window.__remoteMachines;
  const m = new RemoteMount({ id: 'evil', name: 'evil-box', host: 'evil.example', port: 22, username: 'x' }, window.__fakeSession);
  window.__evilMount = m;
  await m.mount();
  return m.path;
});
check('NET-4: the mirror mounts under /mnt/ssh', /^\/mnt\/ssh\/[^/]+$/.test(mountPath), mountPath);
await sleep(2500);   // background listing one level ahead + small-file prefetch
await page.evaluate((p) => { try { window.fs.readdirSync(p + '/sub'); } catch (_) {} }, mountPath);   // an app opens sub/
await sleep(1500);

// ── Save to Files: pick a folder, copy a hostile tree into it ──
const saveDir = '/home/user1/save-target';
await page.evaluate((d) => { if (!window.fs.existsSync(d)) window.fs.mkdirSync(d); }, saveDir);
await f.evaluate(async (d) => {
  // eslint-disable-next-line no-global-assign
  pickVfsFolder = async () => d;
  const rm = window.__remoteMachines;
  const conn = { id: 'evil2', name: 'evil-2', host: 'evil2.example', port: 22, username: 'x' };
  rm.stateOf(conn).session = window.__fakeSession;
  await rm.saveToVfs(conn, [{ name: '..', kind: 'dir', path: '/' }, { name: 'folder', kind: 'dir', path: '/folder' }]);
}, saveDir);

const scan = await page.evaluate(({ mountPath, saveDir }) => {
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
  const inside = (base, p) => p === base || p.startsWith(base + '/');
  return {
    hits,
    outside: hits.filter((h) => !inside(mountPath, h) && !inside(saveDir, h)),
    widget: fs.existsSync('/etc/widgets/x.js'),
    crontabPwned: (() => { try { return fs.readFileSync('/etc/crontab', 'utf8') === 'PWNED'; } catch (_) { return false; } })(),
    initd: (() => { try { return fs.readFileSync('/.initd.run', 'utf8') === 'PWNED'; } catch (_) { return false; } })(),
    mount: (() => { try { return fs.readdirSync(mountPath).sort(); } catch (e) { return String(e); } })(),
    sub: (() => { try { return fs.readdirSync(mountPath + '/sub').sort(); } catch (e) { return String(e); } })(),
    saved: (() => { try { return fs.readdirSync(saveDir).sort().concat(fs.readdirSync(saveDir + '/folder').sort().map((x) => 'folder/' + x)); } catch (e) { return String(e); } })(),
  };
}, { mountPath, saveDir });
check('NET-4: nothing written outside the mount or the chosen save folder', scan.outside.length === 0, JSON.stringify(scan.outside));
check('NET-4: /etc/widgets/x.js not created, /etc/crontab and /.initd.run untouched', !scan.widget && !scan.crontabPwned && !scan.initd, JSON.stringify({ widget: scan.widget, crontab: scan.crontabPwned, initd: scan.initd }));
check('NET-4: the mirror shows only the valid names', JSON.stringify(scan.mount) === JSON.stringify(['ok.txt', 'sub']), JSON.stringify(scan.mount));
check('NET-4: valid sub-folder entries still mirror (sub/inner.txt)', JSON.stringify(scan.sub) === JSON.stringify(['inner.txt']), JSON.stringify(scan.sub));
check('NET-4: Save to Files copies only validly named items into the chosen folder', JSON.stringify(scan.saved) === JSON.stringify(['folder', 'folder/keep.txt']), JSON.stringify(scan.saved));
check('NET-4: prefetch worked for valid files (content arrived)', scan.hits.includes(mountPath + '/ok.txt'), JSON.stringify(scan.hits));
const reads = await f.evaluate(() => window.__fakeSession.reads);
check('NET-4: no download was attempted for an invalid name', reads.every((p) => ['/ok.txt', '/sub/inner.txt', '/folder/keep.txt', 'ok.txt', '/sub/inner.txt'].includes(p) || /inner\.txt$|ok\.txt$|keep\.txt$/.test(p)), JSON.stringify(reads));
const absThrows = await f.evaluate(() => { try { window.__evilMount.abs('/../../etc/x'); return false; } catch (e) { return /escape|invalid|segment/i.test(e.message); } });
check('NET-4: the mirror\'s path helper refuses a traversal outright', absThrows);

await f.evaluate(() => window.__evilMount.unmount());
check('no page errors', !page.__errors.length, page.__errors.join(' | '));
await finish(browser);
