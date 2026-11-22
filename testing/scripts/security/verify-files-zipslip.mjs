// 1D.2 (audit BOOT-8, APP-3; decisions.md D6) — archive extraction never writes outside the
// destination folder, nor onto a kernel-owned path (/etc, /bin, /opt, /.initd.run,
// /home/user1/initd.run, …) unless the user extracts inside one: file-explorer "Extract here",
// explorer-sifi "Extract here", `unzip` and `tar -x` in the terminal. Refused entries are named
// to the user (notification / terminal), with control characters shown as ^X in the terminal.
// Normal archives still extract (smoke), `unzip -l` / `tar -t` / `zip` / `tar -c` still work.
//
// The hostile archives are built here in Node (stored zip / bootar), so no library sanitises
// the entry names first. Run: node testing/scripts/security/verify-files-zipslip.mjs (:8080)
import {
  launch, installApp, bootReady, makeReporter, sleep, pollFor, installDialogs, findFrame, fileItem, clickMenu,
  closeAllWindows, vfs,
} from './verify-files-lib.mjs';

// ── tiny archive writers ──────────────────────────────────────────────────────────────────
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
// Stored (method 0) zip with exactly these entry names.
const makeZip = (entries) => {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const data = Buffer.from(text, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
};
// bootar (bin/tar.run's format): MAGIC + header length + JSON header + file bytes.
const makeBootar = (entries) => {
  const header = { version: 1, entries: entries.map(([path, text]) => (text === null ? { path, type: 'dir', size: 0 } : { path, type: 'file', size: Buffer.byteLength(text) })) };
  const h = Buffer.from(JSON.stringify(header));
  return Buffer.concat([Buffer.from('BOOTAR1\n'), Buffer.from(`${h.length}\n`), h, ...entries.filter(([, t]) => t !== null).map(([, t]) => Buffer.from(t))]);
};

const BASE = '/home/user1/ziptest';
const ESC_NAME = 'esc\u001b[2J\u001b]0;pwned\u0007.txt';
const EVIL = [
  ['ok.txt', 'ok'],
  ['sub/nested.txt', 'nested'],
  ['../escape1.txt', 'x'],
  ['../../../../.initd.run', 'top.__pwnedZip = 1'],
  ['/etc/abs-zip.txt', 'x'],
  ['a/../../escape2.txt', 'x'],
  ['a\\..\\..\\escape3.txt', 'x'],
  [ESC_NAME, 'x'],
];
const UNSAFE = EVIL.length - 2;

const { check, done } = makeReporter();
const browser = await launch();
const context = await browser.newContext();
const page = await bootReady(context);
const dialogs = installDialogs(page);
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.stack || e.message).split('\n').slice(0, 3).join(' ⟵ ')));

const toasts = () => page.evaluate(() => [...document.querySelectorAll('div')].filter((d) => d.style && d.style.borderRadius === '12px' && d.style.pointerEvents === 'auto').map((d) => d.innerText));
const escapesAbsent = async (destDir) => {
  const parent = destDir.split('/').slice(0, -1).join('/');
  const bad = [`${parent}/escape1.txt`, '/etc/abs-zip.txt', `${parent}/escape2.txt`, '/home/user1/escape2.txt', `${parent}/escape3.txt`, '/escape1.txt', '/escape2.txt'];
  for (const p of bad) if (await vfs.exists(page, p)) return p;
  for (const n of (await vfs.ls(page, destDir)) || []) if (n.includes('\u001b') || n.includes('\\')) return `${destDir}/${n}`;
  return null;
};

