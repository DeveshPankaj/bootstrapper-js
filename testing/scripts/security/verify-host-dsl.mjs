// Verifies 1B.2 (audit KRN-3, BOOT-2, WIN-2, APP-1): file paths and other values never get
// pasted into execCommand DSL source by Host.exec, src/remote.ts, the compiled explorer
// (src/apps/file-explorer/index.tsx), Notepad or the compiled Markdown viewer.
//
//   static  — no execCommand(...) call with `${` interpolation in the host owner's files
//   runtime — files/folders named like DSL breakouts are opened through every one of those
//             paths; the payload must never run, and the right window must still open.
//
// Run: node testing/scripts/security/verify-host-dsl.mjs   (OS dev server on :8080)
// Exit code: 0 = all checks pass, 1 = a check failed.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { launch, bootOS } from './spike-lib.mjs';

const ROOT = new URL('../../../', import.meta.url).pathname;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

// ── static ────────────────────────────────────────────────────────────────
const OWNED = ['src/shared', 'src/remote.ts', 'src/platform', 'src/core/iframe', 'src/apps', 'src/modules'];
const files = [];
const walk = (p) => { const s = statSync(p); if (s.isDirectory()) readdirSync(p).forEach((n) => walk(join(p, n))); else if (/\.(ts|tsx)$/.test(p)) files.push(p); };
OWNED.forEach((p) => { try { walk(join(ROOT, p)); } catch (_) {} });
const offenders = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  // every execCommand( call: take the text up to the matching close paren (good enough for these files)
  for (const m of src.matchAll(/execCommand\(/g)) {
    let depth = 0, i = m.index + 'execCommand'.length, end = i;
    for (; end < src.length; end++) { if (src[end] === '(') depth++; else if (src[end] === ')' && --depth === 0) break; }
    const call = src.slice(m.index, end + 1);
    if (call.includes('${')) offenders.push(`${f.slice(ROOT.length)}:${src.slice(0, m.index).split('\n').length}`);
  }
  // DSL source strings handed to the layout's context menu (`cmd:`) must not interpolate either
  for (const m of src.matchAll(/cmd:\s*`[^`]*\$\{/g)) offenders.push(`${f.slice(ROOT.length)}:${src.slice(0, m.index).split('\n').length} (cmd template)`);
  // ...nor any template literal that builds DSL in a variable first (service('…')/command('…') with `${`)
  for (const m of src.matchAll(/`[^`]*(?:service\(|command\()[^`]*\$\{[^`]*`/g)) offenders.push(`${f.slice(ROOT.length)}:${src.slice(0, m.index).split('\n').length} (DSL template)`);
}
check('static: no interpolated execCommand / cmd DSL in host-owned files', offenders.length === 0, offenders.join(', '));

// ── runtime ───────────────────────────────────────────────────────────────
const DIR = '/home/user1/dsl-verify';
const evil = (tag) => `a'),(platform.window.top.__pwned_${tag}=1),('`;
const pollFor = async (page, fn, arg, ms = 10000) => {
  const end = Date.now() + ms; let v;
  while (Date.now() < end) { v = await page.evaluate(fn, arg).catch(() => null); if (v) return v; await page.waitForTimeout(300); }
  return v;
};
const pwned = (page) => page.evaluate(() => Object.keys(window).filter((k) => k.startsWith('__pwned_')));
const windowsOf = (page, name) => page.evaluate((n) => document.querySelectorAll(`.window[data-name="${n}"]`).length, name);
const closeAll = (page) => page.evaluate(() => document.querySelectorAll('.window').forEach((w) => w.remove()));

const browser = await launch();
const context = await browser.newContext();
try {
  const page = await bootOS(context);
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.evaluate(({ DIR, names }) => {
    const fs = window.fs;
    if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
    for (const [n, c] of Object.entries(names)) { if (n.endsWith('/')) { if (!fs.existsSync(`${DIR}/${n.slice(0, -1)}`)) fs.mkdirSync(`${DIR}/${n.slice(0, -1)}`); } else fs.writeFileSync(`${DIR}/${n}`, c); }
  }, { DIR, names: {
    [`${evil('txt')}.txt`]: 'hello',
    [`${evil('md')}.md`]: '# hi',
    [`${evil('html')}.html`]: '<p>hi</p>',
    [`${evil('dir')}/`]: '',
    [`${evil('mp3')}.mp3`]: '',
    [`${evil('menu')}.txt`]: 'menu target',
  } });

  // Control: the same name, pasted into DSL the way Host.exec used to, does fire.
  const control = await page.evaluate(({ DIR, name }) => {
    const p = `${DIR}/${name}`;
    try { platform.host.execCommand(`service('001-core.layout', 'open-window') (command('ui.notepad'), '${p}')`, platform); } catch (_) {}
    const v = window.__pwned_control; delete window.__pwned_control; return v;
  }, { DIR, name: `a'),(platform.window.top.__pwned_control=1),('.txt` });
  check('control: a DSL-breakout file name fires through the old string-building code', control === 1, `__pwned_control=${control}`);
  await closeAll(page);

  // Host.exec on a file and on a folder
  await page.evaluate(({ DIR, n }) => platform.host.exec(platform, `${DIR}/${n}`), { DIR, n: `${evil('txt')}.txt` });
  const notepad = await pollFor(page, () => document.querySelectorAll('.window[data-name="ui.notepad"]').length > 0);
  check('Host.exec(file) opens Notepad with a breakout name, payload inert', !!notepad && (await pwned(page)).length === 0, JSON.stringify(await pwned(page)));
  await page.evaluate(({ DIR, n }) => platform.host.exec(platform, `${DIR}/${n}`), { DIR, n: evil('dir') });
  const explorer = await pollFor(page, () => document.querySelectorAll('.window[data-name="explorer"]').length > 0);
  check('Host.exec(folder) opens the explorer with a breakout name, payload inert', !!explorer && (await pwned(page)).length === 0, JSON.stringify(await pwned(page)));
  await closeAll(page);

  // ui.settings with an initial section that breaks out of a quoted string
  await page.evaluate(() => platform.host.callCommand('ui.settings', null, null, "x'),(platform.window.top.__pwned_settings=1),('"));
  const settings = await pollFor(page, () => document.querySelectorAll('.window[data-name="ui.settings"]').length > 0);
  check('ui.settings(initialSection) opens Settings, payload inert', !!settings && (await pwned(page)).length === 0, JSON.stringify(await pwned(page)));
  await closeAll(page);

  // Compiled Markdown viewer: "Edit in Notepad" action button
  await page.evaluate(({ DIR, n }) => platform.host.openWindow('ui.markdown', `${DIR}/${n}`), { DIR, n: `${evil('md')}.md` });
  await pollFor(page, () => document.querySelector('.window[data-name="ui.markdown"]'));
  await page.waitForTimeout(500);
  const clicked = await page.evaluate(() => {
    const win = document.querySelector('.window[data-name="ui.markdown"]');
    const btn = [...win.querySelectorAll('[title="Edit in Notepad"], [aria-label="Edit in Notepad"]')][0]
      || [...win.querySelectorAll('*')].find((e) => e.textContent === 'edit_note' && e.children.length === 0);
    if (!btn) return false; btn.click(); return true;
  });
  const mdNotepad = await pollFor(page, () => document.querySelectorAll('.window[data-name="ui.notepad"]').length > 0);
  check('Markdown "Edit in Notepad" opens Notepad, payload inert', clicked && !!mdNotepad && (await pwned(page)).length === 0, `clicked=${clicked} ${JSON.stringify(await pwned(page))}`);
  await closeAll(page);

  // Notepad "open in iframe" button on an .html file
  await page.evaluate(({ DIR, n }) => platform.host.openWindow('ui.notepad', `${DIR}/${n}`), { DIR, n: `${evil('html')}.html` });
  await pollFor(page, () => document.querySelector('.window[data-name="ui.notepad"]'));
  await page.waitForTimeout(800);
  const npClicked = await page.evaluate(() => {
    const iframe = document.querySelector('.window[data-name="ui.notepad"] iframe');
    const btn = iframe?.contentDocument?.querySelector('[title="open in iframe"]');
    if (!btn) return false; btn.click(); return true;
  });
  const browserWin = await pollFor(page, () => document.querySelectorAll('.window[data-name="ui.iframe"]').length > 0);
  check('Notepad "open in iframe" opens the Browser, payload inert', npClicked && !!browserWin && (await pwned(page)).length === 0, `clicked=${npClicked} ${JSON.stringify(await pwned(page))}`);
  await closeAll(page);

  // Compiled explorer (ui.file-explorer): double-click an audio file + context-menu actions
  await page.evaluate((DIR) => platform.host.openWindow('ui.file-explorer', DIR), DIR);
  const feFrame = async () => {
    for (let i = 0; i < 30; i++) {
      for (const f of page.frames()) { if (await f.locator('.file-item').count().catch(() => 0)) return f; }
      await page.waitForTimeout(300);
    }
    return null;
  };
  let frame = await feFrame();
  check('compiled explorer opens and lists the folder', !!frame);
  if (frame) {
    await frame.locator('.file-item', { hasText: evil('mp3') }).first().dblclick({ force: true });
    const audio = await pollFor(page, () => document.querySelectorAll('.window[data-name="ui.audioplayer"]').length > 0);
    check('compiled explorer: double-click on audio opens the player, payload inert', !!audio && (await pwned(page)).length === 0, JSON.stringify(await pwned(page)));
    await page.evaluate(() => document.querySelectorAll('.window[data-name="ui.audioplayer"]').forEach((w) => w.remove()));

    const menuClick = async (title) => {
      frame = await feFrame();
      await frame.locator('.file-item', { hasText: evil('menu') }).first().click({ button: 'right', force: true });
      await page.waitForTimeout(300);
      return page.evaluate((t) => {
        const btn = [...document.querySelectorAll('button, [role="menuitem"], .context-menu *')].find((b) => b.textContent.trim() === t && b.offsetParent !== null);
        if (!btn) return false; btn.click(); return true;
      }, title);
    };
    const editClicked = await menuClick('Edit');
    const edit = await pollFor(page, () => document.querySelectorAll('.window[data-name="ui.notepad"]').length > 0);
    check('compiled explorer menu "Edit" opens Notepad, payload inert', editClicked && !!edit && (await pwned(page)).length === 0, `clicked=${editClicked} ${JSON.stringify(await pwned(page))}`);
    await page.evaluate(() => document.querySelectorAll('.window[data-name="ui.notepad"]').forEach((w) => w.remove()));

    const copyClicked = await menuClick('Copy');
    const clip = await page.evaluate(() => window.__vfsClipboard);
    check('compiled explorer menu "Copy" passes the path as a value', copyClicked && clip?.op === 'copy' && clip.paths?.[0]?.endsWith(`.txt`) && clip.paths[0].includes("__pwned_menu"), JSON.stringify(clip));

    const propsClicked = await menuClick('Properties');
    frame = await feFrame();
    await page.waitForTimeout(300);
    const propsShown = propsClicked && (await frame.locator('text=/__pwned_menu/').count()) > 0;
    check('compiled explorer menu "Properties" works, payload inert', propsShown && (await pwned(page)).length === 0, `clicked=${propsClicked} ${JSON.stringify(await pwned(page))}`);
  }
} finally {
  await context.close();
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
