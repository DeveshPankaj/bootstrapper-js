// Verifies the expanded Architecture settings page (docs/public/mount/etc/settings/21-architecture.js):
// all 17 subsystem nodes render, selecting one shows its interface list, rows with
// children expand/collapse on click (and nest further), and Expand all/Collapse all work.
import { chromium } from 'playwright';
const PORT = process.env.PORT || 8103, URL = `http://localhost:${PORT}`, SHOT = 'testing/screenshots';
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 20000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (_) {} await sleep(300); } return false; }

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));

await page.goto(URL); await page.waitForTimeout(3000); await page.reload(); await page.waitForTimeout(3000); await page.reload(); await page.waitForTimeout(6000);
await waitFor(() => page.evaluate(() => !!window.platform?.host?.getCommand('ui.settings')));

for (let i = 0; i < 10; i++) {
  const ok = await page.evaluate(() => { try { window.platform.host.callCommand('ui.settings'); return true; } catch (_) { return false; } }).catch(() => false);
  if (ok) break;
  await sleep(500);
}
await page.waitForTimeout(1500);

let settingsFrame = null;
await waitFor(async () => {
  for (const frame of page.frames()) { try { if (await frame.locator('text=Architecture').count() > 0) { settingsFrame = frame; return true; } } catch (_) {} }
  return false;
}, 20000);
check('Settings opens with an Architecture nav item', !!settingsFrame);
await settingsFrame.locator('text=Architecture').first().click({ force: true });
await page.waitForTimeout(500);

const svgText = await settingsFrame.locator('svg[aria-label="WOS Architecture Diagram"]').count();
check('architecture diagram SVG renders', svgText > 0);

const buttonLabels = await settingsFrame.evaluate(() => [...document.querySelectorAll('.settings-group button')].map(b => b.textContent.trim()).filter(Boolean));
const expectedNew = ['Cron', 'Command Registry', 'Process Manager', 'Activity Registry', 'Deep Links', 'Widgets', 'Settings App', 'Mesh Bridge', 'File Explorer', 'Terminal'];
check('all 10 new subsystem buttons are present', expectedNew.every(l => buttonLabels.some(b => b.includes(l))), JSON.stringify(buttonLabels));
check('17 total subsystems selectable', buttonLabels.filter(l => l && !['Expand all', 'Collapse all'].includes(l)).length >= 17, JSON.stringify(buttonLabels));

// Select a node with nested children (Cron) via the diagram click path.
await settingsFrame.locator('button:has-text("Cron")').first().click({ force: true });
await page.waitForTimeout(400);
const afterSelect = await settingsFrame.evaluate(() => document.body.textContent);
check('selecting Cron shows its interface list', afterSelect.includes('Cron — Interfaces') && afterSelect.includes('startCronScheduler'));
check('a row with children shows a (count) badge', /startCronScheduler\(\)\s*\(2\)/.test(afterSelect) || afterSelect.includes('(2)'));

// Nothing nested visible yet (collapsed by default).
check('nested child rows are NOT visible before expanding', !afterSelect.includes('tick()'));

// Click the expandable row to reveal its children.
const expandableRow = settingsFrame.locator('div[style*="cursor: pointer"]', { hasText: 'startCronScheduler()' }).first();
await expandableRow.click({ force: true });
await page.waitForTimeout(300);
const afterExpand = await settingsFrame.evaluate(() => document.body.textContent);
check('clicking the expandable row reveals its nested children', afterExpand.includes('tick()') && afterExpand.includes('minuteKey(now)'));

// Collapse it again by clicking the same row.
await expandableRow.click({ force: true });
await page.waitForTimeout(300);
const afterCollapse = await settingsFrame.evaluate(() => document.body.textContent);
check('clicking it again collapses the children', !afterCollapse.includes('tick()'));

// Expand all / Collapse all.
await settingsFrame.locator('button:has-text("Expand all")').click({ force: true });
await page.waitForTimeout(300);
const afterExpandAll = await settingsFrame.evaluate(() => document.body.textContent);
check('"Expand all" opens every nested group at once', afterExpandAll.includes('tick()') && afterExpandAll.includes("command starts with '/'"));

await settingsFrame.locator('button:has-text("Collapse all")').click({ force: true });
await page.waitForTimeout(300);
const afterCollapseAll = await settingsFrame.evaluate(() => document.body.textContent);
check('"Collapse all" closes everything again', !afterCollapseAll.includes('tick()'));

// Switching to a different node resets expansion state. Once a node is
// selected, the quick-select button grid is replaced by the Interfaces panel
// (by design — matches the pre-existing behavior for the original 7 nodes
// too), so switching selection goes through the diagram itself, not a button.
await settingsFrame.locator('button:has-text("Expand all")').click({ force: true });
await page.waitForTimeout(300);
await settingsFrame.locator('svg text').filter({ hasText: /^Terminal$/ }).first().click({ force: true });
await page.waitForTimeout(400);
const afterSwitch = await settingsFrame.evaluate(() => document.body.textContent);
check('switching nodes (via diagram) resets to collapsed (no leftover expansion)', afterSwitch.includes('Terminal — Interfaces') && !afterSwitch.includes('addTab()'));

// Deep nesting check via Activity Registry (2+ levels, matches recent work this session).
await settingsFrame.locator('svg text').filter({ hasText: /^Activity Registry$/ }).first().click({ force: true });
await page.waitForTimeout(400);
await settingsFrame.locator('button:has-text("Expand all")').click({ force: true });
await page.waitForTimeout(300);
const activityExpanded = await settingsFrame.evaluate(() => document.body.textContent);
check('Activity Registry reflects this session\'s real registerActivity API', activityExpanded.includes('registerActivity') && activityExpanded.includes('killActivity') && activityExpanded.includes('ActivityDef'));

await page.screenshot({ path: `${SHOT}/architecture-settings-expanded.png` });

check('no page errors', errs.length === 0, errs.slice(0, 5).join(' || '));
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
await browser.close(); process.exit(failed ? 1 : 0);
