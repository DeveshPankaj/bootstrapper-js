// 1D.3 (audit BOOT-4) — App Manager installs: registry entries are validated (id, every file
// `dest`, `main` stay inside /opt/apps/<id>), every download is checked against its sha256
// before anything is written (mismatch → abort, nothing installed), and entries from a
// non-built-in registry or without a sha256 need an explicit confirm() that names the source.
// Also: docs/registry.json hashes are current (scripts/gen-registry-integrity.mjs --check), a
// built-in app installs with no prompt, Reinstall works, and the integrity generator is idempotent.
//
// Run: node testing/scripts/security/verify-files-pkg.mjs   (dev server on :8080)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  launch, bootReady, writeVfs, makeReporter, sleep, pollFor, installDialogs, findFrame, closeAllWindows, vfs,
} from './verify-files-lib.mjs';

const ROOT = new URL('../../../', import.meta.url).pathname;
const { check, done } = makeReporter();

// ── static: generator ─────────────────────────────────────────────────────────────────────
const gen = (...args) => { try { return { code: 0, out: execFileSync('node', ['scripts/gen-registry-integrity.mjs', ...args], { cwd: ROOT, encoding: 'utf8' }) }; } catch (e) { return { code: e.status, out: String(e.stdout) + String(e.stderr) }; } };
// Other owners may have edited registry-listed files since the last run, so bring the hashes up
// to date first (that is the generator's job), then require a second run to be a no-op.
const first = gen();
check('generator: runs (node scripts/gen-registry-integrity.mjs)', first.code === 0, first.out.trim());
const before = readFileSync(`${ROOT}docs/registry.json`, 'utf8');
const r1 = gen();
check('generator: idempotent (second run leaves docs/registry.json byte-identical)', readFileSync(`${ROOT}docs/registry.json`, 'utf8') === before && /unchanged/.test(r1.out), r1.out.trim());
const c1 = gen('--check');
check('generator --check: every built-in file has a current sha256', c1.code === 0, c1.out.trim().split('\n').slice(-1)[0]);
{
  const fs = await import('node:fs');
  const p = `${ROOT}docs/registry.json`;
  const fe0 = JSON.parse(before).apps.find((a) => a.id === 'file-explorer').files[0].sha256;
  fs.writeFileSync(p, before.replace(fe0, 'f'.repeat(64)));
  const bad = gen('--check');
  const fixed = gen();
  check('generator --check: detects a stale hash (exit 1), a normal run repairs it',
    bad.code === 1 && /file-explorer: main\.js .* stale sha256/.test(bad.out) && fixed.code === 0 && fs.readFileSync(p, 'utf8') === before, bad.out.trim().split('\n')[0]);
}
const reg = JSON.parse(before);
const fe = reg.apps.find((a) => a.id === 'file-explorer').files[0];
check('registry: sha256 = sha256(docs/public/mount/…) for file-explorer/main.js',
  fe.sha256 === createHash('sha256').update(readFileSync(`${ROOT}docs${fe.src}`)).digest('hex'));

// ── browser ───────────────────────────────────────────────────────────────────────────────
const EVIL = 'http://evil.test';
const OK_JS = "platform.host.registerCommand('ui.third-ok', () => {}, { title: 'Third OK', icon: 'apps' }); window.top.__thirdOk = (window.top.__thirdOk || 0) + 1;";
const PAYLOAD = 'window.top.__pwnedPkg = 1;';
const thirdParty = {
  name: 'Evil registry', version: '1', apps: [
    { id: '../../etc', name: 'Bad Id', version: '1.0.0', files: [{ src: '/p.js', dest: 'main.js' }], main: 'main.js' },
    { id: 'x-slip', name: 'Dest Slip', version: '1.0.0', files: [{ src: '/p.js', dest: '../../../.initd.run' }, { src: '/p.js', dest: 'main.js' }], main: 'main.js' },
    { id: 'x-abs', name: 'Dest Abs', version: '1.0.0', files: [{ src: '/p.js', dest: '/etc/widgets/pkg-evil.js' }], main: 'main.js' },
    { id: 'x-main', name: 'Main Slip', version: '1.0.0', files: [{ src: '/ok.js', dest: 'main.js' }], main: '../../../home/user1/pkg-evil.js' },
    { id: 'third-ok', name: 'Third OK', version: '1.0.0', files: [{ src: '/ok.js', dest: 'main.js' }], main: 'main.js', commandName: 'ui.third-ok' },
  ],
};

