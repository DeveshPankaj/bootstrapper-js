// End-to-end test of the Remote Machines app (docs/public/mount/opt/apps/remote-machines).
//
// Needs: the dev server (pnpm start, :8080), the workspace-ssh bridge (ts-playground:
// `node bridge/main.ts --port 7091`), and an SSH machine that accepts ~/.ssh/id_ed25519.
//   RM_HOST=root@192.168.1.203 BRIDGE=http://localhost:7091 node testing/scripts/remote-machines-e2e.mjs
//
// Changes on the machine: writes /tmp/remote-machines-e2e*.txt and a /tmp/remote-machines-e2e-dir
// folder, and deletes them again. Read-only otherwise (lists files, reads /etc/hostname and a large
// file under /usr, lists containers, `hostname` in a shell).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const PORT = process.env.PORT || 8080;
const BRIDGE = process.env.BRIDGE || 'http://localhost:7091';
const HOST = process.env.RM_HOST || 'root@192.168.1.203';
const KEY = readFileSync(`${homedir()}/.ssh/id_ed25519`, 'utf8');
const SHOTS = new URL('../screenshots/', import.meta.url).pathname;
const T = Date.now();
const log = (label, v) => console.log(((Date.now() - T) / 1000).toFixed(1).padStart(6), label, typeof v === 'string' ? v : JSON.stringify(v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}/`); await sleep(3000);
await page.reload(); await sleep(3000);
await page.reload(); await sleep(9000);

await page.evaluate(() => window.platform.host.execCommand("service('001-core.layout','open-window') (command('ui.remote-machines'))", window.platform));
const frame = async () => { for (let i = 0; i < 40; i++) { for (const f of page.frames()) { try { if (await f.locator('#bridge').count()) return f; } catch (_) {} } await sleep(250); } throw new Error('app frame not found'); };
let f = await frame();
log('opened', await f.locator('.title').first().innerText());

// Bridge settings → the test bridge.
await f.locator('#bridge').click({ force: true });
await f.locator('.modal input[type=url]').fill(BRIDGE);
await f.locator('.modal button:has-text("Test")').click({ force: true });
await sleep(1500);
log('bridge test', await f.locator('.modal .ok-text, .modal .err').first().innerText());
await f.locator('.modal button:has-text("Save")').click({ force: true });
await sleep(1500);
log('bridge box', await f.locator('#bridge').innerText());

// Add the machine (key sign-in, whole disk).
await f.locator('#add-btn').click({ force: true });
await f.locator('.modal input[placeholder^="user@host"]').fill(HOST);
await f.locator('.modal input[placeholder^="Empty: the host"]').fill('test-machine');
await f.locator('.modal select').selectOption('key');
await f.locator('.modal textarea').fill(KEY);
await f.locator('.modal button:has-text("Add and connect")').click({ force: true });
// First contact: the host key question.
for (let i = 0; i < 40; i++) { if (await f.locator('.modal button:has-text("Trust and connect")').count()) break; await sleep(250); }
log('host key dialog', (await f.locator('.modal .fp').innerText().catch(() => '(none)')).slice(0, 60));
await f.locator('.modal button:has-text("Trust and connect")').click({ force: true });
for (let i = 0; i < 80; i++) { if ((await f.locator('.head .who span').innerText().catch(() => '')).includes('folder')) break; await sleep(250); }
log('connected', await f.locator('.head .who').innerText());
for (let i = 0; i < 40; i++) { if (await f.locator('table.grid tbody tr').count()) break; await sleep(250); }
log('root listing', (await f.locator('table.grid tbody td.nm span').allInnerTexts()).filter(Boolean).slice(0, 12));
await page.screenshot({ path: `${SHOTS}remote-machines-files.png` });

// Read a file through the editor.
await f.evaluate(() => window.__remoteMachines.loadDir(window.__remoteMachines.conns[0], '/etc'));
await sleep(1500);
const hostRow = f.locator('table.grid tbody tr', { hasText: /^hostname/ }).first();
// A real dblclick event (Playwright's forced dblclick misses rows inside this nested, scrolled iframe).
await hostRow.dispatchEvent('dblclick');
await f.locator('.modal textarea.editor').first().waitFor({ timeout: 15000 });
log('editors open', await f.locator('.modal textarea.editor').count());
log('editor shows /etc/hostname', (await f.locator('.modal textarea.editor').first().inputValue()).trim());
await f.locator('.modal button:has-text("Close")').click({ force: true });

// Remote → VFS: save /etc/hostname into /home/user1 and read it back from the VFS.
await f.evaluate(async () => { const rm = window.__remoteMachines; const c = rm.conns[0]; const n = rm.stateOf(c).files.entries.find((x) => x.name === 'hostname'); rm.saveToVfs(c, [n]); });
await sleep(800);
await f.locator('.modal button:has-text("Save here")').click({ force: true });
await sleep(2000);
log('VFS copy', await page.evaluate(() => { try { return window.platform.host.getFS().readFileSync('/home/user1/hostname', 'utf8').trim(); } catch (e) { return 'missing: ' + e.message; } }));

// VFS → remote: upload a VFS file into /tmp, check it, delete it.
await page.evaluate(() => window.platform.host.getFS().writeFileSync('/home/user1/remote-machines-e2e.txt', 'hello from the VFS'));
await f.evaluate(async () => { const rm = window.__remoteMachines; const c = rm.conns[0]; await rm.loadDir(c, '/tmp'); await rm.uploadVfsPaths(c, ['/home/user1/remote-machines-e2e.txt'], '/tmp'); });
await sleep(1500);
const uploaded = await f.evaluate(async () => { const rm = window.__remoteMachines; const s = rm.stateOf(rm.conns[0]).session; const r = await s.rpc('fs.read', { path: '/tmp/remote-machines-e2e.txt' }); await s.rpc('fs.remove', { path: '/tmp/remote-machines-e2e.txt' }); return r.data; });
log('uploaded and read back (then deleted)', uploaded);

// ── The machine in the default file explorer: /mnt/ssh/<name> ──
const vfs = (fn, arg) => page.evaluate(new Function('arg', `const fs = window.platform.host.getFS(); ${fn}`), arg);
const until = async (fn, arg, ms = 20000) => { const t0 = Date.now(); for (;;) { const v = await vfs(fn, arg).catch((e) => ({ error: e.message })); if (v && !v.error) return v; if (Date.now() - t0 > ms) return v; await sleep(300); } };
log('mount root', await vfs("return fs.readdirSync('/mnt/ssh')"));
const M = '/mnt/ssh/test-machine';
log('mounted / (first names)', (await vfs(`return fs.readdirSync(${JSON.stringify(M)})`)).slice(0, 8));
// /etc is listed one level ahead and its small files are prefetched.
log('mount /etc/hostname', await until(`try { return fs.readFileSync(${JSON.stringify(M + '/etc/hostname')}, 'utf8').trim(); } catch (e) { return { error: e.message }; }`));
// A large file: the first read says it's downloading, a later one gets it all.
const big = await f.evaluate(async () => { const s = window.__remoteMachines.stateOf(window.__remoteMachines.conns[0]).session; const l = await s.rpc('fs.list', { path: '/usr/bin' }); return l.filter((n) => n.kind === 'file' && n.size > 600 * 1024 && n.size < 4 * 1024 * 1024).sort((a, b) => a.size - b.size)[0]; });
if (big) {
  const bigPath = M + big.path;
  await vfs(`fs.readdirSync(${JSON.stringify(M + '/usr/bin')}); return true`);
  await until(`try { fs.statSync(${JSON.stringify(bigPath)}); return true; } catch (e) { return { error: e.message }; }`);
  log('large file, size from stat', { file: big.path, stat: await vfs(`return fs.statSync(${JSON.stringify(bigPath)}).size`), remote: big.size });
  log('large file, first read', await vfs(`try { return fs.readFileSync(${JSON.stringify(bigPath)}).length; } catch (e) { return e.message.slice(0, 120); }`));
  log('large file, later read (bytes)', await until(`try { return fs.readFileSync(${JSON.stringify(bigPath)}).length; } catch (e) { return { error: e.message }; }`, null, 60000));
}
// Writes through the VFS reach the machine.
const remoteRead = (path) => f.evaluate(async (p) => { const s = window.__remoteMachines.stateOf(window.__remoteMachines.conns[0]).session; try { return (await s.rpc('fs.read', { path: p })).data; } catch (e) { return 'ERR ' + e.message; } }, path);
const remoteStat = (path) => f.evaluate(async (p) => { const s = window.__remoteMachines.stateOf(window.__remoteMachines.conns[0]).session; return s.rpc('fs.stat', { path: p }); }, path);
const settle = () => f.evaluate(async () => { const m = window.__remoteMachines.stateOf(window.__remoteMachines.conns[0]).mount; for (let i = 0; i < 100 && m.pending; i++) await new Promise((r) => setTimeout(r, 100)); return m.pending; });
await vfs(`fs.readdirSync(${JSON.stringify(M + '/tmp')}); return true`);
await sleep(1500);
await vfs(`fs.writeFileSync(${JSON.stringify(M + '/tmp/remote-machines-e2e-mount.txt')}, 'written through the VFS'); return true`);
await settle();
log('VFS write → machine', await remoteRead('/tmp/remote-machines-e2e-mount.txt'));
await vfs(`fs.renameSync(${JSON.stringify(M + '/tmp/remote-machines-e2e-mount.txt')}, ${JSON.stringify(M + '/tmp/remote-machines-e2e-renamed.txt')}); return true`);
await settle();
log('VFS rename → machine', { old: await remoteStat('/tmp/remote-machines-e2e-mount.txt'), new: !!(await remoteStat('/tmp/remote-machines-e2e-renamed.txt')) });
await vfs(`fs.unlinkSync(${JSON.stringify(M + '/tmp/remote-machines-e2e-renamed.txt')}); return true`);
await vfs(`fs.mkdirSync(${JSON.stringify(M + '/tmp/remote-machines-e2e-dir')}); return true`);
await settle();
log('VFS delete + mkdir → machine', { file: await remoteStat('/tmp/remote-machines-e2e-renamed.txt'), dir: (await remoteStat('/tmp/remote-machines-e2e-dir'))?.kind });
await vfs(`fs.rmdirSync(${JSON.stringify(M + '/tmp/remote-machines-e2e-dir')}); return true`);
await settle();
log('VFS rmdir → machine', await remoteStat('/tmp/remote-machines-e2e-dir'));
// The default explorer at the mount: open it at the machine's / and double-click down through
// usr → share → doc, like a person would (each level is listed when its parent is opened).
await page.evaluate((p) => window.platform.host.execCommand("service('001-core.layout','open-window')(command('explorer'), $args[0])", window.platform, p), M);
const explorerWith = async (name, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { for (const fr of page.frames()) { try { if (await fr.locator('.file-item', { hasText: new RegExp(`^\\s*${name}\\s*$`) }).count()) return fr; } catch (_) {} } await sleep(300); } return null; };
let ex = await explorerWith('usr');
log('default explorer at the machine', ex ? `${await ex.locator('.file-item').count()} items` : 'not found');
for (const name of ['usr', 'share', 'doc']) {
  if (!ex) break;
  const t0 = Date.now();
  await ex.locator('.file-item', { hasText: new RegExp(`^\\s*${name}\\s*$`) }).first().dispatchEvent('dblclick');
  // The next level shows up once its listing is in (vfs:changed makes the explorer re-read it).
  const next = name === 'usr' ? 'share' : name === 'share' ? 'doc' : null;
  if (next) { ex = await explorerWith(next); log(`explorer opened ${name}`, ex ? `${await ex.locator('.file-item').count()} items after ${Date.now() - t0} ms` : 'empty'); }
  else { await sleep(2500); log(`explorer opened ${name}`, `${await ex.locator('.file-item').count()} items after ${Date.now() - t0} ms`); }
}
await page.screenshot({ path: `${SHOTS}remote-machines-explorer.png` });

// Terminal on the machine.
await f.evaluate(() => window.__remoteMachines.openTerminal(window.__remoteMachines.conns[0], {}));
await sleep(3000);
// Focus xterm's input from inside the frame: the explorer window may cover the app.
const typeIn = async (text) => { await f.locator('.term:not([hidden]) .xterm-helper-textarea').first().waitFor({ state: 'attached', timeout: 15000 }); await f.evaluate(() => document.querySelector('.term:not([hidden]) .xterm-helper-textarea').focus()); await page.keyboard.type(text); await page.keyboard.press('Enter'); };
const screen = () => f.evaluate(() => { const st = window.__remoteMachines.stateOf(window.__remoteMachines.conns[0]); const b = st.terms.active.term.buffer.active; let out = ''; for (let i = 0; i < b.length; i++) out += b.getLine(i).translateToString(true) + '\n'; return out; });
await typeIn('echo rm-e2e-$((40+2)); hostname');
await sleep(2000);
const s1 = await screen();
log('shell ran', /rm-e2e-42/.test(s1) ? 'echo ok' : 'missing');
log('shell hostname', s1.trim().split('\n').filter(Boolean).slice(-2).join(' | '));
await page.screenshot({ path: `${SHOTS}remote-machines-terminal.png` });

// Containers: list, and a shell inside the first running one.
await f.locator('.tabs button', { hasText: 'Containers' }).dispatchEvent('click');   // the explorer window may sit on top
for (let i = 0; i < 80; i++) { if (await f.locator('table.grid tbody tr').count() || await f.locator('.notice.bad').count()) break; await sleep(250); }
const ct = await f.evaluate(() => { const k = window.__remoteMachines.stateOf(window.__remoteMachines.conns[0]).cts; return { cli: k.cli, error: k.error, count: k.list?.length, running: k.list?.filter((i) => i.status === 'Running').map((i) => i.name).slice(0, 5) }; });
log('containers', ct);
await page.screenshot({ path: `${SHOTS}remote-machines-containers.png` });
if (ct.running?.length) {
  await f.locator('table.grid tbody tr').filter({ has: f.locator('td.nm span:not(.ic)', { hasText: new RegExp(`^${ct.running[0]}$`) }) }).first().locator('button:has-text("Terminal")').dispatchEvent('click');
  await sleep(4000);
  await typeIn('hostname');
  await sleep(2500);
  log(`shell in ${ct.running[0]}`, (await screen()).trim().split('\n').filter(Boolean).slice(-2).join(' | '));
  log('terminal tabs', await f.locator('.term-tab').allInnerTexts());
}

// Monitor: tiles, charts and the busiest processes from the bridge's samples.
await f.locator('.tabs button', { hasText: 'Monitor' }).dispatchEvent('click');
for (let i = 0; i < 60; i++) { if (await f.locator('.mon .tile').count()) break; await sleep(500); }
log('monitor tiles', (await f.locator('.mon .tile').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')));
log('monitor charts (lines drawn)', await f.locator('.mon .chart svg path[fill="none"]').count());
log('monitor processes', await f.locator('.mon table.grid tbody tr').count());
const firstLine = f.locator('.mon .plot').first();
await firstLine.dispatchEvent('mousemove', { clientX: 0, clientY: 0 }).catch(() => {});
await page.screenshot({ path: `${SHOTS}remote-machines-monitor.png` });

// Reload: the machine, its known host key and (remembered) sign-in come back.
await page.reload(); await sleep(9000);
await page.evaluate(() => window.platform.host.execCommand("service('001-core.layout','open-window') (command('ui.remote-machines'))", window.platform));
f = await frame();
for (let i = 0; i < 80; i++) { if ((await f.locator('.head .who span').innerText().catch(() => '')).includes('folder')) break; await sleep(250); }
log('after reload', await f.locator('.head .who').innerText().catch(() => '(not connected)'));
log('saved state', await page.evaluate(() => { const fs = window.platform.host.getFS(); const d = '/home/user1/.local/share/remote-machines'; return fs.readdirSync(d).map((n) => `${n}:${fs.readFileSync(d + '/' + n, 'utf8').length}`); }));
log('secrets file has no key text', await page.evaluate(() => !window.platform.host.getFS().readFileSync('/home/user1/.local/share/remote-machines/secrets.json', 'utf8').includes('PRIVATE KEY')));
log('page errors', errors);
await browser.close();
