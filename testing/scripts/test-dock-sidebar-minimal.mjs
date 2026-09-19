// Verifies the two new dock variants (sidebar, minimal) added in this change:
//   - render with visible launch icons inside #vfs-dock-iframe
//   - a click on a pinned launch item actually opens a window (wm.launch round-trip)
//   - both appear in Settings > Managers' Dock option list alongside the
//     pre-existing 5 options (proving DOCK_OPTIONS wasn't clobbered)
//
// Run: node testing/scripts/test-dock-sidebar-minimal.mjs
// The dev server URL can be overridden with WOS_BASE_URL (default http://localhost:8080).
// NOTE: if another worktree/session already has a dev server bound to :8080, run this
// worktree's dev server on a different port (e.g. `npx webpack serve --port 8221`) and
// set WOS_BASE_URL accordingly - hitting the wrong :8080 server silently serves a
// *different* checkout's docs/public, which 404s on files only added here.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const BASE_URL = process.env.WOS_BASE_URL || 'http://localhost:8080';

mkdirSync('testing/screenshots', { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

page.on('console', msg => {
  if (msg.type() === 'error') console.log('[page error]', msg.text().substring(0, 200));
});

await page.goto(BASE_URL + '/', { waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });
await page.reload({ waitUntil: 'networkidle' });
// Boot (vfs population, package loader running every /opt/apps/*/main.js, initd.run)
// takes several seconds - confirmed empirically to need ~7s+ before window.platform's
// layout module has registered commands like open-vfs-dock.
await page.waitForTimeout(7000);

const results = {};

// Each entry launches a DIFFERENT pinned app (by .item index) so the two
// iterations don't collide on the same already-open window: if variant A
// opens 'explorer' and variant B's dock also has 'explorer' pinned at the
// same index, clicking it a 2nd time would call wm.toggleWindow (since a
// matching window already exists) instead of wm.launch, which wouldn't
// increase the window count and would look like a false failure even though
// the IPC round-trip worked correctly.
const variants = [
  { id: 'sidebar', clickIndex: 1 }, // 'explorer' (Files)
  { id: 'minimal', clickIndex: 2 }, // 'ui.notepad'
];

for (const { id, clickIndex } of variants) {
  console.log(`\n=== Testing dock variant: ${id} ===`);

  // Reset any leftover overlay (e.g. the app-drawer) from a previous iteration.
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);

  await page.evaluate((dockId) => {
    window.platform.host.callCommand('open-vfs-dock', dockId);
  }, id);
  await page.waitForTimeout(1200);

  // The host's auto-hide (src/core/layout/index.tsx openVfsDock) only keeps the
  // dock permanently visible while zero windows are open; once a window exists
  // (true from the 2nd loop iteration onward, since we don't close windows
  // between iterations) it slides the iframe off-screen (translateY(100%))
  // until the mouse comes within 14px of the viewport's bottom edge. Simulate
  // that here so the dock is actually interactable regardless of iteration order.
  await page.mouse.move(700, 897);
  await page.waitForTimeout(400);

  const dockIframeHandle = await page.$('#vfs-dock-iframe');
  if (!dockIframeHandle) {
    results[id] = { error: 'no #vfs-dock-iframe found' };
    continue;
  }

  const frame = await dockIframeHandle.contentFrame();
  if (!frame) {
    results[id] = { error: 'could not access dock iframe contentFrame' };
    continue;
  }

  // Wait for the dock's own bootstrap (ipc.call wm.getLaunchItems/getWindows) to render items.
  await frame.waitForSelector('.item', { timeout: 5000 }).catch(() => {});
  const itemCount = await frame.$$eval('.item', els => els.length);
  console.log(`  .item count: ${itemCount}`);

  await page.screenshot({ path: `testing/screenshots/dock-${id}.png` });
  console.log(`  screenshot saved: testing/screenshots/dock-${id}.png`);

  const winsBefore = await page.evaluate(() => window.__wosWmBridge.getWindows().length);

  // Click a pinned launch item (never index 0: the default pinned set is
  // ['ui.app-drawer', 'explorer', 'ui.notepad', ...] and 'ui.app-drawer' has
  // meta.callable=true - it toggles an overlay directly via callCommand
  // instead of windowManager.createWindow, so it never shows up in
  // __wosWmBridge.getWindows()). Indices 1/2 open real tracked windows.
  const target = frame.locator('.item').nth(clickIndex);
  await target.click({ force: true });
  await page.waitForTimeout(1500);

  const winsAfter = await page.evaluate(() => window.__wosWmBridge.getWindows().length);
  console.log(`  windows before click: ${winsBefore}, after click: ${winsAfter}`);

  await page.screenshot({ path: `testing/screenshots/dock-${id}-after-click.png` });

  results[id] = { itemCount, winsBefore, winsAfter, opened: winsAfter > winsBefore };
}

console.log('\n=== Dock variant results ===');
console.log(JSON.stringify(results, null, 2));

// ── Settings > Managers: confirm both new options are listed alongside the
//    5 pre-existing ones (proves DOCK_OPTIONS append didn't clobber anything).
console.log('\n=== Settings > Managers check ===');
await page.evaluate(() => {
  window.platform.host.execCommand(
    "service('001-core.layout', 'open-window') (command('ui.settings'), '20-managers')",
    window.platform
  );
});
await page.waitForTimeout(2500);

let settingsFrame = null;
for (const f of page.frames()) {
  const c = await f.locator('text=Sidebar').count().catch(() => 0);
  if (c > 0) { settingsFrame = f; break; }
}

if (!settingsFrame) {
  console.log('Could not locate Settings iframe containing "Sidebar" option.');
} else {
  const labels = ['None', 'Default', 'macOS Style', 'Windows 11', 'GNOME', 'Sidebar', 'Minimal'];
  const found = {};
  for (const label of labels) {
    found[label] = await settingsFrame.locator(`text=${label}`).count();
  }
  console.log('Dock option label presence counts:', JSON.stringify(found, null, 2));
  await page.screenshot({ path: 'testing/screenshots/dock-settings-managers.png' });

  // Scroll the "Sidebar" option into view so the screenshot actually shows the
  // Dock section's option list (the Managers page is tall / scrollable and the
  // Dock section sits below Window Manager theme controls).
  await settingsFrame.locator('text=Sidebar').first().scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'testing/screenshots/dock-settings-managers-dock-section.png' });
}

await browser.close();
console.log('\nDone.');