const browser = await launch();
const context = await browser.newContext();
await context.route(`${EVIL}/**`, async (route) => {
  const u = new URL(route.request().url());
  const body = u.pathname === '/registry.json' ? JSON.stringify(thirdParty) : u.pathname === '/ok.js' ? OK_JS : PAYLOAD;
  await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': u.pathname.endsWith('.json') ? 'application/json' : 'text/javascript' }, body });
});
// The built-in registry gains two test entries: a wrong sha256, and a file without one.
await context.route('**/registry.json', async (route) => {
  if (new URL(route.request().url()).host === 'evil.test') return route.fallback();
  const res = await route.fetch();
  const data = await res.json();
  const src = '/public/mount/opt/apps/bookmarks/main.js';
  data.apps.push({ id: 'hash-mismatch-app', name: 'Hash Mismatch', version: '1.0.0', files: [{ src, dest: 'main.js', sha256: '0'.repeat(64) }], main: 'main.js' });
  data.apps.push({ id: 'nohash-app', name: 'No Hash', version: '1.0.0', files: [{ src, dest: 'main.js' }], main: 'main.js' });
  await route.fulfill({ response: res, body: JSON.stringify(data), headers: { ...res.headers(), 'content-type': 'application/json' } });
});
const page = await bootReady(context);
const dialogs = installDialogs(page);
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.stack || e.message).split('\n').slice(0, 3).join(' ⟵ ')));

const installed = () => page.evaluate(() => JSON.parse(window.fs.readFileSync('/etc/pkg/installed.json', 'utf8') || '[]').map((p) => p.id));
// Opens the App Manager filtered to `name` and clicks that card's button `label`.
const clickCard = async (name, label) => {
  await closeAllWindows(page);
  await page.evaluate((n) => window.platform.host.openWindow('ui.pkg-manager', n), name);
  const f = await findFrame(page, `.pkg-card .pkg-card-name:text-is(${JSON.stringify(name)})`, { timeout: 20000 });
  if (!f) return null;
  const card = f.locator('.pkg-card').filter({ has: f.locator(`.pkg-card-name:text-is(${JSON.stringify(name)})`) }).first();
  await card.locator('button', { hasText: label }).first().click({ force: true });
  await pollFor(async () => !(await card.locator('button', { hasText: /Installing|Updating|Reinstalling/ }).count()), { timeout: 15000 });
  await sleep(300);
  return f;
};
const errorText = async (f) => (f ? (await f.locator('.pkg-error').allInnerTexts()).join(' | ') : '');

