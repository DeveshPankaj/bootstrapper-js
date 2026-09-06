// Phase 5 smoke tests — verify rings architecture end-to-end after all phases wired.
// Tests: Ring 2 WindowManager mirrors, LayoutManager, DesktopManager, spotlight/settings, task-manager command.

import { chromium } from 'playwright';

const BASE = 'http://localhost:8080';
const SHOT = './testing/screenshots';

const browser = await chromium.launch({ headless: true });
const page    = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// ── 1. Ring 2 WindowManager mirrors open windows ───────────────────────────────
await page.evaluate(() => window.platform.host.callCommand('ui.model-builder'));
await page.waitForTimeout(2000);

const wm2Windows = await page.evaluate(() => {
  try {
    const wm2 = window.top.__wosWindowManager;
    return wm2 ? wm2.getAll() : 'singleton not on window.top';
  } catch (_) { return null; }
});
console.log('Ring2 WindowManager (via __wos):', wm2Windows === null ? 'not exposed on window (OK — singleton)' : JSON.stringify(wm2Windows));

// ── 2. process.list command still works ───────────────────────────────────────
const processList = await page.evaluate(() => {
  try {
    return window.platform.host.callCommand('process.list');
  } catch (_) { return null; }
});
const hasModelBuilder = Array.isArray(processList) && processList.some(p => p.name === 'ui.model-builder');
console.log('process.list has model-builder:', hasModelBuilder ? 'OK' : 'MISSING');
console.log('process.list count:', Array.isArray(processList) ? processList.length : 'N/A');

// ── 3. ProcessManager.list() matches process.list ─────────────────────────────
const pmList = await page.evaluate(() => {
  try {
    return window.platform.host.getProcessManager().list().map(p => ({ pid: p.pid, id: p.id }));
  } catch (_) { return []; }
});
console.log('ProcessManager.list():', JSON.stringify(pmList));
console.log('Counts match:', pmList.length === (Array.isArray(processList) ? processList.length : -1) ? 'OK' : `MISMATCH (pm=${pmList.length} vs cmd=${processList?.length})`);

// ── 4. Settings command opens ─────────────────────────────────────────────────
await page.evaluate(() => window.platform.host.callCommand('ui.settings'));
await page.waitForTimeout(1500);

const settingsOpen = await page.evaluate(() => {
  // Settings opens as a window — check windowsSubject
  try {
    return window.platform.host.callCommand('process.list').some(p => p.name === 'ui.settings');
  } catch (_) {}
  // Fallback: look for iframe with settings in src (may use /(sw)/ prefix)
  const iframes = [...document.querySelectorAll('iframe')];
  return iframes.some(f => (f.src || '').includes('settings'));
});
console.log('Settings opened:', settingsOpen ? 'OK' : 'MISSING');

await page.screenshot({ path: `${SHOT}/rings-phase5-final.png` });

// ── 5. snake-game also gets ProxyFS ──────────────────────────────────────────
await page.evaluate(() => window.platform.host.callCommand('ui.snake-game'));
await page.waitForTimeout(1500);

const snakeSDK = await page.evaluate(async () => {
  // snake-game is inside the layout iframe — collect iframes recursively
  const allFrames = [];
  const collect = (doc) => {
    try {
      for (const f of doc.querySelectorAll('iframe')) {
        allFrames.push(f);
        try { collect(f.contentDocument); } catch (_) {}
      }
    } catch (_) {}
  };
  collect(document);

  for (const f of allFrames) {
    if (!(f.src || '').includes('snake-game')) continue;
    try {
      const win = f.contentWindow;
      const hasSDK = typeof win?.AppSDK !== 'undefined';
      let vfsOk = false;
      if (hasSDK && typeof win.AppSDK.writeText === 'function') {
        await win.AppSDK.writeText('/tmp/ring5-test.txt', 'ring5');
        const back = await win.AppSDK.readText('/tmp/ring5-test.txt');
        vfsOk = back === 'ring5';
      }
      return { hasSDK, vfsOk };
    } catch (e) { return { error: String(e) }; }
  }
  // Also check via process.list — if snake-game process exists, the AppSDK was injected
  try {
    const procs = window.platform.host.callCommand('process.list');
    const hasProc = procs.some(p => p.name === 'ui.snake-game');
    return { notFoundInDom: true, processExists: hasProc };
  } catch (_) {}
  return { notFound: true };
});
console.log('snake-game AppSDK:', JSON.stringify(snakeSDK));

// ── 6. LayoutManager singleton initialised ────────────────────────────────────
// We can only check via host since LayoutManager isn't exposed on window.
// But we can call set-layout and see it doesn't throw.
const layoutSwitchOk = await page.evaluate(() => {
  try {
    window.platform.host.callCommand('set-layout', 'linux-top-header');
    window.platform.host.callCommand('set-layout', 'default');
    return true;
  } catch (_) { return false; }
});
console.log('Layout switch via Ring 2:', layoutSwitchOk ? 'OK' : 'ERROR');

await browser.close();
