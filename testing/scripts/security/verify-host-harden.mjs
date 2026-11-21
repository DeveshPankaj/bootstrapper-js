// Verifies the host part of KRN-11/APP-9: the module iframes WindowService creates
// (src/remote.ts — layout, iframe, notepad, explorer … bundles) and first-party ui.iframe pages
// get the kernel's window.open hardening: a cross-origin open from them gets
// noopener,noreferrer, so the opened page has no window.opener into the OS.
//
// Run: node testing/scripts/security/verify-host-harden.mjs   (OS dev server on :8080)
// Exit code: 0 = all checks pass, 1 = a check failed.
import { launch, bootOS, startServer } from './spike-lib.mjs';

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const PORT = 8096;
const server = await startServer(PORT, { '/opened.html': { body: '<title>opened</title><script>document.title = "opener:" + (window.opener === null ? "null" : "present")</script>' } });

const browser = await launch();
const context = await browser.newContext();
try {
  const page = await bootOS(context);
  const modules = await page.evaluate(() => {
    const out = {};
    for (const name of ['001-core.layout', '003-core.iframe', '005-ui.notepad', '007-ui.file-explorer']) {
      const p = platform.host.getModulePlatform(name);
      const frame = [...document.querySelectorAll('body > iframe')].find((f) => { try { return f.contentWindow.platform === p; } catch (_) { return false; } });
      const d = frame && Object.getOwnPropertyDescriptor(frame.contentWindow, 'open');
      out[name] = !!(d && d.writable === false && d.configurable === false);
    }
    return out;
  });
  check('module iframes have the hardened window.open', Object.values(modules).every(Boolean), JSON.stringify(modules));

  // A real cross-origin open from a module window: the opened page sees no opener.
  const popupPromise = context.waitForEvent('page', { timeout: 10000 }).catch(() => null);
  await page.evaluate((url) => {
    const p = platform.host.getModulePlatform('005-ui.notepad');
    const frame = [...document.querySelectorAll('body > iframe')].find((f) => { try { return f.contentWindow.platform === p; } catch (_) { return false; } });
    window.__openRet = String(frame.contentWindow.open(url));
  }, `http://127.0.0.1:${PORT}/opened.html`);
  const popup = await popupPromise;
  if (popup) await popup.waitForLoadState('load').catch(() => {});
  const title = popup ? await popup.title().catch(() => '') : 'no popup';
  check('cross-origin open from a module window: no window.opener', title === 'opener:null', `${title} (open returned ${await page.evaluate(() => window.__openRet)})`);
  if (popup) await popup.close().catch(() => {});

  // First-party ui.iframe page (terminal) is hardened too.
  await page.evaluate(() => platform.host.openWindow('ui.terminal'));
  let hardened = null;
  for (let i = 0; i < 30 && hardened === null; i++) {
    hardened = await page.evaluate(() => {
      const inner = document.querySelector('.window[data-name="ui.terminal"] iframe')?.contentDocument?.querySelector('iframe');
      if (!inner?.contentWindow?.platform) return null;
      const d = Object.getOwnPropertyDescriptor(inner.contentWindow, 'open');
      return !!(d && d.writable === false);
    }).catch(() => null);
    if (hardened === null) await page.waitForTimeout(300);
  }
  check('first-party ui.iframe page has the hardened window.open', hardened === true, String(hardened));
} finally {
  await context.close();
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
