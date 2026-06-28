/**
 * E2E test: SQLite Charts app — widget lifecycle
 *
 * Tests: open app, create sample db, select table, chart it,
 *        add as widget, verify persistence, remove widget, verify cleanup.
 *
 * Usage:  pnpm start   (in another terminal)
 *         node testing/scripts/test-sqlite-charts-widget.mjs
 */
import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const URL = 'http://localhost:8080';
const SCREENSHOT_DIR = 'testing/screenshots';

const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
const assert = (condition, label) => {
  if (condition) { console.log(`  ✅ ${label}`); passed++; }
  else { console.log(`  ❌ ${label}`); failed++; }
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  // Boot
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 15000 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(5000);

  // --- Test 1: Command registered ---
  console.log('\n1. SQLite Charts command');
  const cmdExists = await page.evaluate(() => !!window.platform.host.getCommand('ui.sqlite-charts'));
  assert(cmdExists, 'ui.sqlite-charts command registered');

  // --- Test 2: Open app ---
  console.log('\n2. Open app');
  await page.evaluate(() => window.platform.host.execCommand("service('001-core.layout','open-window')(command('ui.sqlite-charts'))", window.platform));
  await sleep(7000);
  const winCount = await page.evaluate(() => document.querySelectorAll('.window:not(.hidden)').length);
  assert(winCount >= 1, `Window opened (${winCount} visible)`);
  const taskbarIcons = await page.evaluate(() => document.querySelectorAll('.taskbar-window-icon').length);
  assert(taskbarIcons >= 1, `Taskbar shows running window (${taskbarIcons} icons)`);

  // Find app frame
  let appFrame = null;
  for (const f of page.frames()) {
    const t = await f.evaluate(() => document.body?.innerText?.slice(0, 300)).catch(() => '');
    if (t.includes('Sample Database') || t.includes('SQLite Charts')) { appFrame = f; break; }
  }
  assert(!!appFrame, 'App frame found');
  if (!appFrame) { await browser.close(); process.exit(1); }

  // --- Test 3: Create sample DB ---
  console.log('\n3. Create sample database');
  await appFrame.locator('button:has-text("Create Sample")').click({ force: true });
  await sleep(2000);

  // Re-find frame
  for (const f of page.frames()) {
    if (await f.locator('text=products').count().catch(() => 0) > 0) { appFrame = f; break; }
  }
  const hasTables = await appFrame.locator('text=products').count() > 0;
  assert(hasTables, 'Sample DB created with products table');

  const dbExists = await page.evaluate(() => window.fs.existsSync('/home/user1/sample-charts.db'));
  assert(dbExists, 'sample-charts.db written to VFS');

  // --- Test 4: Select products, switch to chart ---
  console.log('\n4. Chart products (category/price)');
  await appFrame.locator('text=products').first().click({ force: true });
  await sleep(300);
  await appFrame.locator('.sc-tab:has-text("Chart")').click({ force: true });
  await sleep(300);

  const selects = await appFrame.locator('.sc-select').all();
  if (selects.length >= 3) {
    await selects[1].selectOption({ index: 1 }); // label = category
    await selects[2].selectOption({ index: 2 }); // value = price
  }
  await sleep(300);

  const chartBars = await appFrame.locator('.sc-chart-bar-row').count();
  assert(chartBars > 0, `Bar chart rendered (${chartBars} bars)`);

  // --- Test 5: Add widget ---
  console.log('\n5. Add widget');
  const widgetsBefore = await page.evaluate(() => document.querySelectorAll('.widgets-panel .widget').length);
  await appFrame.locator('button:has-text("Add Widget")').click({ force: true });
  await sleep(1000);

  const widgetsAfter = await page.evaluate(() => document.querySelectorAll('.widgets-panel .widget').length);
  assert(widgetsAfter > widgetsBefore, `Widget added to desktop (${widgetsBefore} → ${widgetsAfter})`);

  const instances = await page.evaluate(() => {
    try { return JSON.parse(window.fs.readFileSync('/etc/widgets/instances.json', 'utf-8')); } catch (_) { return []; }
  });
  assert(instances.length > 0, `Widget persisted to instances.json (${instances.length} entries)`);
  if (instances.length > 0) {
    assert(instances[0].typeId === 'sqlite-chart', `Type is sqlite-chart`);
    assert(!!instances[0].config.query, `Config has query: "${instances[0].config.query?.slice(0, 40)}..."`);
    assert(instances[0].config.chartType === 'bar', `Chart type saved as bar`);
  }
  await page.screenshot({ path: `${SCREENSHOT_DIR}/widget-added.png` });

  // --- Test 6: Close window, check taskbar clears ---
  console.log('\n6. Close window');
  const pid = await page.evaluate(() => {
    const w = document.querySelector('.window:not(.hidden)');
    return w ? Number(w.getAttribute('data-pid')) : null;
  });
  if (pid) await page.evaluate(p => window.platform.host.callCommand('process.kill', p), pid);
  await sleep(1000);

  const winsAfterClose = await page.evaluate(() => document.querySelectorAll('.window:not(.hidden)').length);
  const taskbarAfterClose = await page.evaluate(() => document.querySelectorAll('.taskbar-window-icon').length);
  assert(winsAfterClose === 0, 'Window removed from DOM');
  assert(taskbarAfterClose === 0, 'Taskbar cleared');

  // Widget should still be there
  const widgetStillThere = await page.evaluate(() => document.querySelectorAll('.widgets-panel .widget').length);
  assert(widgetStillThere >= widgetsAfter, `Widget survives window close (${widgetStillThere} widgets)`);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/after-close.png` });

  // --- Test 7: Remove widget via close button ---
  console.log('\n7. Remove widget');
  const closeBtn = await page.$('.widgets-panel .widget:last-child .widget-close');
  assert(!!closeBtn, 'Widget close button exists');
  if (closeBtn) {
    await closeBtn.click({ force: true });
    await sleep(500);
  }

  const widgetsAfterRemove = await page.evaluate(() => document.querySelectorAll('.widgets-panel .widget').length);
  assert(widgetsAfterRemove < widgetStillThere, `Widget removed from desktop (${widgetStillThere} → ${widgetsAfterRemove})`);

  const instancesAfterRemove = await page.evaluate(() => {
    try { return JSON.parse(window.fs.readFileSync('/etc/widgets/instances.json', 'utf-8')).length; } catch (_) { return 0; }
  });
  assert(instancesAfterRemove === 0, `Widget removed from instances.json (${instancesAfterRemove} remaining)`);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/widget-removed.png` });

  // --- Summary ---
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`Page errors: ${errors.length}`);
  errors.forEach(e => console.log(`  ⚠️  ${e.slice(0, 150)}`));
  console.log(failed === 0 ? '\n🎉 ALL TESTS PASSED' : '\n💥 SOME TESTS FAILED');

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
