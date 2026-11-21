// Verifies TODO 1A.6 (audit BOOT-6): the server's /public/mount/meta.json is authoritative.
//  - A vfs /meta.json that marks itself force_reload:false and points core files at another
//    host no longer disables the refresh: after reloads the explorer's main.js equals the
//    server copy and the other host is never contacted.
//  - Entries (even in the server list) are accepted only with a same-origin /public/mount
//    source and a normalised target: absolute/protocol-relative/data: URLs, '..' and
//    non-normalised targets are rejected; a 404 source is not written into the vfs.
// Run: node testing/scripts/security/verify-kernel-meta.mjs   (OS dev server on :8080)
import { launch, bootOS, check, finish, pollFor, sleep, startServer, OS_URL } from './verify-kernel-lib.mjs';

const EVIL_PORT = 8096;
const hits = [];
const server = await startServer(EVIL_PORT, {
  '/fe.js': (req, res) => { hits.push(req.url); res.writeHead(200, { 'Content-Type': 'text/javascript', 'Access-Control-Allow-Origin': '*' }); res.end('window.__implant = 1'); },
  '/x.txt': (req, res) => { hits.push(req.url); res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' }); res.end('EVIL'); },
});
const EVIL = `http://127.0.0.1:${EVIL_PORT}`;
const browser = await launch();
const context = await browser.newContext();
const waitBoot = (page) => pollFor(async () => {
  const s = await page.evaluate(() => {
    const e = (window.__bootLog || []).find((x) => x.label.startsWith('meta.json bootstrap'));
    return e && window.platform && window.platform.host ? e : null;
  });
  return s;
}, 90000, 500);
try {
  const page = await bootOS(context);

  // --- A: the audit scenario — a self-disabling vfs /meta.json ---
  await page.evaluate((evil) => {
    const fs = window.fs;
    fs.writeFileSync('/meta.json', JSON.stringify([
      { path: '/meta.json', file: '/meta.json', force_reload: false },
      { path: '/opt/apps/file-explorer/main.js', file: evil + '/fe.js', force_reload: true },
      { path: '/home/user1/kmeta-planted.txt', file: evil + '/x.txt', force_reload: true },
    ]));
    fs.writeFileSync('/opt/apps/file-explorer/main.js', '/* TAMPERED */ window.__tampered = 1');
    // written last: if it survives the reload, the writes above reached IndexedDB too
    fs.writeFileSync('/home/user1/kmeta-marker.txt', 'persisted');
  }, EVIL);
  await sleep(3000); // the vfs mirrors writes to IndexedDB asynchronously
  for (let i = 0; i < 2; i++) { await page.reload({ waitUntil: 'load' }); await waitBoot(page); }
  const marker = await page.evaluate(() => window.fs.existsSync('/home/user1/kmeta-marker.txt'));
  check('precondition: the planted files persisted across the reload', marker);
  const a = await page.evaluate(async () => {
    const fs = window.fs;
    const server = await (await fetch('/public/mount/opt/apps/file-explorer/main.js')).text();
    const serverMeta = await (await fetch('/public/mount/meta.json')).text();
    return {
      explorerRestored: fs.readFileSync('/opt/apps/file-explorer/main.js', 'utf8') === server,
      metaIsServerCopy: fs.readFileSync('/meta.json', 'utf8') === serverMeta,
      planted: fs.existsSync('/home/user1/kmeta-planted.txt'),
      implant: window.__implant === 1,
    };
  });
  check('self-disabling vfs /meta.json ignored: tampered explorer main.js restored from the server copy', a.explorerRestored, a);
  check('vfs /meta.json overwritten with the server copy', a.metaIsServerCopy, a);
  check('remote sources named by the vfs /meta.json were never fetched or written', hits.length === 0 && !a.planted && !a.implant, { hits, a });

  // --- B: validation of entries, served as the server list via request interception ---
  const TEST_ENTRIES = [
    { path: '/tmp/km/abs-url.txt', file: EVIL + '/x.txt', force_reload: true },
    { path: '/tmp/km/proto-rel.txt', file: `//127.0.0.1:${EVIL_PORT}/x.txt`, force_reload: true },
    { path: '/tmp/km/data-url.txt', file: 'data:text/plain,hi', force_reload: true },
    { path: '/tmp/km/dotdot.txt', file: '/../../index.html', force_reload: true },
    { path: '/tmp/km/../../etc/km-escape.txt', file: '/usr/lib/ipc.js', force_reload: true },
    { path: 'tmp/km/relative-target.txt', file: '/usr/lib/ipc.js', force_reload: true },
    { path: '/tmp/km/query.txt', file: '/usr/lib/ipc.js?x=1', force_reload: true },
    { path: '/tmp/km/missing.txt', file: '/no/such/file.txt', force_reload: true },
    { path: '/tmp/km/ok.txt', file: '/usr/lib/ipc.js', force_reload: true },
    { path: '/tmp/km/ok-relative.txt', file: 'usr/lib/ipc.js', force_reload: true },
    'not an object',
    null,
  ];
  await page.route('**/public/mount/meta.json', async (route) => {
    const res = await route.fetch();
    const real = await res.json();
    await route.fulfill({ response: res, json: [...real, ...TEST_ENTRIES] });
  });
  await page.reload({ waitUntil: 'load' });
  const bootEntry = await waitBoot(page);
  const b = await page.evaluate(() => {
    const fs = window.fs;
    const has = (p) => fs.existsSync(p);
    return {
      absUrl: has('/tmp/km/abs-url.txt'), protoRel: has('/tmp/km/proto-rel.txt'), dataUrl: has('/tmp/km/data-url.txt'),
      dotdot: has('/tmp/km/dotdot.txt'), escape: has('/etc/km-escape.txt'), relTarget: has('/tmp/km/relative-target.txt') || has('/tmp/relative-target.txt'),
      query: has('/tmp/km/query.txt'), missing: has('/tmp/km/missing.txt'),
      ok: has('/tmp/km/ok.txt') && fs.readFileSync('/tmp/km/ok.txt', 'utf8').includes('WosIPC'),
      okRelative: has('/tmp/km/ok-relative.txt'),
    };
  });
  await page.unroute('**/public/mount/meta.json');
  check('absolute, protocol-relative and data: sources rejected', !b.absUrl && !b.protoRel && !b.dataUrl, b);
  check('".." in the source and non-normalised / relative targets rejected', !b.dotdot && !b.escape && !b.relTarget, b);
  check('query characters in the source rejected', !b.query, b);
  check('a 404 source is not written into the vfs', !b.missing, b);
  check('valid /public/mount entries (with or without leading slash) still restored', b.ok && b.okRelative, b);
  check('boot log reports the rejected and failed entries', !!bootEntry && /9 rejected/.test(bootEntry.error || '') && /1 failed/.test(bootEntry.error || ''), bootEntry);
  check('the other host was never contacted', hits.length === 0, hits);
  void OS_URL;
} finally {
  await browser.close();
  server.close();
}
finish('verify-kernel-meta (1A.6)');
