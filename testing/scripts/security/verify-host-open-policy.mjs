// Verifies 1B.3 (audit WIN-3, BOOT-3, APP-2, NET-8, KRN-10 handler part; decisions.md D10):
// opening a file views it, running needs an explicit Run.
//   - Host.exec on .js/.run outside /bin, /usr/bin, /opt/apps opens the editor (nothing runs)
//   - .svg/.ico open in the image viewer; .html outside /opt/apps opens in ui.sandboxed-app
//   - system executables (/opt/apps/**) still run on open; boot hooks still run
//   - Host.runFile asks for confirmation naming the file (except system dirs / confirm:false)
//   - the default handler is the system default, not the first title alphabetically
//
// Run: node testing/scripts/security/verify-host-open-policy.mjs   (OS dev server on :8080)
// Exit code: 0 = all checks pass, 1 = a check failed.
import { launch, bootOS } from './spike-lib.mjs';

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const D = '/home/user1/open-verify';
const SYS = '/opt/apps/zz-open-verify';
const FILES = {
  [`${D}/evil.js`]: 'window.top.__pwned_js = 1',
  [`${D}/evil.run`]: 'platform.window.top.__pwned_run = 1',
  [`${D}/evil.svg`]: '<svg xmlns="http://www.w3.org/2000/svg" onload="top.__pwned_svg=1" width="20" height="20"><script>top.__pwned_svg2=1</script><rect width="20" height="20" fill="red"/></svg>',
  [`${D}/icon.ico`]: 'not really an icon',
  [`${D}/evil.html`]: '<title>evil-html</title><script>try { top.__pwned_html = 1 } catch (e) {} try { if (parent.platform) top.__pwned_html_platform = 1 } catch (e) {}</script>',
  [`${D}/readme.txt`]: 'hello',
  [`${D}/data.zzz`]: 'zzz',
  [`${D}/ask.js`]: 'window.top.__ran_ask = (window.top.__ran_ask || 0) + 1',
  [`${D}/svc.js`]: 'window.top.__ran_svc = 1',
  [`${SYS}/tool.js`]: 'window.top.__ran_system = 1',
  [`${SYS}/page.html`]: '<title>first-party</title>first party page',
};

