// Path traversal from names chosen by someone else.
//
//   BOOT-8 (+APP-3) zip-slip: an archive with ../ and absolute entry names, extracted by Files
//          (double-click → Extract), by /bin/unzip.run and by /bin/tar.run → nothing outside the
//          destination folder
//   BOOT-4 a (third-party) registry entry with dest "../../../.initd.run" is not written outside
//          /opt/apps/<id>; a file whose sha256 doesn't match is not installed/run
//   BOOT-10 uninstall with a tampered installed.json appDir only removes /opt/apps/<id>, and does not
//          run a planted pre-uninstall.js
//   NET-4  Remote Machines with a malicious bridge listing traversal names → nothing outside
//          /mnt/ssh/<machine> or the chosen "Save to Files" folder
// Archives are built in Node (harness makeZip/makeBootar), so the bytes don't depend on the vfs.
import {
  newSession, boot, openWindow, windowFrame, findFrame, startAttacker, step, report, done, sleep, pollFor,
  vfsWrite, vfsRead, vfsExists, vfsFindMarker, isInside, makeZip, makeBootar, sentinels, closeAllWindows, waitForCommand, ensureApp,
} from './lib/harness.mjs';

const b64 = (buf) => ({ base64: Buffer.from(buf).toString('base64') });
// The marker is only ever file *content* — names may legitimately show up in logs/notifications.
const evilEntries = (marker, tag) => [
  [`../sec-slip-${tag}-up1.txt`, marker],
  [`../../../tmp/sec-slip-${tag}-tmp.txt`, marker],
  [`sub/../../sec-slip-${tag}-mid.txt`, marker],
  [`/tmp/sec-slip-${tag}-abs.txt`, marker],
  [`ok/inner-${tag}.txt`, marker],
];

const attacker = await startAttacker({
  '/registry.json': { body: JSON.stringify({ name: 'Sec Evil Registry', version: '1', apps: [
    { id: 'sec-evil-pkg', name: 'Sec Evil Pkg', version: '1.0.0', description: 'traversal dest', icon: 'bug_report', author: 'sec', category: 'Test',
      files: [{ src: '/p/initd.txt', dest: '../../../.initd.run' }, { src: '/p/widget.js', dest: '../../../etc/widgets/sec-boot4.js' }, { src: '/p/main.js', dest: 'main.js' }], main: 'main.js' },
    { id: 'sec-badhash-pkg', name: 'Sec Badhash Pkg', version: '1.0.0', description: 'wrong sha256', icon: 'bug_report', author: 'sec', category: 'Test',
      files: [{ src: '/p/main2.js', dest: 'main.js', sha256: '0'.repeat(64) }], main: 'main.js' },
  ] }) },
  '/p/initd.txt': { headers: { 'Content-Type': 'text/plain' }, body: '// SEC-BOOT4-INITD\n' },
  '/p/widget.js': { body: '// SEC-BOOT4-WIDGET\n' },
  '/p/main.js': { body: '// SEC-BOOT4-MAIN\n' },
  '/p/main2.js': { body: 'window.top.__sec_boot4_badhash = 1; // SEC-BOOT4-BADHASH\n' },
});

