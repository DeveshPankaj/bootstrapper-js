// Phase-2 invariants (README I1–I3, I7): only the sandbox runtime (TODO phase 2) makes these pass.
// They are reported as [phase2] and never count as phase-1 failures; today they document the
// residual risk ("a bug in a first-party app", D14).
//
//   WIN-1  an app window can't reach top/parent DOM, window.platform, IndexedDB, localStorage, siblings
//   KRN-4  explicitly running a vfs .js doesn't give it the top realm
//   KRN-6  a sandboxAppIframe app (snake-game) can't reach parent.document / IndexedDB
//   NET-7  another app can't open Remote Machines' key store
//   WIN-9  an app can't kill another app's window
import { newSession, boot, openWindow, windowFrame, findFrame, step, report, done, sleep, pollFor, sentinels, vfsWrite, closeAllWindows } from './lib/harness.mjs';

const PROBE = () => {
  const p = (fn) => { try { const v = fn(); return v === undefined || v === null || v === false ? 'blocked(empty)' : 'REACHABLE'; } catch (e) { return 'blocked'; } };
  return {
    topDocument: p(() => top.document.title !== undefined),
    parentPlatform: p(() => parent.platform && 1),
    topFs: p(() => top.fs && 1),
    indexedDB: p(() => indexedDB.open('sec-p2-probe') && 1),
    localStorage: p(() => (localStorage.setItem('sec-p2', '1'), 1)),
    sibling: p(() => [...top.document.querySelectorAll('.window iframe')].some((f) => f.contentWindow !== window && f.contentDocument && f.contentDocument.body)),
  };
};
const reachable = (r) => Object.entries(r || {}).filter(([, v]) => v === 'REACHABLE').map(([k]) => k);

const S = await newSession();
try {
  const page = await boot(S.context, { dialogPolicy: 'dismiss' });

  await step('WIN-1', 'app-window-isolated', async () => {
    await page.evaluate(() => window.platform.host.registerCommand('sec.p2win', (body, props) => { props.setWindowView(true); }, { title: 'sec p2' }));
    await openWindow(page, 'ui.notepad');
    await openWindow(page, 'sec.p2win');
    const f = await windowFrame(page, 'sec.p2win');
    if (!f) return { pass: null, detail: 'no app window' };
    const r = await f.evaluate(PROBE);
    return { pass: reachable(r).length === 0, detail: `reachable from an app window: ${JSON.stringify(reachable(r))}` };
  }, { phase: 'phase2' });

  await step('WIN-9', 'app-cannot-kill-other-window', async () => {
    const target = await page.evaluate(() => { const w = document.querySelector('.window[data-name="ui.notepad"]'); return w ? Number(w.getAttribute('data-pid')) : null; });
    const f = await windowFrame(page, 'sec.p2win');
    if (!target || !f) return { pass: null, detail: 'windows not open' };
    await f.evaluate((pid) => { try { top.platform.host.callCommand('process.kill', pid); } catch (_) {} }, target);
    await sleep(800);
    const alive = await page.evaluate((pid) => !!document.querySelector(`.window[data-pid="${pid}"]`), target);
    await closeAllWindows(page);
    return { pass: alive, detail: `other app's window still open after process.kill from an app=${alive}` };
  }, { phase: 'phase2' });

  await step('KRN-4', 'explicit-run-is-not-top-realm', async () => {
    await vfsWrite(page, { '/home/user1/sec-p2/run.js': 'try { window.top.document.title; window.top.__sec_p2_k4 = 1 } catch (e) {}' });
    await page.evaluate(() => {
      const h = window.platform.host;
      try { if (typeof h.runFile === 'function') h.runFile(window.platform, '/home/user1/sec-p2/run.js', [], { confirm: false }); else h.exec(window.platform, '/home/user1/sec-p2/run.js'); } catch (_) {}
    });
    await sleep(1000);
    const s = await sentinels(page, '__sec_p2');
    return { pass: s.length === 0, detail: `vfs script reached the top realm=${s.length > 0}` };
  }, { phase: 'phase2' });

  await step('KRN-6', 'sandbox-app-iframe-opaque', async () => {
    await openWindow(page, 'ui.snake-game');
    const f = await findFrame(page, { urlPart: 'snake-game/', predicate: () => !!window.AppSDK, timeout: 30000 });
    if (!f) return { pass: null, detail: 'snake-game app frame not found' };
    const r = await f.evaluate(() => {
      const p = (fn) => { try { return fn() ? 'REACHABLE' : 'blocked(empty)'; } catch (e) { return 'blocked'; } };
      return { parentDocument: p(() => parent.document && 1), indexedDB: p(() => indexedDB.open('sec-p2') && 1), removeSandbox: p(() => window.frameElement && 1) };
    });
    await closeAllWindows(page);
    return { pass: reachable(r).length === 0, detail: `reachable: ${JSON.stringify(reachable(r))}` };
  }, { phase: 'phase2' });

  await step('NET-7', 'other-app-cannot-open-keystore', async () => {
    await openWindow(page, 'sec.p2win');
    const f = await windowFrame(page, 'sec.p2win');
    if (!f) return { pass: null, detail: 'no app window' };
    const r = await f.evaluate(() => new Promise((res) => {
      try {
        const q = indexedDB.open('remote-machines-keystore');
        q.onsuccess = () => { res('OPENED stores=' + [...q.result.objectStoreNames].join(',')); q.result.close(); };
        q.onerror = () => res('error ' + q.error);
      } catch (e) { res('blocked ' + e.name); }
      setTimeout(() => res('timeout'), 5000);
    }));
    await closeAllWindows(page);
    return { pass: !/^OPENED/.test(r), detail: r };
  }, { phase: 'phase2' });
} catch (e) {
  report('WIN-1', null, 'script error: ' + (e && e.stack || e), { check: 'harness', phase: 'phase2' });
} finally {
  await S.close();
}
done('test-sandbox-phase2');