const browser = await launch();
const context = await browser.newContext();
try {
  const page = await bootOS(context);
  let dialogMode = 'dismiss';
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); (dialogMode === 'accept' ? d.accept() : d.dismiss()).catch(() => {}); });
  await page.waitForTimeout(2500);

  // Boot still works: initd.run (a legacy autorun path) loaded the apps, and the public-ip
  // widget/cron (/opt/cron/*.js through host.exec) did not pop up an editor.
  const boot = await page.evaluate(() => ({
    pkg: !!platform.host.getCommand('ui.pkg-manager'),
    explorerFromMainJs: platform.host.getCommand('explorer')?.meta?.title === 'Files' || !!platform.host.getCommand('explorer'),
    notepadWindows: document.querySelectorAll('.window[data-name="ui.notepad"]').length,
  }));
  check('boot: initd.run still runs (installed apps registered)', boot.pkg, JSON.stringify(boot));
  check('boot: no editor window popped up by cron/widget scripts', boot.notepadWindows === 0, JSON.stringify(boot));

  await page.evaluate((files) => {
    const fs = window.fs;
    for (const [p, c] of Object.entries(files)) {
      const dir = p.slice(0, p.lastIndexOf('/'));
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(p, c);
    }
  }, FILES);

  const pwned = () => page.evaluate(() => Object.keys(window).filter((k) => k.startsWith('__pwned')));
  const openAndSee = async (path) => {
    await page.evaluate(() => document.querySelectorAll('.window').forEach((w) => w.remove()));
    await page.evaluate((p) => platform.host.exec(platform, p), path).catch((e) => e.message);
    await page.waitForTimeout(1200);
    return page.evaluate(() => [...document.querySelectorAll('.window[data-name]')].map((w) => w.getAttribute('data-name')));
  };

  let w = await openAndSee(`${D}/evil.js`);
  check('open .js in ~ → editor, does not run', w.includes('ui.notepad') && (await pwned()).length === 0, `windows=${JSON.stringify(w)} pwned=${JSON.stringify(await pwned())}`);
  w = await openAndSee(`${D}/evil.run`);
  check('open .run in ~ → editor, does not run', w.includes('ui.notepad') && (await pwned()).length === 0, `windows=${JSON.stringify(w)} pwned=${JSON.stringify(await pwned())}`);
  w = await openAndSee(`${D}/evil.svg`);
  await page.waitForTimeout(800);
  check('open .svg → image viewer, script inert', w.includes('ui.imageviewer') && (await pwned()).length === 0, `windows=${JSON.stringify(w)} pwned=${JSON.stringify(await pwned())}`);
  w = await openAndSee(`${D}/icon.ico`);
  check('open .ico → image viewer', w.includes('ui.imageviewer'), JSON.stringify(w));
  w = await openAndSee(`${D}/evil.html`);
  await page.waitForTimeout(800);
  check('open .html in ~ → ui.sandboxed-app, no top access', w.includes('ui.sandboxed-app') && (await pwned()).length === 0, `windows=${JSON.stringify(w)} pwned=${JSON.stringify(await pwned())}`);
  w = await openAndSee(`${SYS}/page.html`);
  check('open .html under /opt/apps → same-origin Browser (first party)', w.includes('ui.iframe'), JSON.stringify(w));
  w = await openAndSee(`${SYS}/tool.js`);
  check('open .js under /opt/apps → runs (system executable)', (await page.evaluate(() => window.__ran_system)) === 1 && !w.includes('ui.notepad'), JSON.stringify(w));
  check('opening never asked for confirmation', dialogs.length === 0, JSON.stringify(dialogs));

  // Host.runFile: explicit Run asks, naming the file; declined = not run.
  dialogs.length = 0; dialogMode = 'dismiss';
  await page.evaluate((p) => platform.host.runFile(platform, p), `${D}/ask.js`);
  check('runFile outside system dirs asks, naming the file; declined → not run', dialogs.length === 1 && dialogs[0].includes(`${D}/ask.js`) && !(await page.evaluate(() => window.__ran_ask)), JSON.stringify(dialogs));
  dialogs.length = 0; dialogMode = 'accept';
  await page.evaluate((p) => platform.host.runFile(platform, p), `${D}/ask.js`);
  check('runFile: accepted → runs', dialogs.length === 1 && (await page.evaluate(() => window.__ran_ask)) === 1, JSON.stringify(dialogs));
  dialogs.length = 0; dialogMode = 'dismiss';
  await page.evaluate((p) => platform.host.runFile(platform, p, [], { confirm: false }), `${D}/ask.js`);
  check('runFile {confirm:false} runs without asking', dialogs.length === 0 && (await page.evaluate(() => window.__ran_ask)) === 2);
  await page.evaluate(() => { delete window.__ran_system; });
  await page.evaluate((p) => platform.host.runFile(platform, p), `${SYS}/tool.js`);
  check('runFile in /opt/apps runs without asking', dialogs.length === 0 && (await page.evaluate(() => window.__ran_system)) === 1);
  const notScript = await page.evaluate((p) => { try { platform.host.runFile(platform, p); return 'ran'; } catch (e) { return 'threw: ' + e.message; } }, `${D}/readme.txt`);
  check('runFile refuses non-scripts', notScript.startsWith('threw'), notScript);
  const traversal = await page.evaluate(() => { try { platform.host.runFile(platform, '/opt/apps/../../home/user1/open-verify/ask.js'); return 'no throw'; } catch (e) { return 'threw: ' + e.message; } });
  check('runFile normalises the path before the system-dir check (/opt/apps/../../ asks)', dialogs.length === 1 && dialogs[0].startsWith(`Run "${D}/ask.js"?`) && !(await page.evaluate(() => window.__ran_ask_unexpected)), `${traversal} ${JSON.stringify(dialogs)}`);
  dialogs.length = 0;

  // The DSL's run verb service('root','exec') still runs author-written scripts without asking.
  await page.evaluate((p) => platform.getService('exec')(p), `${D}/svc.js`);
  check("service('root','exec') runs scripts (author intent), no prompt", dialogs.length === 0 && (await page.evaluate(() => window.__ran_svc)) === 1);

  // Notepad's Run button asks too.
  await page.evaluate(() => document.querySelectorAll('.window').forEach((x) => x.remove()));
  await page.evaluate(() => { delete window.__ran_ask; });
  await page.evaluate((p) => platform.host.openWindow('ui.notepad', p), `${D}/ask.js`);
  await page.waitForTimeout(1000);
  dialogs.length = 0; dialogMode = 'dismiss';
  const runClicked = await page.evaluate(() => {
    const doc = document.querySelector('.window[data-name="ui.notepad"] iframe')?.contentDocument;
    const btn = doc?.querySelector('[title="Run"]'); if (!btn) return false; btn.click(); return true;
  });
  check('Notepad Run asks, naming the file; declined → not run', runClicked && dialogs.length === 1 && dialogs[0].includes(`${D}/ask.js`) && !(await page.evaluate(() => window.__ran_ask)), `clicked=${runClicked} ${JSON.stringify(dialogs)}`);

  // Default handlers: system defaults can't be taken over; others go to the first claimant.
  await page.evaluate(() => {
    const rec = (name) => (body, props, p) => { window.__opened = `${name}:${p}`; };
    platform.host.registerCommand('zz.first', rec('zz.first'), { title: 'Zeta', fileExtensions: ['.zzz'] });
    platform.host.registerCommand('zz.aaa', rec('zz.aaa'), { title: 'AAA', fileExtensions: ['.txt', '.svg', '.zzz'] });
  });
  w = await openAndSee(`${D}/readme.txt`);
  check('an app titled "AAA" claiming .txt does not become its default', w.includes('ui.notepad') && !w.includes('zz.aaa'), JSON.stringify(w));
  w = await openAndSee(`${D}/evil.svg`);
  check('an app titled "AAA" claiming .svg does not become its default', w.includes('ui.imageviewer') && !w.includes('zz.aaa'), JSON.stringify(w));
  w = await openAndSee(`${D}/data.zzz`);
  check('no system default → first app that claimed the extension (not title order)', w.includes('zz.first') && !w.includes('zz.aaa'), JSON.stringify(w));
} finally {
  await context.close();
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
