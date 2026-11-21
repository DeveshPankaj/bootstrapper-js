// 1D.4 (audit BOOT-10, plus the loader part of BOOT-5) — /etc/pkg/installed.json and
// /etc/pkg/backups are writable by any app, so the App Manager never trusts them for paths:
//  - Uninstall deletes /opt/apps/<validated id> (not the record's `appDir`), never runs the
//    package's pre-uninstall.js, and only drops the record for an invalid id;
//  - Rollback restores only /etc/pkg/backups/<id>/<version>/ (validated version) into
//    /opt/apps/<id>;
//  - Open (no command) / Spotlight / the boot loader only use a main file inside /opt/apps/<id>.
// Smoke: install + uninstall a built-in app through the UI.
//
// Run: node testing/scripts/security/verify-files-uninstall.mjs   (dev server on :8080)
import { execFileSync } from 'node:child_process';
import {
  launch, bootReady, writeVfs, makeReporter, sleep, pollFor, installSpies, resetSpies, getSpies,
  installDialogs, findFrame, closeAllWindows, vfs,
} from './verify-files-lib.mjs';

const { check, done } = makeReporter();
// Other owners keep editing registry-listed files: refresh the hashes so the built-in
// install smoke below tests this tree (the generator is idempotent).
execFileSync('node', ['scripts/gen-registry-integrity.mjs'], { cwd: new URL('../../../', import.meta.url).pathname, stdio: 'ignore' });
const rec = (id, extra = {}) => ({ id, name: extra.name || id, version: '1.0.0', icon: 'apps', appDir: `/opt/apps/${id}`, mainFile: `/opt/apps/${id}/main.js`, commandName: null, registryUrl: '/registry.json', installedAt: 1, ...extra });

const browser = await launch();
const context = await browser.newContext();
let page = await bootReady(context);
const dialogs = installDialogs(page);
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.stack || e.message).split('\n').slice(0, 3).join(' ⟵ ')));

const readInstalled = () => page.evaluate(() => JSON.parse(window.fs.readFileSync('/etc/pkg/installed.json', 'utf8') || '[]'));
const readUninstalled = () => page.evaluate(() => { try { return JSON.parse(window.fs.readFileSync('/etc/pkg/uninstalled.json', 'utf8') || '[]'); } catch (_) { return []; } });
const addRecords = (records) => page.evaluate((records) => {
  const list = JSON.parse(window.fs.readFileSync('/etc/pkg/installed.json', 'utf8') || '[]');
  window.fs.writeFileSync('/etc/pkg/installed.json', JSON.stringify([...list, ...records], null, 2));
}, records);
// Installed tab → the row named `name` → button `label` (+ the confirm modal for Uninstall).
const installedAction = async (name, label) => {
  await closeAllWindows(page);
  await page.evaluate(() => window.platform.host.openWindow('ui.pkg-manager'));
  let f = await findFrame(page, '.pkg-root .pkg-nav-item:has-text("Installed")');
  await f.locator('.pkg-nav-item', { hasText: 'Installed' }).click({ force: true });
  f = await findFrame(page, `.pkg-list-row .pkg-list-name:text-is(${JSON.stringify(name)})`);
  if (!f) return null;
  const row = f.locator('.pkg-list-row').filter({ has: f.locator(`.pkg-list-name:text-is(${JSON.stringify(name)})`) }).first();
  await row.locator('button', { hasText: label }).first().click({ force: true });
  if (label === 'Uninstall') {
    await sleep(200);
    await f.locator('.pkg-modal button.danger', { hasText: 'Uninstall' }).click({ force: true });
  }
  await sleep(600);
  return f;
};

