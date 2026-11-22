// 1D.1 (audit KRN-3, APP-1, BOOT-2; decisions.md D9/D10) — no file name, app name or path
// reaches DSL source in the file-explorer, explorer-sifi, app-drawer, spotlight or pkg-manager:
// every menu entry / launch passes values (Host.openWindow / callCommand / runFile).
//
// Hostile names break out of a '…'-quoted DSL string: before the fix, Edit / Open with / Copy /
// Delete N items / Open-with-file / Spotlight "install" on such a name ran `top.__pwnedDsl = N`.
// Also covers: the explorer "Run" item (runFile, confirm naming the file; cancelled → nothing
// runs), double-click on a script only opens it, the default-explorer preference
// (explorer → explorer-sifi hand-off, arbitrary commands ignored), app-drawer "Open with file…",
// Spotlight's not-installed entry, pkg-manager "Open".
//
// Run: node testing/scripts/security/verify-files-dsl.mjs   (dev server on :8080)
import {
  launch, installApp, bootReady, writeVfs, makeReporter, sleep, pollFor, installSpies, resetSpies, getSpies,
  installDialogs, findFrame, fileItem, clickMenu, menuTitles, closeMenu, closeAllWindows, vfs,
} from './verify-files-lib.mjs';

const { check, done } = makeReporter();
const DIR = '/home/user1/dsltest';
const H1 = "x'),top.__pwnedDsl=1,('.txt";
const H2 = 'y"),top.__pwnedDsl=2,("b.txt';
const H3 = "d'),top.__pwnedDsl=3,('.txt";
const SUB = "sub')+(top.__pwnedDsl=4)+('";
const RENAMED = "renamed'),top.__pwnedDsl=7,('.txt";
const SCRIPT = 'script.js';
const RUNNER = 'hello.run';
const HOSTILE_APP = "Evil'),top.__pwnedDsl=6,('";

const browser = await launch();
const context = await browser.newContext({ acceptDownloads: true });
// Spotlight's not-installed list comes from /registry.json: add an app with a hostile name.
await context.route('**/registry.json', async (route) => {
  const res = await route.fetch();
  const data = await res.json();
  data.apps.push({ id: 'evil-app', name: HOSTILE_APP, version: '1.0.0', files: [], main: 'main.js', category: 'Test' });
  await route.fulfill({ response: res, body: JSON.stringify(data), headers: { ...res.headers(), 'content-type': 'application/json' } });
});
const page = await bootReady(context);
const dialogs = installDialogs(page);
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.stack || e.message).split('\n').slice(0, 4).join(' ⟵ ')));

const pwned = () => page.evaluate(() => window.top.__pwnedDsl);
const ran = () => page.evaluate(() => window.top.__ranScript || 0);
const spies = () => getSpies(page);
const lastOpen = async () => (await spies()).openWindow.at(-1);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Every step starts from one fresh window, so a window opened by an earlier step (Notepad, …)
// never sits on top of the explorer and swallows the next click.
const openExplorer = async (cmd = 'explorer', dir = DIR, marker = SCRIPT) => {
  await closeAllWindows(page);
  await page.evaluate(({ c, d }) => window.platform.host.openWindow(c, d), { c: cmd, d: dir });
  const sel = cmd === 'explorer-sifi' ? '.sifi-explorer' : '.file-explorer';
  return findFrame(page, `${sel} .file-name:text-is(${JSON.stringify(marker)})`);
};
const rightClick = async (frame, name) => {
  await fileItem(frame, name).click({ button: 'right', force: true });
  await sleep(150);
};
const backgroundClick = async (frame) => {
  const main = frame.locator('main').first();
  const box = await main.boundingBox();
  await main.click({ button: 'right', force: true, position: { x: Math.max(5, box.width - 12), y: Math.max(5, box.height - 12) } });
  await sleep(150);
};
// Right-click `name` in a fresh window of `cmd` and pick `title`; returns the last openWindow call.
const menuAction = async (cmd, name, title) => {
  const f = await openExplorer(cmd);
  await resetSpies(page);
  await rightClick(f, name);
  const clicked = await clickMenu(page, title);
  await sleep(350);
  return { clicked, open: await lastOpen() };
};

