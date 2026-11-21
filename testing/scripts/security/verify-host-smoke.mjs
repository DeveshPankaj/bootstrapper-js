// Smoke test after the host owner's changes (TODO 1B): the runtime Files app
// (opt/apps/file-explorer/main.js) opens txt / js / svg / html / md by double-click with the
// right viewer and nothing runs; the Terminal still runs /bin commands (host.exec → runFile).
//
// Run: node testing/scripts/security/verify-host-smoke.mjs   (OS dev server on :8080)
// Exit code: 0 = all checks pass, 1 = a check failed.
import { launch, bootOS } from './spike-lib.mjs';

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const D = '/home/user1/smoke';

const browser = await launch();
const context = await browser.newContext();
try {
  const page = await bootOS(context);
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.evaluate((D) => {
    const fs = window.fs;
    if (!fs.existsSync(D)) fs.mkdirSync(D, { recursive: true });
    fs.writeFileSync(`${D}/notes.txt`, 'plain text');
    fs.writeFileSync(`${D}/script.js`, 'window.top.__pwned_smoke_js = 1');
    fs.writeFileSync(`${D}/pic.svg`, '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" onload="top.__pwned_smoke_svg=1"><rect width="8" height="8"/></svg>');
    fs.writeFileSync(`${D}/page.html`, '<title>smoke-page</title><script>try{top.__pwned_smoke_html=1}catch(e){}</script>hi');
    fs.writeFileSync(`${D}/readme.md`, '# Smoke');
  }, D);

  await page.evaluate((D) => platform.host.openWindow('explorer', D), D);
  const explorerFrame = async () => {
    for (let i = 0; i < 40; i++) {
      for (const f of page.frames()) { if (await f.locator('.file-item', { hasText: 'notes.txt' }).count().catch(() => 0)) return f; }
      await page.waitForTimeout(250);
    }
    return null;
  };
  let frame = await explorerFrame();
  check('Files (main.js) lists the folder', !!frame);
  const expect = { 'notes.txt': 'ui.notepad', 'script.js': 'ui.notepad', 'pic.svg': 'ui.imageviewer', 'page.html': 'ui.sandboxed-app', 'readme.md': 'ui.markdown' };
  for (const [name, win] of Object.entries(expect)) {
    frame = await explorerFrame();
    if (!frame) break;
    await page.evaluate(() => document.querySelectorAll('.window:not([data-name="explorer"])').forEach((w) => w.remove()));
    await frame.locator('.file-item', { hasText: name }).first().dblclick({ force: true });
    let opened = [];
    for (let i = 0; i < 20 && !opened.includes(win); i++) { await page.waitForTimeout(250); opened = await page.evaluate(() => [...document.querySelectorAll('.window[data-name]')].map((w) => w.getAttribute('data-name'))); }
    check(`double-click ${name} → ${win}`, opened.includes(win), JSON.stringify(opened));
  }
  await page.waitForTimeout(800);
  const pwned = await page.evaluate(() => Object.keys(window).filter((k) => k.startsWith('__pwned_smoke')));
  check('nothing ran on open', pwned.length === 0, JSON.stringify(pwned));

  // Terminal: /bin commands still run (exec → runFile, no prompt).
  await page.evaluate(() => document.querySelectorAll('.window').forEach((w) => w.remove()));
  await page.evaluate(() => platform.host.openWindow('ui.terminal'));
  let out = '';
  for (let i = 0; i < 40 && !out.includes('notes.txt'); i++) {
    await page.waitForTimeout(400);
    out = await page.evaluate(async (D) => {
      const inner = document.querySelector('.window[data-name="ui.terminal"] iframe')?.contentDocument?.querySelector('iframe');
      const app = inner?.contentWindow?.__terminalApp;
      const s = app?.sessions?.[0];
      if (!s?.terminal) return '';
      const text = () => { const buf = s.terminal.buffer.active; const lines = []; for (let i = 0; i < buf.length; i++) lines.push(buf.getLine(i).translateToString(true)); return lines.join('\n'); };
      // wait for the banner + first prompt before typing, like a user would
      if (!window.__smokeRan && !/\$\s*$/.test(text().trimEnd() + ' ')) return '';
      if (!window.__smokeRan || (Date.now() - window.__smokeRan > 4000 && !text().includes('notes.txt'))) { window.__smokeRan = Date.now(); await s.processCommand(`ls ${D}`); }
      return text();
    }, D).catch(() => '');
  }
  check('Terminal runs /bin/ls.run', out.includes('notes.txt') && out.includes('readme.md'), out.split('\n').filter(Boolean).slice(-3).join(' | '));
} finally {
  await context.close();
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
