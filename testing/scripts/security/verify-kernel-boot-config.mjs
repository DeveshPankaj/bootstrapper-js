// Verifies TODO 1A.5 (audit KRN-9, BOOT-7):
//  - localStorage __BOOTSTRAP_SCRIPT_PATH__ no longer chooses the kernel script: only
//    /remote.bundle.js loads, the key is removed, a cross-origin URL is never fetched;
//  - ?fsBackend= switches the storage backend only after confirm(), never silently; a param
//    that matches the current backend (Settings > Storage flow) doesn't prompt; the param is
//    stripped from the URL either way, keeping other params and the hash.
// Run: node testing/scripts/security/verify-kernel-boot-config.mjs   (OS dev server on :8080)
import { launch, bootOS, check, finish, sleep, pollFor, startServer, OS_URL } from './verify-kernel-lib.mjs';

const EVIL_PORT = 8098;
const hits = [];
const server = await startServer(EVIL_PORT, {
  '/evil.js': (req, res) => { hits.push(req.url); res.writeHead(200, { 'Content-Type': 'text/javascript', 'Access-Control-Allow-Origin': '*' }); res.end('window.__evilKernel = 1'); },
});
const browser = await launch();
const context = await browser.newContext();
const dialogs = [];
let dialogAnswer = 'dismiss';
const watch = (p) => p.on('dialog', async (d) => { dialogs.push(d.message()); if (dialogAnswer === 'accept') await d.accept(); else await d.dismiss(); });
// needPlatform=false: only wait for the vfs mount (the legacy localstorage backend has a ~5 MB
// quota, so a fresh profile may never finish bootstrapping the default files into it).
const booted = (page, needPlatform = true) => pollFor(async () => {
  const s = await page.evaluate(() => ({
    vfs: (window.__bootLog || []).map((e) => e.label).find((l) => l.startsWith('VFS init')) || null,
    platform: !!(window.platform && window.platform.host),
  }));
  return s.vfs && (s.platform || !needPlatform) ? s : null;
}, 60000, 500);
try {
  const page = await bootOS(context);
  watch(page);

  // --- kernel script override ---
  for (const value of [`http://127.0.0.1:${EVIL_PORT}/evil.js`, '/layout.bundle.js', '/(sw)/tmp/evil.js']) {
    await page.evaluate((v) => localStorage.setItem('__BOOTSTRAP_SCRIPT_PATH__', v), value);
    await page.reload({ waitUntil: 'load' });
    const st = await booted(page);
    const info = await page.evaluate(() => ({
      scripts: [...document.querySelectorAll('script[src]')].map((s) => new URL(s.src, location.href).pathname),
      evil: window.__evilKernel === 1,
      key: localStorage.getItem('__BOOTSTRAP_SCRIPT_PATH__'),
    }));
    const kernelScripts = info.scripts.filter((p) => p !== '/bootstrapper.bundle.js' && !p.includes('browserfs'));
    check(`override ${JSON.stringify(value)} ignored: booted with /remote.bundle.js, key cleared`,
      !!st && kernelScripts.includes('/remote.bundle.js') && !kernelScripts.includes(value) && !info.evil && info.key === null,
      { kernelScripts, key: info.key, evil: info.evil });
  }
  check('the cross-origin override URL was never fetched', hits.length === 0, hits);

  // --- ?fsBackend= ---
  const visit = async (query, answer) => {
    dialogs.length = 0;
    dialogAnswer = answer;
    await page.goto(OS_URL + '/' + query, { waitUntil: 'commit' });
    const st = await booted(page, false);
    await sleep(300);
    const after = await page.evaluate(() => ({ href: location.pathname + location.search + location.hash, key: localStorage.getItem('__app_fs_backend__') }));
    return { vfs: st && st.vfs, dialogs: dialogs.slice(), ...after };
  };
  await page.evaluate(() => localStorage.removeItem('__app_fs_backend__'));
  const v1 = await visit('?fsBackend=localstorage&keep=1#frag', 'dismiss');
  check('?fsBackend=localstorage from a link → confirm shown; dismissed → stays on indexeddb',
    v1.dialogs.length === 1 && v1.vfs === 'VFS init (indexeddb)' && v1.key !== 'localstorage', v1);
  check('param stripped, other params and hash kept', v1.href === '/?keep=1#frag', v1.href);

  const v2 = await visit('?fsBackend=localstorage', 'accept');
  check('?fsBackend=localstorage accepted → switches (and persists)', v2.dialogs.length === 1 && v2.vfs === 'VFS init (localstorage)' && v2.key === 'localstorage' && v2.href === '/', v2);

  const v3 = await visit('?fsBackend=localstorage', 'accept');
  check('param equal to the current backend → no prompt, still stripped', v3.dialogs.length === 0 && v3.vfs === 'VFS init (localstorage)' && v3.href === '/', v3);

  // Settings > Storage flow: key written first, then reload with the param.
  await page.evaluate(() => localStorage.setItem('__app_fs_backend__', 'indexeddb'));
  const v4 = await visit('?fsBackend=indexeddb', 'dismiss');
  check('Settings > Storage flow (key set before reload) → no prompt, switched back', v4.dialogs.length === 0 && v4.vfs === 'VFS init (indexeddb)', v4);

  const v5 = await visit('?fsBackend=bogus', 'accept');
  check('invalid ?fsBackend value → ignored, no prompt, stripped', v5.dialogs.length === 0 && v5.vfs === 'VFS init (indexeddb)' && v5.href === '/', v5);
} finally {
  await browser.close();
  server.close();
}
finish('verify-kernel-boot-config (1A.5)');
