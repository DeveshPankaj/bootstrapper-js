// TODO 1F.10 — /etc/settings sections: no DSL strings built from values (audit KRN-3) and help
// text that matches phase-1 behaviour.
//  - 02-projects.js: a project file named `x');top.__pwned_set1=1;('.js` is clicked → it opens in
//    the editor (open = view, D10) and nothing runs (before: DSL injection + the script ran).
//  - 20-managers.js: VFS-file entries open via openWindow; WM/desktop module text says they run
//    from the shipped copy (view-only vfs copy), not "re-read on every new window".
//  - 19-apps.js: "Install from App Manager" opens pkg-manager with the search term as a value.
//  - 08-storage.js: help text says a ?fsBackend= link asks for confirmation.
// Static check: no execCommand with ${…} or string concatenation left in /etc/settings.
//
// Run: node testing/scripts/security/verify-viewers-settings.mjs   (OS dev server on :8080)
// Exit code: 0 = all checks pass, 1 = a check failed.
import fsNode from 'node:fs';
import { launch, bootReady, check, finish, sleep, pollFor, openApp, findFrame, pwnedKeys, writeFiles } from './verify-viewers-lib.mjs';

const EVIL = "x');top.__pwned_set1=1;('.js";
const SETTINGS_DIR = new URL('../../../docs/public/mount/etc/settings/', import.meta.url);

const browser = await launch();
const context = await browser.newContext();
try {
  const page = await bootReady(context);
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  await writeFiles(page, { [`/home/user1/projects/${EVIL}`]: 'top.__pwned_set_run = 1' });
  await openApp(page, 'ui.settings');
  const f = await findFrame(page, { selector: '.settings-nav-item', text: 'Projects', timeout: 30000 });
  check('Settings opens', !!f);
  if (!f) throw new Error('settings frame not found');
  // element.click() in the page: windows opened by earlier steps may overlap the Settings window
  const go = async (label) => { await f.locator('.settings-nav-item', { hasText: label }).first().evaluate((el) => el.click()); await sleep(800); };
  const closeEditors = () => page.evaluate(() => document.querySelectorAll('.window[data-name="ui.notepad"]').forEach((w) => w.remove()));
  const windows = () => page.evaluate(() => [...document.querySelectorAll('.window[data-name]')].map((w) => w.getAttribute('data-name')));

  // ── Projects ──
  await go('Projects');
  const card = f.locator('.project-card', { hasText: EVIL });
  check('Projects lists the hostile file name', (await card.count()) === 1);
  await card.first().evaluate((el) => el.click());
  const opened = await pollFor(async () => ((await windows()).includes('ui.notepad') ? await windows() : null), 8000);
  check('clicking a .js project opens it in the editor (open = view)', !!opened, opened);
  await sleep(500);
  check('nothing ran (no DSL injection, script not executed)', (await pwnedKeys(page)).length === 0, JSON.stringify(await pwnedKeys(page)));
  check('no run confirmation was needed to view', dialogs.length === 0, dialogs);
  await closeEditors();

  // ── Managers ──
  await go('Managers');
  const wmEntry = f.locator('div[title="Open in editor"]', { hasText: '/opt/window-manager.js' });
  const wmText = (await wmEntry.first().textContent().catch(() => '')) || '';
  check('Managers: WM script described as view-only reference copy', /view-only/.test(wmText) && !/re-read on every new window/.test(wmText), wmText);
  const deskText = (await f.locator('div[title="Open in editor"]', { hasText: '/opt/desktop/manager.js' }).first().textContent().catch(() => '')) || '';
  check('Managers: desktop manager described as view-only', /view-only/.test(deskText) && !/Edit to customise/.test(deskText), deskText);
  const before = (await windows()).filter((w) => w === 'ui.notepad').length;
  await wmEntry.first().evaluate((el) => el.click());
  check('Managers: entry opens the file in the editor (openWindow with a value)',
    !!(await pollFor(async () => (await windows()).filter((w) => w === 'ui.notepad').length > before || null, 6000)));

  // ── Apps ──
  await go('Apps');
  const install = f.locator('div', { hasText: /^Install from App Manager$/ });
  if (await install.count()) {
    await install.first().evaluate((el) => el.click());
    check('Apps: "Install from App Manager" opens App Manager', !!(await pollFor(async () => (await windows()).includes('ui.pkg-manager') || null, 8000)), await windows());
  } else {
    check('Apps: (every optional app installed — install link not shown)', true);
  }

  // ── Storage ──
  await go('Storage');
  const hint = await f.evaluate(() => [...document.querySelectorAll('.settings-hint')].map((e) => e.textContent).join(' | '));
  check('Storage: help text says a ?fsBackend= link asks for confirmation', /asks you to confirm/.test(hint) && !/can be overridden/.test(hint), hint.slice(0, 240));

  // ── static: no DSL built from values anywhere in /etc/settings ──
  const offenders = [];
  for (const name of fsNode.readdirSync(SETTINGS_DIR)) {
    const src = fsNode.readFileSync(new URL(name, SETTINGS_DIR), 'utf8');
    src.split('\n').forEach((line, i) => {
      // real calls only (21-architecture.js mentions execCommand inside documentation strings)
      if (/(^|[^'"`\w.])platform\.host\.execCommand\(\s*(`[^`]*\$\{|[^)'"`]*['"`]\s*\+|(cmd|str)\b)/.test(line)) offenders.push(`${name}:${i + 1}`);
    });
  }
  check('static: no interpolated execCommand in /etc/settings', offenders.length === 0, offenders);
  check('no payload ran (overall)', (await pwnedKeys(page)).length === 0, JSON.stringify(await pwnedKeys(page)));
} catch (e) {
  check('script error', false, String(e && e.stack || e));
} finally {
  await browser.close();
}
finish('verify-viewers-settings');
