// KRN-3 (+ BOOT-2, WIN-2, APP-1) — file names must never be pasted into execCommand DSL source.
// Files/folders are named like DSL breakouts — `x'),(platform.window.top.__sec_k3=1),('` — and
// opened through every entry point a user (or a peer/SSH host that chose the name) reaches:
//   Host.exec (txt/md/png/unknown ext/folder), ui.settings(initialSection),
//   Files (vfs main.js): double-click + every context-menu action, multi-selection batch menu,
//   compiled explorer (ui.file-explorer), desktop icons, Markdown "Edit in Notepad",
//   Files (Minimal) (explorer-sifi).
// Pass = the payload never runs (the sentinel stays unset) for that entry point.
import {
  newSession, boot, openWindow, ensureApp, windowFrame, step, report, done, sleep, pollFor, sentinels,
  vfsWrite, vfsMkdirp, waitBooted, closeAllWindows,
} from './lib/harness.mjs';

const DIR = '/home/user1/sec-k3';
const P = (tag) => `${tag}'),(platform.window.top.__sec_k3=1),('`;
// survives encodeURIComponent (the multi-selection menu's "escaping"): only ' ( ) . _ letters
const PM = (tag) => `${tag}')(platform.window.top.__k3probe())('`;
const FILES = {
  [`${DIR}/${P('k3txt')}.txt`]: 'hello',
  [`${DIR}/${P('k3md')}.md`]: '# hello',
  [`${DIR}/${P('k3png')}.png`]: 'not really a png',
  [`${DIR}/${P('k3zzz')}.zzz`]: 'zzz',
  [`${DIR}/${P('k3mp3')}.mp3`]: '',
  [`${DIR}/${P('k3dir')}/inner.txt`]: 'inner',
  [`${DIR}/${PM('k3ma')}.txt`]: 'a',
  [`${DIR}/${PM('k3mb')}.txt`]: 'b',
  [`/home/user1/${P('k3desk')}.txt`]: 'desktop icon',
};

const S = await newSession();
let page;
const fired = async () => {
  const s = await sentinels(page, '__sec_k3');
  await page.evaluate(() => { for (const k of Object.keys(window)) if (k.startsWith('__sec_k3')) delete window[k]; }).catch(() => {});
  return s;
};
const closeOthers = (keep) => page.evaluate((keep) => {
  for (const w of document.querySelectorAll('.window')) if (w.getAttribute('data-name') !== keep) w.remove();
}, keep).catch(() => {});
const menuTitles = () => page.evaluate(() => [...document.querySelectorAll('.contextmenu button')]
  .filter((b) => b.offsetParent !== null).map((b) => b.textContent.trim()).filter(Boolean));
const clickMenu = (title) => page.evaluate((t) => {
  const b = [...document.querySelectorAll('.contextmenu button')].find((x) => x.offsetParent !== null && x.textContent.trim() === t);
  if (!b) return false; b.click(); return true;
}, title);
const hideMenu = () => page.evaluate(() => document.querySelectorAll('.contextmenu').forEach((m) => { m.style.display = 'none'; })).catch(() => {});

/**
 * Runs every context-menu action once (destructive ones last). Before each action `prepare()`
 * rebuilds a fresh window and `openMenu()` right-clicks the target, so an action that opens a
 * second explorer or a panel can't hide the target from the next one. Returns sentinel hits.
 */
async function everyMenuAction(prepare, openMenu) {
  const LAST = /^(Delete|Move to Trash|Remove)/i;
  await prepare();
  await openMenu();
  await sleep(400);
  const titles = await menuTitles();
  await hideMenu();
  const keys = [...titles.keys()].filter((i) => !/^Paste/.test(titles[i]));
  const order = [...keys.filter((i) => !LAST.test(titles[i])), ...keys.filter((i) => LAST.test(titles[i]))];
  const hits = [], ran = [];
  for (const i of order) {
    await prepare();
    await openMenu();
    await sleep(350);
    const clicked = await page.evaluate(({ i, t }) => {
      const bs = [...document.querySelectorAll('.contextmenu button')].filter((x) => x.offsetParent !== null);
      const b = bs.find((x) => x.textContent.trim() === t) || bs[i];
      if (!b) return null;
      const title = b.textContent.trim(); b.click(); return title;
    }, { i, t: titles[i] });
    await sleep(1300);
    const s = await fired();
    ran.push(clicked === null ? titles[i] + '(menu missing)' : clicked);
    if (s.length) hits.push(clicked || titles[i]);
    await hideMenu();
  }
  await closeAllWindows(page);
  return { titles, ran, hits };
}