try {
  await writeVfs(page, {
    '/opt/apps/victim-app/main.js': '// victim',
    '/opt/apps/victim-app/pre-uninstall.js': 'window.top.__pwnedPre = 1;',
    '/home/user1/precious.txt': 'keep me',
    '/opt/apps/rb-app/main.js': 'v2',
    '/etc/pkg/backups/rb-app/manifest.json': JSON.stringify([{ version: '1.0.0', backedUpAt: 1 }]),
    '/etc/pkg/backups/rb-app/1.0.0/main.js': 'v1',
    '/opt/apps/rb-evil/main.js': 'v2',
    '/etc/pkg/backups/rb-evil/manifest.json': JSON.stringify([{ version: '../../../../home/user1/planted', backedUpAt: 1 }]),
    '/home/user1/planted/main.js': 'window.top.__pwnedRollback = 1;',
    '/opt/apps/html-ok/index.html': '<!doctype html><p>html ok</p>',
    '/home/user1/html-evil.html': '<!doctype html><p>evil</p>',
  });
  await addRecords([
    rec('victim-app', { name: 'Victim App', appDir: '/home/user1' }),
    rec('../../home/user1', { name: 'Bad Record', appDir: '/home/user1' }),
    rec('rb-app', { name: 'RB App', version: '2.0.0', appDir: '/home/user1' }),
    rec('rb-evil', { name: 'RB Evil', version: '2.0.0' }),
    rec('html-ok', { name: 'HTML OK', mainFile: '/opt/apps/html-ok/index.html' }),
    rec('html-evil', { name: 'HTML Evil', mainFile: '/home/user1/html-evil.html' }),
  ]);

  // ── uninstall ─────────────────────────────────────────────────────────────────────────────
  await installedAction('Victim App', 'Uninstall');
  check('uninstall: deletes /opt/apps/<id>', !(await vfs.exists(page, '/opt/apps/victim-app')));
  check("uninstall: the record's appDir (/home/user1) is not touched", (await vfs.read(page, '/home/user1/precious.txt')) === 'keep me' && (await vfs.exists(page, '/home/user1/initd.run')));
  check('uninstall: pre-uninstall.js is not run', (await page.evaluate(() => window.top.__pwnedPre)) === undefined);
  check('uninstall: record removed, id blocked from loading', !(await readInstalled()).some((p) => p.id === 'victim-app') && (await readUninstalled()).includes('victim-app'));
  await installedAction('Bad Record', 'Uninstall');
  check('uninstall, invalid id: nothing deleted, record dropped, not added to uninstalled.json',
    (await vfs.read(page, '/home/user1/precious.txt')) === 'keep me' && !(await readInstalled()).some((p) => p.id === '../../home/user1') && !(await readUninstalled()).includes('../../home/user1'));

  // ── rollback ──────────────────────────────────────────────────────────────────────────────
  await installedAction('RB App', 'Rollback to v1.0.0');
  check('rollback: restores /etc/pkg/backups/<id>/<version> into /opt/apps/<id>', (await vfs.read(page, '/opt/apps/rb-app/main.js')) === 'v1' && !(await vfs.exists(page, '/home/user1/main.js')));
  check('rollback: record version reverted', (await readInstalled()).find((p) => p.id === 'rb-app')?.version === '1.0.0');
  const f = await installedAction('RB Evil', 'Rollback to v../../../../home/user1/planted');
  const err = f ? (await f.locator('.pkg-error').allInnerTexts()).join(' ') : '';
  check('rollback, traversal version: refused with an error, planted files not restored', /invalid backup version/.test(err) && (await vfs.read(page, '/opt/apps/rb-evil/main.js')) === 'v2', err);

  // ── Open / Spotlight only use a main file inside /opt/apps/<id> ──────────────────────────
  await installSpies(page);
  await resetSpies(page);
  await installedAction('HTML OK', 'Open');
  await installedAction('HTML Evil', 'Open');
  const execs = (await getSpies(page)).exec.map((c) => c[1]);
  check('Open (no command): main file inside its folder opens', execs.includes('/opt/apps/html-ok/index.html'), JSON.stringify(execs));
  check('Open (no command): main file outside /opt/apps/<id> is not opened', !execs.includes('/home/user1/html-evil.html'), JSON.stringify(execs));
  await closeAllWindows(page);
  await resetSpies(page);
  await page.evaluate(() => window.platform.host.callCommand('spotlight'));
  await sleep(300);
  await page.locator('input[placeholder="Search commands, files…"]').fill('HTML Evil');
  const row = page.getByText('HTML Evil', { exact: true }).first();
  if (await pollFor(async () => (await row.count()) > 0, { timeout: 4000 })) await row.click({ force: true });
  await sleep(500);
  check('Spotlight installed app: main file outside /opt/apps/<id> is not opened', !(await getSpies(page)).exec.some((c) => c[1] === '/home/user1/html-evil.html'), JSON.stringify((await getSpies(page)).exec));

  // ── boot loader ───────────────────────────────────────────────────────────────────────────
  await writeVfs(page, {
    '/home/user1/boot-evil.js': 'window.top.__pwnedBoot = 1;',
    '/opt/apps/boot-ok/main.js': 'window.top.__bootOk = (window.top.__bootOk || 0) + 1;',
  });
  await addRecords([
    rec('boot-evil', { mainFile: '/home/user1/boot-evil.js' }),
    rec('boot-dots', { mainFile: '/opt/apps/boot-dots/../../../home/user1/boot-evil.js' }),
    rec('../boot', { mainFile: '/home/user1/boot-evil.js' }),
    rec('boot-ok'),
  ]);
  await sleep(2500); // BrowserFS AsyncMirror persists writes to IndexedDB asynchronously
  await page.close();
  page = await bootReady(context);
  page.on('pageerror', (e) => pageErrors.push(String(e.stack || e.message).split('\n').slice(0, 3).join(' ⟵ ')));
  await pollFor(() => page.evaluate(() => window.top.__bootOk === 1), { timeout: 10000 });
  check('boot loader: an installed app inside /opt/apps/<id> loads', (await page.evaluate(() => window.top.__bootOk)) === 1);
  check('boot loader: records whose main file is outside /opt/apps/<id> (or with a bad id) are skipped', (await page.evaluate(() => window.top.__pwnedBoot)) === undefined);
  check('boot loader: core apps still load', await page.evaluate(() => !!(window.platform.host.getCommand('explorer') && window.platform.host.getCommand('ui.pkg-manager') && window.platform.host.getCommand('spotlight'))));

  // ── smoke: install + uninstall a built-in app through the UI ──────────────────────────────
  installDialogs(page);
  await closeAllWindows(page);
  await page.evaluate(() => window.platform.host.openWindow('ui.pkg-manager', 'Bookmarks'));
  let pm = await findFrame(page, '.pkg-card .pkg-card-name:text-is("Bookmarks")', { timeout: 20000 });
  await pm.locator('.pkg-card').filter({ has: pm.locator('.pkg-card-name:text-is("Bookmarks")') }).first().locator('button', { hasText: 'Install' }).click({ force: true });
  await pollFor(async () => (await readInstalled()).some((p) => p.id === 'bookmarks'), { timeout: 15000 });
  check('smoke: built-in Bookmarks installs', (await readInstalled()).some((p) => p.id === 'bookmarks') && await page.evaluate(() => !!window.platform.host.getCommand('ui.bookmarks')));
  await installedAction('Bookmarks', 'Uninstall');
  check('smoke: built-in Bookmarks uninstalls (/opt/apps/bookmarks removed, record gone)', !(await vfs.exists(page, '/opt/apps/bookmarks')) && !(await readInstalled()).some((p) => p.id === 'bookmarks'));

  check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
} catch (e) {
  check('test run completed', false, e.stack || e.message);
  await page.screenshot({ path: new URL('../../screenshots/verify-files-uninstall-fail.png', import.meta.url).pathname }).catch(() => {});
} finally {
  await browser.close();
}
process.exit(done() ? 1 : 0);
