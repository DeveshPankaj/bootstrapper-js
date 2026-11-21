// Verifies 1B.10 (audit WIN-5, Host part): Host.appendDomElement (append to the top document's
// body) works only for the layout module; scripts and other modules are refused. The
// adoptedStyleSheets helpers stay open for now — /etc/widgets/{shortcuts,notifications,toolbar}.js
// depend on them (reported; see the host owner's report) — this checks they still work.
//
// Run: node testing/scripts/security/verify-host-dom.mjs   (OS dev server on :8080)
// Exit code: 0 = all checks pass, 1 = a check failed.
import { launch, bootOS } from './spike-lib.mjs';

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const browser = await launch();
const context = await browser.newContext();
try {
  const page = await bootOS(context);
  const layout = await page.evaluate(() => !!document.querySelector('.layout-default .content-area, .layout-default'));
  check('the layout still mounts the desktop through appendDomElement', layout);

  await page.evaluate(() => window.fs.writeFileSync('/home/user1/dom-verify.js', `
    window.top.__domResult = (() => {
      const el = window.document.createElement('div'); el.id = 'dom-verify-overlay';
      try { platform.host.appendDomElement(el); return 'appended'; } catch (e) { return 'refused: ' + e.message; }
    })();`));
  await page.evaluate(() => platform.host.runFile(platform, '/home/user1/dom-verify.js', [], { confirm: false }));
  const fromScript = await page.evaluate(() => ({ r: window.__domResult, inTop: !!document.getElementById('dom-verify-overlay') }));
  check('a script is refused', fromScript.r?.startsWith('refused') && !fromScript.inTop, JSON.stringify(fromScript));
  const fromModule = await page.evaluate(() => {
    const host = platform.host.getModulePlatform('005-ui.notepad')?.host;
    const el = document.createElement('div'); el.id = 'dom-verify-module';
    try { host.appendDomElement(el); return 'appended'; } catch (e) { return 'refused: ' + e.message; }
  });
  check('another module (notepad) is refused', fromModule.startsWith('refused'), fromModule);
  const fromRoot = await page.evaluate(() => { try { platform.host.appendDomElement(document.createElement('div')); return 'appended'; } catch (e) { return 'refused'; } });
  check('the root host is refused', fromRoot === 'refused', fromRoot);

  const sheets = await page.evaluate(() => document.adoptedStyleSheets.length);
  check('stylesheet helpers still work (layout + widgets adopted their sheets)', sheets >= 2, `adoptedStyleSheets=${sheets}`);
} finally {
  await context.close();
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