try {
  const initdBefore = await page.evaluate(() => { try { return window.fs.readFileSync('/.initd.run', 'utf8'); } catch (_) { return null; } });
  await writeVfs(page, { '/etc/pkg/registries.json': JSON.stringify([`${EVIL}/registry.json`]) });

  // Built-in app with hashes: installs without a prompt, then Reinstall re-verifies.
  dialogs.clear();
  let f = await clickCard('Bookmarks', 'Install');
  check('built-in app (all files hashed): installs without any prompt', (await installed()).includes('bookmarks') && dialogs.log.length === 0, JSON.stringify(dialogs.log));
  check('built-in app: its command is registered', await page.evaluate(() => !!window.platform.host.getCommand('ui.bookmarks')));
  f = await clickCard('Bookmarks', 'Reinstall');
  check('built-in app: Reinstall verifies and succeeds', !(await errorText(f)) && dialogs.log.length === 0, await errorText(f));

  // Wrong sha256 on a built-in entry → abort before writing anything.
  f = await clickCard('Hash Mismatch', 'Install');
  const mis = await errorText(f);
  check('wrong sha256: install aborted with an integrity error', /integrity check failed for main\.js/.test(mis), mis);
  check('wrong sha256: nothing written, not recorded', !(await vfs.exists(page, '/opt/apps/hash-mismatch-app')) && !(await installed()).includes('hash-mismatch-app'));

  // Built-in entry without a hash → confirm() saying so; declined → nothing.
  dialogs.clear();
  dialogs.answer({ accept: false });
  f = await clickCard('No Hash', 'Install');
  const nh = dialogs.log.find((d) => d.type === 'confirm');
  check('file without sha256: confirm() explains it can\'t be verified', !!nh && /no integrity hash/.test(nh.message), nh && nh.message);
  check('file without sha256, declined: nothing installed, no error shown', !(await vfs.exists(page, '/opt/apps/nohash-app')) && !(await installed()).includes('nohash-app') && !(await errorText(f)));

  // Third-party registry: path validation happens before any prompt or fetch.
  dialogs.clear();
  for (const [name, re] of [['Bad Id', /invalid app id/], ['Dest Slip', /file destination "..\/..\/..\/.initd.run" is not a path inside/], ['Dest Abs', /file destination "\/etc\/widgets\/pkg-evil.js"/], ['Main Slip', /main file "..\/..\/..\/home\/user1\/pkg-evil.js"/]]) {
    f = await clickCard(name, 'Install');
    const err = await errorText(f);
    check(`third-party "${name}": rejected (${re.source.slice(0, 28)}…)`, re.test(err), err);
  }
  check('rejected entries: no prompt was shown', dialogs.log.length === 0, JSON.stringify(dialogs.log));
  check('rejected entries: /.initd.run, /etc/widgets, ~/pkg-evil.js untouched',
    (await page.evaluate(() => { try { return window.fs.readFileSync('/.initd.run', 'utf8'); } catch (_) { return null; } })) === initdBefore
    && !(await vfs.exists(page, '/etc/widgets/pkg-evil.js')) && !(await vfs.exists(page, '/home/user1/pkg-evil.js')) && !(await vfs.exists(page, '/etc/main.js')));
  check('rejected entries: no payload ran', (await page.evaluate(() => window.top.__pwnedPkg)) === undefined);

  // Third-party, valid: confirm() names the registry; declined → nothing; accepted → installed + ran.
  dialogs.clear();
  dialogs.answer({ accept: false });
  f = await clickCard('Third OK', 'Install');
  const tp = dialogs.log.find((d) => d.type === 'confirm');
  check('third-party app: confirm() names the source registry', !!tp && tp.message.includes(`${EVIL}/registry.json`) && /isn't built in/.test(tp.message), tp && tp.message);
  check('third-party app, declined: not installed, nothing fetched into /opt/apps', !(await vfs.exists(page, '/opt/apps/third-ok')) && !(await installed()).includes('third-ok'));
  dialogs.answer({ accept: true });
  f = await clickCard('Third OK', 'Install');
  check('third-party app, accepted: installed and loaded', (await installed()).includes('third-ok') && (await vfs.exists(page, '/opt/apps/third-ok/main.js'))
    && (await page.evaluate(() => window.top.__thirdOk)) === 1, await errorText(f));
  const rec = await page.evaluate(() => JSON.parse(window.fs.readFileSync('/etc/pkg/installed.json', 'utf8')).find((p) => p.id === 'third-ok'));
  check('install record: appDir/mainFile inside /opt/apps/<id>', rec && rec.appDir === '/opt/apps/third-ok' && rec.mainFile === '/opt/apps/third-ok/main.js', JSON.stringify(rec));

  check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
} catch (e) {
  check('test run completed', false, e.stack || e.message);
  await page.screenshot({ path: new URL('../../screenshots/verify-files-pkg-fail.png', import.meta.url).pathname }).catch(() => {});
} finally {
  await browser.close();
}
process.exit(done() ? 1 : 0);