try {
  page = await boot(S.context);
  await vfsMkdirp(page, DIR);
  await vfsWrite(page, FILES);
  await page.evaluate(() => { window.__k3probe = () => { window.__sec_k3_multi = 1; }; });

  // Control (info): the same name pasted into DSL the pre-fix way does fire — the payload is valid.
  await step('KRN-3', 'control-payload-is-live', async () => {
    await page.evaluate((p) => { try { window.platform.host.execCommand(`service('001-core.layout', 'open-window') (command('ui.notepad'), '${p}')`, window.platform); } catch (_) {} }, `${DIR}/${P('k3txt')}.txt`);
    await sleep(800);
    const s = await fired();
    await closeAllWindows(page);
    return { pass: s.length > 0, detail: `sentinel after hand-built DSL: ${JSON.stringify(s)}` };
  }, { phase: 'info' });

  // ── Host.exec — the double-click / "open" path every explorer uses ─────────
  for (const [tag, name] of [['txt', `${P('k3txt')}.txt`], ['md', `${P('k3md')}.md`], ['png', `${P('k3png')}.png`], ['unknown-ext', `${P('k3zzz')}.zzz`], ['folder', P('k3dir')]]) {
    await step('KRN-3', `host-exec-${tag}`, async () => {
      await page.evaluate((p) => { try { window.platform.host.exec(window.platform, p); } catch (e) { window.__k3err = String(e); } }, `${DIR}/${name}`);
      await sleep(1500);
      const s = await fired();
      const w = await page.evaluate(() => [...document.querySelectorAll('.window[data-name]')].map((x) => x.getAttribute('data-name')));
      await closeAllWindows(page);
      return { pass: s.length === 0, detail: `sentinel=${JSON.stringify(s)} windows=${JSON.stringify(w)}` };
    });
  }

  // ── ui.settings(initialSection) — src/remote.ts ────────────────────────────
  await step('KRN-3', 'ui-settings-initial-section', async () => {
    await page.evaluate(() => { try { window.platform.host.callCommand('ui.settings', null, null, "x'),(platform.window.top.__sec_k3=1),('"); } catch (_) {} });
    await sleep(1500);
    const s = await fired();
    await closeAllWindows(page);
    return { pass: s.length === 0, detail: `sentinel=${JSON.stringify(s)}` };
  });

  // ── Files (vfs main.js) ────────────────────────────────────────────────────
  const openFiles = async (cmd = 'explorer') => {
    await closeAllWindows(page);
    if (!(await openWindow(page, cmd, DIR))) return null;
    const f = await windowFrame(page, cmd);
    if (!f) return null;
    const ok = await pollFor(() => f.locator('.file-item', { hasText: 'k3txt' }).count().then((n) => n > 0), 10000);
    return ok ? f : null;
  };
  const item = (f, tag) => f.locator('.file-item', { hasText: tag }).first();

  let fe = await openFiles('explorer');
  await step('KRN-3', 'files-double-click-txt', async () => {
    if (!fe) return { pass: null, detail: 'Files window did not list the folder' };
    await item(fe, 'k3txt').dblclick({ force: true });
    await sleep(1500);
    const s = await fired();
    await closeOthers('explorer');
    return { pass: s.length === 0, detail: `sentinel=${JSON.stringify(s)}` };
  });
  await step('KRN-3', 'files-double-click-audio', async () => {
    fe = await openFiles('explorer');
    if (!fe) return { pass: null, detail: 'Files window did not list the folder' };
    await item(fe, 'k3mp3').dblclick({ force: true });
    await sleep(1500);
    const s = await fired();
    await closeOthers('explorer');
    return { pass: s.length === 0, detail: `sentinel=${JSON.stringify(s)}` };
  });
  await step('KRN-3', 'files-context-menu-file', async () => {
    fe = await openFiles('explorer');
    if (!fe) return { pass: null, detail: 'Files window did not list the folder' };
    const r = await everyMenuAction(() => openFiles('explorer'), async () => { const f = await windowFrame(page, 'explorer'); await item(f, 'k3txt').click({ button: 'right', force: true }); });
    if (!r.titles.length) return { pass: null, detail: 'no context menu appeared' };
    return { pass: r.hits.length === 0, detail: `fired on: ${JSON.stringify(r.hits)}; actions tried: ${JSON.stringify(r.ran)}` };
  });
  await step('KRN-3', 'files-context-menu-folder', async () => {
    await vfsWrite(page, FILES); // earlier menu loops end with Delete
    fe = await openFiles('explorer');
    if (!fe) return { pass: null, detail: 'Files window did not list the folder' };
    const r = await everyMenuAction(() => openFiles('explorer'), async () => { const f = await windowFrame(page, 'explorer'); await item(f, 'k3dir').click({ button: 'right', force: true }); });
    if (!r.titles.length) return { pass: null, detail: 'no context menu appeared' };
    return { pass: r.hits.length === 0, detail: `fired on: ${JSON.stringify(r.hits)}; actions tried: ${JSON.stringify(r.ran)}` };
  });
  await step('WIN-2', 'files-multi-select-menu', async () => {
    await vfsWrite(page, FILES); // earlier menu loops end with Delete
    fe = await openFiles('explorer');
    if (!fe) return { pass: null, detail: 'Files window did not list the folder' };
    let titles = [];
    for (const mod of ['Meta', 'Control']) {
      await item(fe, 'k3ma').click({ force: true });
      await item(fe, 'k3mb').click({ force: true, modifiers: [mod] });
      await sleep(300);
      await item(fe, 'k3mb').click({ button: 'right', force: true });
      await sleep(400);
      titles = await menuTitles();
      if (titles.some((t) => /^Download|^Delete/.test(t)) && !titles.includes('Rename')) break;
      await hideMenu();
    }
    if (!titles.length || titles.includes('Rename')) { await hideMenu(); return { pass: null, detail: 'could not get the multi-selection menu: ' + JSON.stringify(titles) }; }
    const hits = [];
    for (const t of titles.filter((x) => /^Download/.test(x))) {
      await clickMenu(t);
      await sleep(1200);
      if ((await fired()).length) hits.push(t);
      await item(fe, 'k3ma').click({ force: true });
      await item(fe, 'k3mb').click({ force: true, modifiers: ['Meta'] });
      await item(fe, 'k3mb').click({ force: true, modifiers: ['Control'] }).catch(() => {});
    }
    await hideMenu();
    return { pass: hits.length === 0, detail: `menu=${JSON.stringify(titles)} fired on: ${JSON.stringify(hits)}` };
  });

  // ── compiled explorer (ui.file-explorer, src/apps/file-explorer/index.tsx) ─
  await step('WIN-2', 'compiled-explorer-double-click-audio', async () => {
    await vfsWrite(page, FILES); // earlier menu loops end with Delete
    const f = await openFiles('ui.file-explorer');
    if (!f) return { pass: null, detail: 'ui.file-explorer did not list the folder' };
    await item(f, 'k3mp3').dblclick({ force: true });
    await sleep(1500);
    const s = await fired();
    return { pass: s.length === 0, detail: `sentinel=${JSON.stringify(s)}` };
  });
  await step('WIN-2', 'compiled-explorer-context-menu', async () => {
    await vfsWrite(page, FILES); // earlier menu loops end with Delete
    const f = await openFiles('ui.file-explorer');
    if (!f) return { pass: null, detail: 'ui.file-explorer did not list the folder' };
    const r = await everyMenuAction(() => openFiles('ui.file-explorer'), async () => { const ff = await windowFrame(page, 'ui.file-explorer'); await item(ff, 'k3txt').click({ button: 'right', force: true }); });
    if (!r.titles.length) return { pass: null, detail: 'no context menu appeared' };
    return { pass: r.hits.length === 0, detail: `fired on: ${JSON.stringify(r.hits)}; actions tried: ${JSON.stringify(r.ran)}` };
  });

  // ── compiled Markdown viewer: "Edit in Notepad" ────────────────────────────
  await step('WIN-2', 'markdown-edit-in-notepad', async () => {
    await vfsWrite(page, FILES); // earlier menu loops end with Delete
    await closeAllWindows(page);
    await openWindow(page, 'ui.markdown', `${DIR}/${P('k3md')}.md`);
    await sleep(1200);
    const clicked = await page.evaluate(() => {
      const win = document.querySelector('.window[data-name="ui.markdown"]');
      if (!win) return 'no window';
      const btn = win.querySelector('[title="Edit in Notepad"], [aria-label="Edit in Notepad"]')
        || [...win.querySelectorAll('*')].find((e) => e.textContent === 'edit_note' && e.children.length === 0);
      if (!btn) return 'no button'; btn.click(); return 'clicked';
    });
    await sleep(1300);
    const s = await fired();
    await closeAllWindows(page);
    if (clicked !== 'clicked') return { pass: null, detail: clicked };
    return { pass: s.length === 0, detail: `sentinel=${JSON.stringify(s)}` };
  });

  // ── desktop icons (layout) — /home/user1 is the desktop folder ────────────
  await page.reload({ waitUntil: 'load' });
  await waitBooted(page, 90000);
  await page.evaluate(() => { window.__k3probe = () => { window.__sec_k3_multi = 1; }; });
  const deskItem = () => page.locator('.vfs-desktop-icon, .desktop-item', { hasText: 'k3desk' }).first();
  await step('KRN-3', 'desktop-icon-double-click', async () => {
    if (!(await pollFor(() => deskItem().count(), 15000))) return { pass: null, detail: 'desktop icon not shown' };
    await deskItem().dblclick({ force: true });
    await sleep(1500);
    const s = await fired();
    await closeAllWindows(page);
    return { pass: s.length === 0, detail: `sentinel=${JSON.stringify(s)}` };
  });
  await step('KRN-3', 'desktop-icon-context-menu', async () => {
    if (!(await pollFor(() => deskItem().count(), 10000))) return { pass: null, detail: 'desktop icon not shown' };
    const r = await everyMenuAction(() => closeAllWindows(page), async () => {
      const it = deskItem();
      const inner = it.locator('.file, .vfs-desktop-icon-img').first();
      if (await inner.count()) await inner.click({ button: 'right', force: true }); else await it.click({ button: 'right', force: true });
    });
    if (!r.titles.length) return { pass: null, detail: 'no context menu appeared' };
    return { pass: r.hits.length === 0, detail: `fired on: ${JSON.stringify(r.hits)}; actions tried: ${JSON.stringify(r.ran)}` };
  });

  // ── Files (Minimal) — explorer-sifi (loaded last: it also claims `explorer`) ─
  await step('APP-1', 'explorer-sifi-double-click-and-menu', async () => {
    await vfsWrite(page, FILES); // earlier menu loops end with Delete
    if (!(await ensureApp(page, 'explorer-sifi', 'explorer-sifi'))) return { pass: null, detail: 'explorer-sifi not available' };
    let f = null, found = false;
    for (let attempt = 0; attempt < 2 && !found; attempt++) { // slow under load: retry once with a fresh window
      await closeAllWindows(page);
      await openWindow(page, 'explorer-sifi', DIR);
      f = await windowFrame(page, 'explorer-sifi', 20000);
      if (!f) continue;
      found = await pollFor(() => f.locator('text=/k3txt/').count().then((n) => n > 0).catch(() => false), 20000);
    }
    if (!f) return { pass: null, detail: 'explorer-sifi window not found' };
    if (!found) return { pass: null, detail: 'explorer-sifi did not list the folder' };
    const el = f.locator('text=/k3txt/').first();
    await el.dblclick({ force: true });
    await sleep(1500);
    const s1 = await fired();
    await closeOthers('explorer-sifi');
    const prepSifi = async () => { await closeAllWindows(page); await openWindow(page, 'explorer-sifi', DIR); const ff = await windowFrame(page, 'explorer-sifi'); await pollFor(() => ff.locator('text=/k3txt/').count(), 8000); };
    const r = await everyMenuAction(prepSifi, async () => { const ff = await windowFrame(page, 'explorer-sifi'); await ff.locator('text=/k3txt/').first().click({ button: 'right', force: true }); });
    return { pass: s1.length === 0 && r.hits.length === 0, detail: `double-click sentinel=${JSON.stringify(s1)}; menu fired on: ${JSON.stringify(r.hits)}; actions: ${JSON.stringify(r.ran)}` };
  });
} catch (e) {
  report('KRN-3', null, 'script error: ' + (e && e.stack || e), { check: 'harness' });
} finally {
  await S.close();
}
done('test-dsl-injection');
