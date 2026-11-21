// Verifies 1B.1 (audit KRN-2 / BOOT-1): the `?app=` / `?apps=` URL launcher in src/remote.ts
// opens apps by validated name only, never builds DSL source from the URL, and passes link
// arguments only to commands that opt in with `deepLink: true`.
//
// Run: node testing/scripts/security/verify-host-query-launch.mjs   (OS dev server on :8080)
// Exit code: 0 = all checks pass, 1 = a check failed.
import { launch, bootOS, OS_URL } from './spike-lib.mjs';

const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64');
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

// The launcher fires 4 s after the remote bundle loads; poll for the expected state.
const pollFor = async (page, fn, arg, ms = 15000) => {
  const end = Date.now() + ms; let v;
  while (Date.now() < end) { v = await page.evaluate(fn, arg).catch(() => null); if (v) return v; await page.waitForTimeout(500); }
  return v;
};
const windowNames = (page) => page.evaluate(() => [...document.querySelectorAll('.window[data-name]')].map((w) => w.getAttribute('data-name')));
const frameSrcs = (page) => page.evaluate(() => {
  const out = [];
  const walk = (doc) => { for (const f of doc.querySelectorAll('iframe')) { out.push(f.getAttribute('src') || ''); try { if (f.contentDocument) walk(f.contentDocument); } catch (_) {} } };
  walk(document); return out;
});

const browser = await launch();
try {
  // 1. Injection through the app name — the old launcher pasted it into DSL source.
  {
    const context = await browser.newContext();
    // `window` is null inside the DSL scope, so the payload reaches the top window via `platform`.
    const page = await bootOS(context, { url: `${OS_URL}/?app=${encodeURIComponent("explorer'),(platform.window.top.__pwned=1),('")}` });
    await page.waitForTimeout(6000);
    const pwned = await page.evaluate(() => window.__pwned);
    const names = await windowNames(page);
    check('?app= name injection does not run code', pwned === undefined, `__pwned=${pwned}`);
    check('?app= with an invalid name opens nothing', names.length === 0, JSON.stringify(names));
    // Control: the same payload, pasted into DSL source the way the old launcher did, does fire.
    const control = await page.evaluate(() => {
      const app = "explorer'),(platform.window.top.__pwnedControl=1),('";
      try { platform.host.execCommand(`service('001-core.layout','open-window')(command('${app}'))`, platform); } catch (_) {}
      return window.__pwnedControl;
    });
    check('control: the payload fires through the old DSL launcher code', control === 1, `__pwnedControl=${control}`);
    await context.close();
  }

  // 2. Plain ?app=<name> keeps working.
  {
    const context = await browser.newContext();
    const page = await bootOS(context, { url: `${OS_URL}/?app=ui.notepad` });
    const ok = await pollFor(page, () => !!document.querySelector('.window[data-name="ui.notepad"]'));
    check('plain ?app=ui.notepad opens Notepad', !!ok);
    await context.close();
  }

  // 3. Args for a command without deepLink: true are dropped (Browser opens empty, no remote page).
  {
    const context = await browser.newContext();
    const page = await bootOS(context, { url: `${OS_URL}/?app=ui.iframe&args=${encodeURIComponent(b64(['https://example.com/evil']))}` });
    const opened = await pollFor(page, () => !!document.querySelector('.window[data-name="ui.iframe"]'));
    await page.waitForTimeout(1500);
    const srcs = await frameSrcs(page);
    check('?app=ui.iframe&args=[url] opens the Browser without the url', !!opened && !srcs.some((s) => s.includes('example.com')), JSON.stringify(srcs.filter((s) => s.startsWith('http'))));
    await context.close();
  }

  // 4. ?apps= list: valid entry opens, injected entry ignored, non-app command refused.
  {
    const context = await browser.newContext();
    const entries = [{ app: 'ui.notepad' }, { app: "x'),(platform.window.top.__pwned2=1),('" }, { app: 'set-layout', args: ['x'] }];
    const page = await bootOS(context, { url: `${OS_URL}/?apps=${encodeURIComponent(b64(entries))}` });
    const ok = await pollFor(page, () => !!document.querySelector('.window[data-name="ui.notepad"]'));
    await page.waitForTimeout(1000);
    const names = await windowNames(page);
    const pwned2 = await page.evaluate(() => window.__pwned2);
    check('?apps= opens valid entries only', !!ok && pwned2 === undefined && !names.includes('set-layout'), `windows=${JSON.stringify(names)} __pwned2=${pwned2}`);
    await context.close();
  }

  // 5. A deepLink: true command still receives its link argument (WebRTC's ?signal=).
  {
    const context = await browser.newContext();
    const page = await bootOS(context, { url: `${OS_URL}/?app=ui.webrtc&args=${encodeURIComponent(b64(['wrtc1.verifyhost']))}` });
    const src = await pollFor(page, () => {
      const f = [...document.querySelectorAll('.window[data-name="ui.webrtc"] iframe')];
      for (const w of f) { try { const inner = w.contentDocument?.querySelector('iframe'); if (inner?.src?.includes('signal=wrtc1.verifyhost')) return inner.src; } catch (_) {} }
      return null;
    });
    check('deepLink command (ui.webrtc) receives link args as data', !!src, src || 'no webrtc frame with ?signal=');
    await context.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
