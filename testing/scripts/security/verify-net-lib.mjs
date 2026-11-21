// Shared helpers for the apps-net phase-1 verification scripts (verify-net-*.mjs):
// booting the OS in isolated contexts, opening app windows, finding app frames, and
// connecting two WebRTC Chat instances over invite/answer links.
// Run any verify script with the dev server on :8080 (OS_URL overrides).
import { chromium } from 'playwright';
import { bootOS, OS_URL } from './spike-lib.mjs';

export { OS_URL };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
export const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + String(extra).slice(0, 400) : ''}`);
  if (!ok) failed++;
  return ok;
};
export const failures = () => failed;
export function finish(browser) {
  console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
  return browser.close().then(() => process.exit(failed ? 1 : 0));
}

// page.waitForFunction never resolves on this page — poll with evaluate.
export async function waitFor(fn, ms = 20000, every = 250) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (await fn()) return true; } catch (_) { /* frame re-rendered / navigating */ }
    await sleep(every);
  }
  return false;
}

export const launchBrowser = (args = []) => chromium.launch({ args });

// A fresh context with the OS booted; dialogs are answered by `onDialog` (default: accept,
// recorded in page.__dialogs so a script can assert what was asked).
export async function bootPage(browser, { onDialog } = {}) {
  const context = await browser.newContext();
  const page = await bootOS(context, { url: OS_URL });
  page.__dialogs = [];
  page.on('dialog', async (d) => {
    page.__dialogs.push({ type: d.type(), message: d.message() });
    try { if (onDialog) await onDialog(d); else await d.accept(); } catch (_) {}
  });
  page.__errors = [];
  page.on('pageerror', (e) => page.__errors.push(e.message));
  return page;
}

export async function waitForCommand(page, name, ms = 60000) {
  return waitFor(() => page.evaluate((n) => !!window.platform?.host?.getCommand(n), name), ms, 500);
}

export async function openWindow(page, cmd, ...args) {
  for (let i = 0; i < 40; i++) {
    const ok = await page.evaluate(({ c, a }) => {
      try {
        const host = window.platform.host;
        if (typeof host.openWindow === 'function') host.openWindow(c, ...a);
        else host.execCommand("service('001-core.layout','open-window')(command($args[0]))", window.platform, c);
        return true;
      } catch (_) { return false; }
    }, { c: cmd, a: args });
    if (ok) return true;
    await sleep(500);
  }
  return false;
}

export async function appFrame(page, urlPart, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    for (const fr of page.frames()) {
      try { if (fr.url().includes(urlPart) && await fr.evaluate(() => true).catch(() => false)) return fr; } catch (_) {}
    }
    await sleep(300);
  }
  throw new Error('frame not found: ' + urlPart);
}

// Opens WebRTC Chat on A, sends B the invite link, answers it, and waits for both sides to
// see each other. Returns { fA, fB, idA, idB }. `autoMesh` (default off since NET-11) can be
// switched on per side before connecting.
export async function connectPair(pA, pB, { nameA = 'Alice', nameB = 'Bob', autoMesh = false } = {}) {
  await waitForCommand(pA, 'ui.webrtc');
  await openWindow(pA, 'ui.webrtc');
  const fA = await appFrame(pA, 'webrtc/main.html');
  await waitFor(() => fA.evaluate(() => !!window.__webrtcApp), 20000);
  if (autoMesh) await fA.evaluate(() => { window.__webrtcApp.settings.autoMesh = true; });
  const inv = await fA.evaluate(async (n) => (await window.__webrtcApp.createInvite(n)).link, nameA);
  // B is already booted (a hash-only goto wouldn't re-run the deep-link handler): open the
  // app with the link as its argument, which is what a deep link ends up doing.
  await waitForCommand(pB, 'ui.webrtc');
  await openWindow(pB, 'ui.webrtc', inv);
  const fB = await appFrame(pB, 'webrtc/main.html', 60000);
  await waitFor(() => fB.evaluate(() => window.__webrtcApp && window.__webrtcApp.joins.size === 1), 30000);
  if (autoMesh) await fB.evaluate(() => { window.__webrtcApp.settings.autoMesh = true; });
  const ans = await fB.evaluate(async (n) => { const j = [...window.__webrtcApp.joins.values()][0]; await window.__webrtcApp.generateAnswer(j, n); return j.link; }, nameB);
  await fA.evaluate((l) => window.__webrtcApp.handleIncomingCode(l), ans);
  await waitFor(() => fA.evaluate(() => window.__webrtcApp.peers.size >= 1) && fB.evaluate(() => window.__webrtcApp.peers.size >= 1), 30000);
  await waitFor(() => fB.evaluate(() => window.__webrtcApp.peers.size >= 1), 30000);
  await fA.evaluate(() => document.querySelectorAll('.modal-head button').forEach((b) => b.click()));
  await fB.evaluate(() => document.querySelectorAll('.modal-head button').forEach((b) => b.click()));
  const idA = await fA.evaluate(() => window.__webrtcApp.myId);
  const idB = await fB.evaluate(() => window.__webrtcApp.myId);
  return { fA, fB, idA, idB };
}