const S = await newSession();
try {
  const page = await boot(S.context, { dialogPolicy: 'accept' });

  // ── BOOT-8: Files → double-click the zip → Extract (confirm accepted) ─────
  await step('BOOT-8', 'files-extract-zip-slip', async () => {
    const M = 'SECZIPX';
    await vfsWrite(page, { '/home/user1/sec-zs/evil.zip': b64(makeZip(evilEntries(M, 'x'))) });
    await closeAllWindows(page);
    await openWindow(page, 'explorer', '/home/user1/sec-zs');
    const f = await windowFrame(page, 'explorer');
    if (!f || !(await pollFor(() => f.locator('.file-item', { hasText: 'evil.zip' }).count(), 10000))) return { pass: null, detail: 'Files did not list the archive' };
    const d0 = page.__dialogs.length;
    // "Extract here" from the context menu (the double-click path differs between versions)
    await f.locator('.file-item', { hasText: 'evil.zip' }).first().click({ button: 'right', force: true });
    await sleep(500);
    let how = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.contextmenu button')].find((x) => x.offsetParent !== null && /^Extract/i.test(x.textContent.trim()));
      if (!b) return null; const t = b.textContent.trim(); b.click(); return 'menu:' + t;
    });
    await sleep(3000);
    let hits = (await vfsFindMarker(page, M)).filter((h) => h !== '/home/user1/sec-zs/evil.zip');
    if (!how) {
      await page.evaluate(() => document.querySelectorAll('.contextmenu').forEach((m) => { m.style.display = 'none'; }));
      await f.locator('.file-item', { hasText: 'evil.zip' }).first().dblclick({ force: true });
      await sleep(3000);
      how = 'double-click';
      hits = (await vfsFindMarker(page, M)).filter((h) => h !== '/home/user1/sec-zs/evil.zip');
    }
    if (!hits.length) { await closeAllWindows(page); return { pass: null, detail: `nothing was extracted (${how}); prompts=${JSON.stringify(page.__dialogs.slice(d0).map((d) => d.message.slice(0, 60)))}` }; }
    await closeAllWindows(page);
    const outside = hits.filter((h) => !isInside('/home/user1/sec-zs', h));
    const asked = page.__dialogs.slice(d0).map((d) => d.message.slice(0, 60));
    return { pass: outside.length === 0, detail: `via ${how}; outside=${JSON.stringify(outside)}; inside=${hits.length - outside.length}; prompts=${JSON.stringify(asked)}` };
  });

  // ── BOOT-8: /bin/unzip.run (what `unzip evil.zip -d out` in the terminal runs) ─
  await step('BOOT-8', 'unzip-run-zip-slip', async () => {
    const M = 'SECZIPU';
    await vfsWrite(page, { '/home/user1/sec-uz/evil.zip': b64(makeZip(evilEntries(M, 'u'))) });
    const r = await page.evaluate(async () => { try { await window.platform.host.exec(window.platform, '/bin/unzip.run', '/home/user1/sec-uz', 'evil.zip', '-d', 'out'); return 'ran'; } catch (e) { return 'threw ' + e.message; } });
    await sleep(1500);
    const hits = (await vfsFindMarker(page, M)).filter((h) => h !== '/home/user1/sec-uz/evil.zip');
    const outside = hits.filter((h) => !isInside('/home/user1/sec-uz/out', h));
    return { pass: outside.length === 0, detail: `${r}; outside=${JSON.stringify(outside)}; inside=${hits.length - outside.length}` };
  });

  // ── BOOT-8: /bin/tar.run -x ────────────────────────────────────────────────
  await step('BOOT-8', 'tar-run-path-slip', async () => {
    const M = 'SECTARX';
    await vfsWrite(page, { '/home/user1/sec-tar/evil.tar': b64(makeBootar([
      ['../../sec-tar-up.txt', M], ['../../../../tmp/sec-tar-tmp.txt', M], ['/tmp/sec-tar-abs.txt', M], ['ok-tar.txt', M],
    ])) });
    const r = await page.evaluate(async () => { try { await window.platform.host.exec(window.platform, '/bin/tar.run', '/home/user1/sec-tar', '-x', 'evil.tar', 'out'); return 'ran'; } catch (e) { return 'threw ' + e.message; } });
    await sleep(1500);
    const hits = (await vfsFindMarker(page, M)).filter((h) => h !== '/home/user1/sec-tar/evil.tar');
    const outside = hits.filter((h) => !isInside('/home/user1/sec-tar/out', h));
    return { pass: outside.length === 0, detail: `${r}; outside=${JSON.stringify(outside)}; inside=${hits.length - outside.length}` };
  });

  // ── BOOT-4: install from a third-party registry ───────────────────────────
  const initdBefore = await vfsRead(page, '/.initd.run');
  let pm = null;
  const openPkg = async () => {
    await closeAllWindows(page);
    await openWindow(page, 'ui.pkg-manager');
    pm = await windowFrame(page, 'ui.pkg-manager');
    return pm;
  };
  const clickInCard = async (name, label) => {
    const card = pm.locator('.pkg-card', { hasText: name }).first();
    if (!(await pollFor(() => card.count(), 20000))) return false;
    const btn = card.locator('button', { hasText: label }).first();
    if (!(await btn.count())) return false;
    await btn.click({ force: true });
    return true;
  };
  await step('BOOT-4', 'registry-dest-traversal', async () => {
    await vfsWrite(page, { '/etc/pkg/registries.json': JSON.stringify([attacker.url('/registry.json')]) });
    if (!(await openPkg())) return { pass: null, detail: 'pkg-manager window not found' };
    const d0 = page.__dialogs.length;
    const clicked = await clickInCard('Sec Evil Pkg', 'Install');
    await sleep(4000);
    const fetchedFiles = ['/p/initd.txt', '/p/widget.js', '/p/main.js'].map((p) => attacker.hitCount(p));
    const initdAfter = await vfsRead(page, '/.initd.run');
    const widget = await vfsExists(page, '/etc/widgets/sec-boot4.js');
    const hits = [...await vfsFindMarker(page, 'SEC-BOOT4-INITD'), ...await vfsFindMarker(page, 'SEC-BOOT4-WIDGET')];
    const outside = hits.filter((h) => !isInside('/opt/apps/sec-evil-pkg', h));
    const asked = page.__dialogs.slice(d0).map((d) => d.message.slice(0, 70));
    if (!clicked) return { pass: null, detail: `registry fetched=${attacker.hitCount('/registry.json')}; "Sec Evil Pkg" card/Install button not found; prompts=${JSON.stringify(asked)}` };
    return { pass: initdAfter === initdBefore && !widget && outside.length === 0, detail: `initd.run changed=${initdAfter !== initdBefore}; /etc/widgets/sec-boot4.js=${widget}; outside=${JSON.stringify(outside)}; fileFetches=${JSON.stringify(fetchedFiles)}; prompts(accepted)=${JSON.stringify(asked)}` };
  });
  await step('BOOT-4', 'registry-wrong-sha256', async () => {
    if (!pm) return { pass: null, detail: 'pkg-manager not open' };
    const clicked = await clickInCard('Sec Badhash Pkg', 'Install');
    await sleep(4000);
    const written = await vfsExists(page, '/opt/apps/sec-badhash-pkg/main.js');
    const ran = await sentinels(page, '__sec_boot4');
    if (!clicked) return { pass: null, detail: '"Sec Badhash Pkg" card/Install button not found' };
    return { pass: !written && ran.length === 0, detail: `main.js written=${written}; ran=${JSON.stringify(ran)}; fetched=${attacker.hitCount('/p/main2.js')}` };
  });

  // ── BOOT-10: uninstall with a tampered appDir ─────────────────────────────
  await step('BOOT-10', 'uninstall-uses-validated-app-dir', async () => {
    const installed = JSON.parse((await vfsRead(page, '/etc/pkg/installed.json')) || '[]');
    installed.push({ id: 'sec-victim-pkg', name: 'Sec Victim Pkg', version: '1.0.0', appDir: '/home/user1/sec-b10', mainFile: '/opt/apps/sec-victim-pkg/main.js', commandName: null, installedAt: Date.now() });
    await vfsWrite(page, {
      '/etc/pkg/installed.json': JSON.stringify(installed, null, 2),
      '/home/user1/sec-b10/canary.txt': 'canary',
      '/home/user1/sec-b10/pre-uninstall.js': 'window.top.__sec_b10_preuninstall = 1;',
      '/opt/apps/sec-victim-pkg/main.js': '// victim pkg',
    });
    if (!(await openPkg())) return { pass: null, detail: 'pkg-manager window not found' };
    await pm.locator('.pkg-nav-item', { hasText: 'Installed' }).first().click({ force: true }).catch(() => {});
    await sleep(1200);
    const row = pm.locator(':is(.pkg-card, .pkg-installed-row, .pkg-row, li, tr, div)', { hasText: 'Sec Victim Pkg' }).filter({ has: pm.locator('button', { hasText: 'Uninstall' }) }).last();
    if (!(await pollFor(() => row.count(), 10000))) return { pass: null, detail: 'installed entry with an Uninstall button not found' };
    await row.locator('button', { hasText: 'Uninstall' }).first().click({ force: true });
    await sleep(800);
    // confirmation modal (ConfirmModal) — press its confirm button
    await pm.evaluate(() => {
      const btns = [...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null && /Uninstall|Remove|Confirm|Delete/.test(b.textContent));
      const inModal = btns.filter((b) => b.closest('[class*="modal"], [class*="overlay"], [role="dialog"]'));
      (inModal[inModal.length - 1] || btns[btns.length - 1])?.click();
    });
    await sleep(2500);
    const canary = await vfsExists(page, '/home/user1/sec-b10/canary.txt');
    const ran = await sentinels(page, '__sec_b10');
    const appDirGone = !(await vfsExists(page, '/opt/apps/sec-victim-pkg/main.js'));
    return { pass: canary && ran.length === 0, detail: `~/sec-b10 survived=${canary}; pre-uninstall ran=${JSON.stringify(ran)}; /opt/apps/sec-victim-pkg removed=${appDirGone}` };
  });
  await closeAllWindows(page);

  // ── NET-4: Remote Machines with a malicious bridge ────────────────────────
  await step('NET-4', 'ssh-mirror-and-save-stay-inside', async () => {
    await ensureApp(page, 'remote-machines', 'ui.remote-machines'); // not preinstalled
    await openWindow(page, 'ui.remote-machines');
    const f = await findFrame(page, { urlPart: 'remote-machines/main.html', predicate: () => !!window.__remoteMachines, timeout: 30000 });
    if (!f) return { pass: null, detail: 'Remote Machines did not load' };
    await f.evaluate(() => {
      const E = (name, kind, path) => ({ name, kind, size: kind === 'file' ? 11 : 0, mtime: 1, path });
      const EVIL = {
        '/': [E('../../../etc/widgets/sec-net4.js', 'file', '/w'), E('..', 'dir', '/..'), E('ok.txt', 'file', '/ok.txt'), E('..\\..\\sec-net4-bs.txt', 'file', '/b'), E('sub', 'dir', '/sub')],
        '/sub': [E('../../../../../home/user1/sec-net4-home.txt', 'file', '/i'), E('inner.txt', 'file', '/sub/inner.txt')],
        '/folder': [E('../../../../etc/sec-net4-etc.txt', 'file', '/folder/x'), E('..', 'dir', '/'), E('keep.txt', 'file', '/folder/keep.txt')],
      };
      window.__secFake = {
        status: 'online', fg: 0, info: { root: '/' },
        rpc(method, params = {}) {
          if (method === 'fs.list') return Promise.resolve(JSON.parse(JSON.stringify(EVIL[params.path] || [])));
          if (method === 'fs.read') return Promise.resolve({ encoding: 'utf8', data: 'SEC-NET4-XX' });
          if (method === 'fs.stat') return Promise.resolve(null);
          return Promise.resolve({});
        },
        on() { return () => {}; }, emit() {},
      };
    });
    const mountPath = await f.evaluate(async () => {
      const { RemoteMount } = window.__remoteMachines;
      const m = new RemoteMount({ id: 'sec-evil', name: 'sec-evil-box', host: 'evil.example', port: 22, username: 'x' }, window.__secFake);
      window.__secMount = m;
      try { await m.mount(); } catch (e) { return 'ERR ' + e.message; }
      return m.path;
    }).catch((e) => 'ERR ' + e.message);
    const mountErr = typeof mountPath === 'string' && mountPath.startsWith('ERR') ? mountPath.slice(0, 160) : '';
    const mountBase = mountErr ? '/mnt/ssh/sec-evil-box' : mountPath;
    await sleep(2500);
    await page.evaluate((p) => { try { window.fs.readdirSync(p + '/sub'); } catch (_) {} }, mountBase);
    await sleep(1500);
    const saveDir = '/home/user1/sec-net4-save';
    await vfsWrite(page, { [saveDir + '/.keep']: '' });
    const saved = await f.evaluate(async (d) => {
      try {
        // eslint-disable-next-line no-global-assign
        pickVfsFolder = async () => d;
        const rm = window.__remoteMachines;
        const conn = { id: 'sec-evil2', name: 'sec-evil-2', host: 'evil2.example', port: 22, username: 'x' };
        rm.stateOf(conn).session = window.__secFake;
        await rm.saveToVfs(conn, [{ name: '..', kind: 'dir', path: '/' }, { name: 'folder', kind: 'dir', path: '/folder' }]);
        return 'saved';
      } catch (e) { return 'ERR ' + e.message; }
    }, saveDir);
    await sleep(1500);
    const hits = await vfsFindMarker(page, 'SEC-NET4-XX');
    const outside = hits.filter((h) => !isInside(mountBase, h) && !isInside(saveDir, h));
    await f.evaluate(() => window.__secMount && window.__secMount.unmount()).catch(() => {});
    if (!hits.length && mountErr && !/^saved/.test(saved)) return { pass: null, detail: `mount threw (${mountErr}) and save failed (${saved}); nothing reached the vfs` };
    return { pass: outside.length === 0, detail: `mount=${mountErr || mountPath}; save=${saved}; outside=${JSON.stringify(outside)}; inside=${hits.length - outside.length}` };
  });
} catch (e) {
  report('BOOT-8', null, 'script error: ' + (e && e.stack || e), { check: 'harness' });
} finally {
  await S.close();
  await attacker.close();
}
done('test-traversal');