try {
  const initdBefore = await page.evaluate(() => { try { return window.fs.readFileSync('/.initd.run', 'utf8'); } catch (_) { return null; } });
  const homeInitdBefore = await vfs.read(page, '/home/user1/initd.run');
  await vfs.rm(page, BASE);
  for (const d of ['fx', 'sifi', 'term', 'tar', 'normal']) await vfs.mkdir(page, `${BASE}/${d}`);
  const zip = makeZip(EVIL);
  for (const d of ['fx', 'sifi', 'term']) await vfs.writeBytes(page, `${BASE}/${d}/evil.zip`, zip);

  // ── file-explorer: Extract here ───────────────────────────────────────────────────────────
  await page.evaluate((d) => window.platform.host.openWindow('explorer', d), `${BASE}/fx`);
  let fx = await findFrame(page, '.file-explorer .file-name:text-is("evil.zip")');
  await fileItem(fx, 'evil.zip').click({ button: 'right', force: true });
  await clickMenu(page, 'Extract here');
  await sleep(600);
  check('explorer Extract: normal entries extracted', (await vfs.read(page, `${BASE}/fx/ok.txt`)) === 'ok' && (await vfs.read(page, `${BASE}/fx/sub/nested.txt`)) === 'nested');
  let leak = await escapesAbsent(`${BASE}/fx`);
  check('explorer Extract: nothing written outside the folder (.., absolute, a/../.., backslash, control chars)', !leak, leak || '');
  check('explorer Extract: /.initd.run unchanged', (await page.evaluate(() => { try { return window.fs.readFileSync('/.initd.run', 'utf8'); } catch (_) { return null; } })) === initdBefore);
  let t = (await toasts()).join(' | ');
  check('explorer Extract: notification names the skipped entries', t.includes(`Skipped ${UNSAFE} entries`) && t.includes('../escape1.txt') && t.includes('Extracted — unsafe entries skipped'), t);
  await closeAllWindows(page);

  // ── explorer-sifi: Extract here ───────────────────────────────────────────────────────────
  await installApp(page, 'explorer-sifi');
  await page.evaluate((d) => window.platform.host.openWindow('explorer-sifi', d), `${BASE}/sifi`);
  fx = await findFrame(page, '.sifi-explorer .file-name:text-is("evil.zip")');
  await fileItem(fx, 'evil.zip').click({ button: 'right', force: true });
  await clickMenu(page, 'Extract here');
  await sleep(600);
  check('explorer-sifi Extract: normal entries extracted', (await vfs.read(page, `${BASE}/sifi/ok.txt`)) === 'ok' && (await vfs.read(page, `${BASE}/sifi/sub/nested.txt`)) === 'nested');
  leak = await escapesAbsent(`${BASE}/sifi`);
  check('explorer-sifi Extract: nothing written outside the folder', !leak, leak || '');
  t = (await toasts()).join(' | ');
  check('explorer-sifi Extract: notification names the skipped entries', t.includes(`Skipped ${UNSAFE} entries`), t);
  // double-click on a .zip in explorer-sifi asks, then extracts into the shown folder
  await vfs.mkdir(page, `${BASE}/sifi/dbl`);
  await vfs.writeBytes(page, `${BASE}/sifi/dbl/evil.zip`, zip);
  await closeAllWindows(page);
  await page.evaluate((d) => window.platform.host.openWindow('explorer-sifi', d), `${BASE}/sifi/dbl`);
  fx = await findFrame(page, '.sifi-explorer .file-name:text-is("evil.zip")');
  dialogs.answer({ accept: true });
  await fileItem(fx, 'evil.zip').dblclick({ force: true });
  await sleep(600);
  check('explorer-sifi double-click Extract: safe entries only', (await vfs.exists(page, `${BASE}/sifi/dbl/ok.txt`)) && !(await escapesAbsent(`${BASE}/sifi/dbl`)) && !(await vfs.exists(page, `${BASE}/sifi/escape1.txt`)));
  await closeAllWindows(page);

  // ── protected paths: a zip in ~ may not replace ~/initd.run; a zip in / may not reach /etc ──
  await vfs.writeBytes(page, '/home/user1/protect-test.zip', makeZip([['initd.run', 'top.__pwnedZip = 2'], ['protect-ok.txt', 'fine']]));
  await page.evaluate(() => window.platform.host.openWindow('explorer', '/home/user1'));
  fx = await findFrame(page, '.file-explorer .file-name:text-is("protect-test.zip")');
  await fileItem(fx, 'protect-test.zip').click({ button: 'right', force: true });
  await clickMenu(page, 'Extract here');
  await sleep(600);
  check('explorer Extract in ~: ~/initd.run (kernel-owned) not replaced, other entry extracted',
    (await vfs.read(page, '/home/user1/initd.run')) === homeInitdBefore && (await vfs.read(page, '/home/user1/protect-ok.txt')) === 'fine');
  await closeAllWindows(page);
  await vfs.writeBytes(page, '/root-test.zip', makeZip([['etc/widgets/evil-zip.js', 'top.__pwnedZip = 3'], ['.initd.run', 'top.__pwnedZip = 4'], ['rootok-zip.txt', 'fine']]));
  await page.evaluate(() => window.platform.host.openWindow('explorer', '/'));
  fx = await findFrame(page, '.file-explorer .file-name:text-is("root-test.zip")');
  await fileItem(fx, 'root-test.zip').click({ button: 'right', force: true });
  await clickMenu(page, 'Extract here');
  await sleep(600);
  check('explorer Extract in /: /etc/widgets and /.initd.run refused, plain entry extracted',
    !(await vfs.exists(page, '/etc/widgets/evil-zip.js')) && (await page.evaluate(() => { try { return window.fs.readFileSync('/.initd.run', 'utf8'); } catch (_) { return null; } })) === initdBefore
    && (await vfs.read(page, '/rootok-zip.txt')) === 'fine');
  await closeAllWindows(page);

  // ── normal zip round trip through the explorer (Compress to ZIP → Extract here) ────────────
  await page.evaluate((b) => { window.fs.mkdirSync(b + '/normal/pack'); window.fs.writeFileSync(b + '/normal/pack/a.txt', 'A'); window.fs.mkdirSync(b + '/normal/pack/deep'); window.fs.writeFileSync(b + '/normal/pack/deep/b.txt', 'B'); }, BASE);
  await page.evaluate((d) => window.platform.host.openWindow('explorer', d), `${BASE}/normal`);
  fx = await findFrame(page, '.file-explorer .file-name:text-is("pack")');
  await fileItem(fx, 'pack').click({ button: 'right', force: true });
  await clickMenu(page, 'Compress to ZIP');
  await pollFor(() => vfs.exists(page, `${BASE}/normal/pack.zip`), { timeout: 4000 });
  await vfs.rm(page, `${BASE}/normal/pack`);
  fx = await findFrame(page, '.file-explorer .file-name:text-is("pack.zip")');
  await fileItem(fx, 'pack.zip').click({ button: 'right', force: true });
  await clickMenu(page, 'Extract here');
  await sleep(600);
  check('explorer smoke: Compress to ZIP → Extract here round-trips a folder', (await vfs.read(page, `${BASE}/normal/pack/a.txt`)) === 'A' && (await vfs.read(page, `${BASE}/normal/pack/deep/b.txt`)) === 'B');
  t = (await toasts()).join(' | ');
  check('explorer smoke: normal extract shows the plain notification', (await toasts()).some((x) => x.trim() === 'Extracted\n2 files extracted'), t);
  await closeAllWindows(page);

  // ── terminal: unzip / tar ─────────────────────────────────────────────────────────────────
  await page.evaluate(() => window.platform.host.openWindow('ui.terminal'));
  const termFrame = await pollFor(async () => {
    for (const f of page.frames()) { try { if (await f.evaluate(() => !!(window.__terminalApp && window.__terminalApp.sessions[0] && !window.__terminalApp.sessions[0].busy))) return f; } catch (_) {} }
    return null;
  }, { timeout: 30000, interval: 500 });
  check('terminal: opens', !!termFrame);
  const term = (cmd) => termFrame.evaluate(async (cmd) => {
    const s = window.__terminalApp.sessions[0];
    const out = [];
    const orig = s.terminal.write;
    s.terminal.write = function (d) { out.push(typeof d === 'string' ? d : new TextDecoder().decode(d)); return orig.call(this, d); };
    try { await s.processCommand(cmd); } catch (e) { out.push('[threw] ' + e.message); } finally { s.terminal.write = orig; }
    return out.join('');
  }, cmd);
  await term(`cd ${BASE}/term`);
  let out = await term('unzip evil.zip -d out');
  check('unzip: normal entries extracted', (await vfs.read(page, `${BASE}/term/out/ok.txt`)) === 'ok' && (await vfs.read(page, `${BASE}/term/out/sub/nested.txt`)) === 'nested', out);
  leak = await escapesAbsent(`${BASE}/term/out`);
  check('unzip: nothing written outside the destination', !leak && !(await vfs.exists(page, `${BASE}/escape1.txt`)), leak || '');
  check('unzip: each refused entry is reported', (out.match(/unzip: skipped "/g) || []).length === UNSAFE && out.includes(`(${UNSAFE} unsafe skipped)`), out);
  check('unzip: control characters in names shown as ^[ / ^G, never raw', !out.includes('\u001b[2J') && !out.includes('\u0007') && out.includes('esc^[[2J^[]0;pwned^G.txt'), JSON.stringify(out));
  out = await term('unzip evil.zip -l');
  check('unzip <zip> -l: lists entries, control characters neutralised', out.includes('ok.txt') && out.includes('../escape1.txt') && !out.includes('\u001b[2J'), JSON.stringify(out));
  out = await term(`unzip evil.zip -d ${BASE}/term/out2`);
  check('unzip -d absolute dest: works the same', (await vfs.read(page, `${BASE}/term/out2/ok.txt`)) === 'ok' && !(await vfs.exists(page, `${BASE}/term/escape1.txt`)), out);

  await vfs.writeBytes(page, `${BASE}/tar/evil.tar`, makeBootar([
    ['okdir/', null], ['okdir/ok.txt', 'ok'], ['../tar-escape.txt', 'x'], ['/etc/abs-tar.txt', 'x'],
    ['okdir/../../tar-escape2.txt', 'x'], [ESC_NAME, 'x'],
  ]));
  await term(`cd ${BASE}/tar`);
  out = await term('tar -x evil.tar out');
  check('tar -x: normal entries extracted', (await vfs.read(page, `${BASE}/tar/out/okdir/ok.txt`)) === 'ok', out);
  check('tar -x: nothing written outside the destination', !(await vfs.exists(page, `${BASE}/tar/tar-escape.txt`)) && !(await vfs.exists(page, '/etc/abs-tar.txt'))
    && !(await vfs.exists(page, `${BASE}/tar-escape2.txt`)) && !(await vfs.exists(page, `${BASE}/tar/tar-escape2.txt`)), out);
  check('tar -x: refused entries reported, control chars neutralised', (out.match(/tar: skipped "/g) || []).length === 4 && !out.includes('\u001b[2J'), JSON.stringify(out));
  out = await term('tar -t evil.tar');
  check('tar -t: lists entries, control characters neutralised', out.includes('okdir/ok.txt') && !out.includes('\u001b[2J'), JSON.stringify(out));

  // smoke: zip/unzip and tar -c/-x round trips of a normal folder
  await page.evaluate((b) => { window.fs.mkdirSync(b + '/term/src'); window.fs.writeFileSync(b + '/term/src/x.txt', 'X'); window.fs.mkdirSync(b + '/term/src/d'); window.fs.writeFileSync(b + '/term/src/d/y.txt', 'Y'); }, BASE);
  await term(`cd ${BASE}/term`);
  out = await term('zip src.zip src');
  out += await term('unzip src.zip -d rt');
  check('smoke: zip → unzip round trip', (await vfs.read(page, `${BASE}/term/rt/src/x.txt`)) === 'X' && (await vfs.read(page, `${BASE}/term/rt/src/d/y.txt`)) === 'Y', out);
  out = await term('tar -c src.tar src');
  out += await term('tar -x src.tar rt2');
  check('smoke: tar -c → tar -x round trip', (await vfs.read(page, `${BASE}/term/rt2/src/x.txt`)) === 'X' && (await vfs.read(page, `${BASE}/term/rt2/src/d/y.txt`)) === 'Y', out);
  out = await term('ls');
  check('smoke: ls in the terminal', out.includes('src.zip') && out.includes('evil.zip'), JSON.stringify(out.slice(0, 200)));
  out = await term('cat src/x.txt');
  check('smoke: cat in the terminal', out.includes('X'), JSON.stringify(out));

  check('no code from any archive ran', (await page.evaluate(() => window.top.__pwnedZip)) === undefined);
  check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
} catch (e) {
  check('test run completed', false, e.stack || e.message);
  await page.screenshot({ path: new URL('../../screenshots/verify-files-zipslip-fail.png', import.meta.url).pathname }).catch(() => {});
} finally {
  for (const p of [BASE, '/home/user1/protect-test.zip', '/home/user1/protect-ok.txt', '/root-test.zip', '/rootok-zip.txt']) await vfs.rm(page, p).catch(() => {});
  await browser.close();
}
process.exit(done() ? 1 : 0);