try {
  await installSpies(page);
  await vfs.rm(page, DIR);
  await writeVfs(page, {
    [`${DIR}/${H1}`]: 'one', [`${DIR}/${H2}`]: 'two', [`${DIR}/${H3}`]: 'three', [`${DIR}/plain.txt`]: 'plain',
    [`${DIR}/${SCRIPT}`]: 'window.top.__ranScript = (window.top.__ranScript || 0) + 1;',
    [`${DIR}/${RUNNER}`]: 'top.__ranRun = $args;',
    [`${DIR}/${SUB}/keep.txt`]: 'k',
  });
  await vfs.writeBytes(page, `${DIR}/song.mp3`, [0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0]);

  // ── file-explorer (opt/apps/file-explorer/main.js) ─────────────────────────────────────────
  let fx = await openExplorer();
  check('explorer: window opens on the test folder', !!fx);
  await rightClick(fx, H1);
  const titles = await menuTitles(page);
  check('explorer: file menu entries present', ['Edit', 'Open', 'Download', 'Delete', 'Rename', 'Compare with…', 'Compress to ZIP', 'Copy', 'Cut', 'Properties', 'Browser'].every((t) => titles.includes(t)), JSON.stringify(titles));
  check('explorer: no Run entry for a .txt file', !titles.includes('Run'));
  await closeMenu(page);

  let r = await menuAction('explorer', H1, 'Edit');
  check('explorer Edit: openWindow(ui.notepad, exact path)', same(r.open, ['ui.notepad', `${DIR}/${H1}`]), JSON.stringify(r.open));
  r = await menuAction('explorer', H2, 'Compare with…');
  check('explorer Compare with…: openWindow(ui.diff, path, "")', same(r.open, ['ui.diff', `${DIR}/${H2}`, '']), JSON.stringify(r.open));
  r = await menuAction('explorer', H2, 'Browser');
  check('explorer Open with › Browser (group child): openWindow(ui.iframe, path)', same(r.open, ['ui.iframe', `${DIR}/${H2}`]), JSON.stringify(r.open));
  r = await menuAction('explorer', H2, 'Open');
  check('explorer Open: openWindow(ui.iframe, path)', same(r.open, ['ui.iframe', `${DIR}/${H2}`]), JSON.stringify(r.open));
  check('explorer Edit/Compare/Open with/Open: no code ran', (await pwned()) === undefined);

  // Copy a hostile file, paste it into a hostile-named sub folder (background menu).
  fx = await openExplorer();
  await rightClick(fx, H1);
  await clickMenu(page, 'Copy');
  await sleep(200);
  await fileItem(fx, SUB).dblclick({ force: true });
  const sf = await findFrame(page, '.file-explorer .file-name:text-is("keep.txt")');
  check('explorer: navigates into a hostile-named folder', !!sf);
  await backgroundClick(sf);
  const bg = await menuTitles(page);
  const pasteTitle = bg.find((t) => t.startsWith('Paste'));
  check('explorer background menu: Paste / New Folder / New File', !!pasteTitle && bg.includes('New Folder') && bg.includes('New File'), JSON.stringify(bg));
  if (pasteTitle) await clickMenu(page, pasteTitle);
  await sleep(300);
  check('explorer Copy → Paste: copy lands in the sub folder', await vfs.exists(page, `${DIR}/${SUB}/${H1}`));
  dialogs.answer({ accept: true, text: "new'),top.__pwnedDsl=8,('dir" });
  await backgroundClick(sf);
  await clickMenu(page, 'New Folder');
  await sleep(300);
  check('explorer New Folder: created with the typed (hostile) name', await vfs.exists(page, `${DIR}/${SUB}/new'),top.__pwnedDsl=8,('dir`));
  check('explorer Copy/Paste/New Folder: no code ran', (await pwned()) === undefined);

  // Rename with a hostile new name (prompt), Properties, Delete.
  fx = await openExplorer();
  dialogs.answer({ accept: true, text: RENAMED });
  await rightClick(fx, 'plain.txt');
  await clickMenu(page, 'Rename');
  await sleep(400);
  check('explorer Rename: file renamed to the typed (hostile) name', await vfs.exists(page, `${DIR}/${RENAMED}`));
  fx = await openExplorer();
  await rightClick(fx, H2);
  await clickMenu(page, 'Properties');
  const props = await findFrame(page, '.file-explorer h3:text-is("Properties")', { timeout: 4000 });
  check('explorer Properties: dialog shows', !!props);
  if (props) await props.locator('button', { hasText: 'OK' }).click({ force: true });
  fx = await openExplorer();
  await rightClick(fx, RENAMED);
  await clickMenu(page, 'Delete');
  await sleep(300);
  check('explorer Delete: hostile-named file removed', !(await vfs.exists(page, `${DIR}/${RENAMED}`)));
  check('explorer Rename/Properties/Delete: no code ran', (await pwned()) === undefined);

  // Multi-selection: Delete 2 items with quote-breaking names.
  fx = await openExplorer();
  await fileItem(fx, H3).click({ force: true });
  await fileItem(fx, H1).click({ force: true, modifiers: ['Meta'] });
  await sleep(150);
  dialogs.answer({ accept: true });
  await rightClick(fx, H1);
  const multi = await menuTitles(page);
  check('explorer multi-select: "Delete 2 items" + Download offered', multi.includes('Delete 2 items') && multi.includes('Download'), JSON.stringify(multi));
  await clickMenu(page, 'Delete 2 items');
  await sleep(400);
  check('explorer multi-select Delete: both files removed', !(await vfs.exists(page, `${DIR}/${H1}`)) && !(await vfs.exists(page, `${DIR}/${H3}`)));
  check("explorer multi-select: no code ran (encodeURIComponent left ' unescaped before)", (await pwned()) === undefined);

  // Run (explicit) vs double-click (view): runFile + confirmation naming the file.
  dialogs.clear();
  dialogs.answer({ accept: false });
  r = await menuAction('explorer', SCRIPT, 'Run');
  check('explorer: Run offered for a .js file', r.clicked);
  const conf = dialogs.log.find((d) => d.type === 'confirm');
  check('explorer Run: confirmation names the file', !!conf && conf.message.includes(`${DIR}/${SCRIPT}`), conf && conf.message);
  check('explorer Run cancelled: script did not run', (await ran()) === 0);
  check('explorer Run: goes through Host.runFile', (await spies()).runFile.some((c) => c[1] === `${DIR}/${SCRIPT}`));
  dialogs.answer({ accept: true });
  await menuAction('explorer', SCRIPT, 'Run');
  await pollFor(async () => (await ran()) === 1, { timeout: 3000 });
  check('explorer Run confirmed: script ran once', (await ran()) === 1);
  dialogs.answer({ accept: true });
  await menuAction('explorer', RUNNER, 'Run');
  const ranRun = await pollFor(() => page.evaluate(() => window.top.__ranRun), { timeout: 3000 });
  check('explorer Run .run: runs with its folder as $args[0]', same(ranRun, [DIR]), JSON.stringify(ranRun));
  fx = await openExplorer();
  await resetSpies(page);
  await fileItem(fx, SCRIPT).dblclick({ force: true });
  await sleep(500);
  check('explorer double-click on a home .js only opens it (editor), does not run', (await ran()) === 1
    && (await spies()).openWindow.some((c) => c[0] === 'ui.notepad' && c[1] === `${DIR}/${SCRIPT}`), JSON.stringify((await spies()).openWindow));
  fx = await openExplorer();
  await resetSpies(page);
  await fileItem(fx, 'song.mp3').dblclick({ force: true });
  await sleep(400);
  check('explorer double-click audio: openWindow(ui.audioplayer, path)', (await spies()).openWindow.some((c) => c[0] === 'ui.audioplayer' && c[1] === `${DIR}/song.mp3`), JSON.stringify((await spies()).openWindow));

  // Folder menu: Open in explorer.
  r = await menuAction('explorer', SUB, 'Open in explorer');
  check('explorer folder "Open in explorer": openWindow(explorer, path)', same(r.open, ['explorer', `${DIR}/${SUB}`]), JSON.stringify(r.open));
  check('explorer: the folder opens in a second window', !!(await findFrame(page, '.file-explorer .file-name:text-is("keep.txt")')));

  // ── explorer-sifi (a registry app: load it the way the package loader does) ──────────────
  await installApp(page, 'explorer-sifi');
  check('explorer-sifi: registers its command', await page.evaluate(() => !!window.platform.host.getCommand('explorer-sifi')));
  check('explorer-sifi: window opens on the test folder', !!(await openExplorer('explorer-sifi')));
  r = await menuAction('explorer-sifi', H2, 'Edit');
  check('explorer-sifi Edit: openWindow(ui.notepad, exact path)', same(r.open, ['ui.notepad', `${DIR}/${H2}`]), JSON.stringify(r.open));
  r = await menuAction('explorer-sifi', H2, 'Text Editor');
  check('explorer-sifi Open with › Text Editor: openWindow(ui.notepad, path)', same(r.open, ['ui.notepad', `${DIR}/${H2}`]), JSON.stringify(r.open));
  r = await menuAction('explorer-sifi', SUB, 'Open');
  check('explorer-sifi folder Open: openWindow(explorer-sifi, path)', same(r.open, ['explorer-sifi', `${DIR}/${SUB}`]), JSON.stringify(r.open));
  fx = await openExplorer('explorer-sifi');
  await rightClick(fx, H2);
  await clickMenu(page, 'Copy');
  await backgroundClick(fx);
  const sbg = await menuTitles(page);
  check('explorer-sifi background menu: Paste / New Folder / New File', ['Paste', 'New Folder', 'New File'].every((t) => sbg.includes(t)), JSON.stringify(sbg));
  await closeMenu(page);
  dialogs.clear();
  dialogs.answer({ accept: false });
  r = await menuAction('explorer-sifi', SCRIPT, 'Run');
  check('explorer-sifi Run: confirmation names the file, cancel → not run', r.clicked
    && dialogs.log.some((d) => d.type === 'confirm' && d.message.includes(`${DIR}/${SCRIPT}`)) && (await ran()) === 1, JSON.stringify(dialogs.log));
  check('explorer-sifi: no code ran', (await pwned()) === undefined);

  // Default-explorer preference: 'explorer' hands off to explorer-sifi (no re-registration);
  // any other command named in the (writable) preferences file is ignored.
  const prefsBefore = await page.evaluate(() => { try { return window.fs.readFileSync('/user-preferences.json', 'utf8'); } catch (_) { return null; } });
  const setPref = (v) => page.evaluate((v) => {
    let p = {};
    try { p = JSON.parse(window.fs.readFileSync('/user-preferences.json', 'utf8') || '{}'); } catch (_) {}
    window.fs.writeFileSync('/user-preferences.json', JSON.stringify({ ...p, default_explorer: v }));
  }, v);
  await setPref('explorer-sifi');
  await closeAllWindows(page);
  await page.evaluate((d) => window.platform.host.openWindow('explorer', d), DIR);
  check('default explorer = Minimal: "explorer" opens the explorer-sifi UI', !!(await findFrame(page, `.sifi-explorer .file-name:text-is("${SCRIPT}")`)));
  await setPref('ui.terminal');
  await closeAllWindows(page);
  await page.evaluate((d) => window.platform.host.openWindow('explorer', d), DIR);
  check('default explorer = arbitrary command: ignored, standard explorer opens', !!(await findFrame(page, `.file-explorer .file-name:text-is("${SCRIPT}")`)));
  await page.evaluate((s) => { if (s === null) { try { window.fs.unlinkSync('/user-preferences.json'); } catch (_) {} } else window.fs.writeFileSync('/user-preferences.json', s); }, prefsBefore);
  await closeAllWindows(page);

  // ── app-drawer: "Open with file…" with a hostile path ─────────────────────────────────────
  await resetSpies(page);
  await page.evaluate(() => window.platform.host.callCommand('ui.app-drawer'));
  await sleep(500);
  await page.locator('#__app-drawer-root__ input.ad-search').fill('Edit (about');
  await sleep(300);
  await page.locator('#__app-drawer-root__').getByText('Edit (about.html)', { exact: true }).first().click({ button: 'right', force: true });
  await sleep(200);
  // The entry is <div><span>folder_open</span>Open with file…</div>: click it by its label.
  await page.evaluate(() => [...document.querySelectorAll('#__app-drawer-root__ div')]
    .find((d) => d.lastChild && d.lastChild.nodeType === 3 && d.lastChild.textContent === 'Open with file…').click());
  const hostilePath = `${DIR}/${H2}`;
  await page.locator('input[placeholder="/home/user1/data.csv"]').fill(hostilePath);
  await page.getByText('Open', { exact: true }).last().click({ force: true });
  await sleep(500);
  const adOpen = (await spies()).openWindow.find((c) => c[0] === 'ui.notepad');
  check('app-drawer Open with file…: openWindow(ui.notepad, typed path)', !!adOpen && adOpen[1] === hostilePath, JSON.stringify((await spies()).openWindow));
  check('app-drawer: no code ran', (await pwned()) === undefined);
  await page.keyboard.press('Escape');
  await closeAllWindows(page);

  // ── spotlight: a not-installed registry app with a hostile name ───────────────────────────
  await resetSpies(page);
  await page.evaluate(() => window.platform.host.callCommand('spotlight'));
  await sleep(300);
  await page.locator('input[placeholder="Search commands, files…"]').fill('Evil');
  const evilRow = page.getByText(HOSTILE_APP, { exact: true }).first();
  const evilShown = await pollFor(async () => (await evilRow.count()) > 0, { timeout: 4000 });
  check('spotlight: hostile not-installed app listed', !!evilShown);
  if (evilShown) await evilRow.click({ force: true });
  await sleep(600);
  const spOpen = (await spies()).openWindow.find((c) => c[0] === 'ui.pkg-manager');
  check('spotlight not-installed: openWindow(ui.pkg-manager, app name)', !!spOpen && spOpen[1] === HOSTILE_APP, JSON.stringify((await spies()).openWindow));
  check('spotlight: no code ran', (await pwned()) === undefined);
  await closeAllWindows(page);

  // ── pkg-manager: "Open" on an installed app → openWindow(commandName) ─────────────────────
  // (App Launcher: the Image Viewer throws when opened without a file — its own, pre-existing bug.)
  await resetSpies(page);
  await page.evaluate(() => window.platform.host.openWindow('ui.pkg-manager', 'App Launcher'));
  const pm = await findFrame(page, '.pkg-root .pkg-nav-item:has-text("Installed")');
  await pm.locator('.pkg-nav-item', { hasText: 'Installed' }).click({ force: true });
  const pm2 = await findFrame(page, '.pkg-list-row:has-text("App Launcher")');
  await pm2.locator('.pkg-list-row', { hasText: 'App Launcher' }).locator('button', { hasText: 'Open' }).click({ force: true });
  await sleep(500);
  check('pkg-manager Open: openWindow(ui.app-launcher)', (await spies()).openWindow.some((c) => c[0] === 'ui.app-launcher' && c.length === 1), JSON.stringify((await spies()).openWindow));
  await closeAllWindows(page);

  // ── no-arg launches (keybindings, launchers): run() → openWindow(own command) ────────────
  await installApp(page, 'bookmarks');
  for (const name of ['explorer', 'explorer-sifi', 'ui.pkg-manager', 'ui.task-manager', 'ui.app-launcher', 'ui.bookmarks']) {
    await closeAllWindows(page);
    await resetSpies(page);
    await page.evaluate((n) => window.platform.host.callCommand(n), name);
    await sleep(500);
    const opened = (await spies()).openWindow.some((c) => c[0] === name && c.length === 1);
    const windows = await page.evaluate(() => document.querySelectorAll('.window .wm-close').length);
    check(`no-arg launch ${name}: openWindow(${name}) and a window opens`, opened && windows === 1, JSON.stringify({ calls: (await spies()).openWindow, windows }));
  }
  await closeAllWindows(page);

  check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
  check('nothing ever executed a hostile name', (await pwned()) === undefined);
} catch (e) {
  check('test run completed', false, e.stack || e.message);
  await page.screenshot({ path: new URL('../../screenshots/verify-files-dsl-fail.png', import.meta.url).pathname }).catch(() => {});
} finally {
  await vfs.rm(page, DIR).catch(() => {});
  await browser.close();
}
process.exit(done() ? 1 : 0);
