// Diagnostic repro kept for future reference (per CLAUDE.md testing
// conventions: test/debug scripts are kept, not deleted).
//
// Finding: on macOS Chromium (including headless, under Playwright/CDP),
// `locator.click({ modifiers: ['Control'] })` never reaches the page's
// "click" listeners at all - Chromium on macOS converts a primary-button
// click held with Control into a native secondary-click/contextmenu gesture,
// matching real macOS Finder conventions (Ctrl+click = right-click,
// Cmd+click = multi-select toggle). This reproduces that observably: after a
// plain click selects "a-alpha.txt", a Control-click on "c-charlie.txt"
// leaves the selection UNCHANGED (still just a-alpha selected), while a
// Meta/Cmd-click on the same item DOES toggle it into the selection.
//
// Practical consequence for file-explorer multi-select tests written on this
// host: simulate "Ctrl/Cmd-click to toggle" using the `Meta` modifier (real
// Cmd-click), not `Control` - the app code itself checks
// `event.metaKey || event.ctrlKey`, so this exercises the same code path and
// is the correct simulation for how an actual Mac user would perform this
// gesture. See test-explorer-multiselect.mjs for the real test suite.
//
//   npx webpack serve --port 8104 &
//   node testing/scripts/debug-ctrlclick-8104.mjs
//
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto('http://localhost:8104/', { waitUntil: 'load' });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.waitForFunction(() => window.platform && window.platform.host && window.platform.host.getFS, { timeout: 60000 });
await page.waitForFunction(() => {
  try { return !!window.platform.host.getService('001-core.layout', 'open-window'); } catch (_) { return false; }
}, { timeout: 60000 });

await page.evaluate(() => {
  const fs = window.platform.host.getFS();
  if (!fs.existsSync('/tmp/ms-test')) fs.mkdirSync('/tmp/ms-test');
  fs.writeFileSync('/tmp/ms-test/a-alpha.txt', 'A'.repeat(100));
  fs.writeFileSync('/tmp/ms-test/c-charlie.txt', 'C'.repeat(300));
});
await page.evaluate(() => window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('explorer'), '/tmp/ms-test')", window.platform));
await page.waitForTimeout(1500);

let frame = null;
for (const f of page.frames()) { if (await f.locator('.file-item', { hasText: 'a-alpha.txt' }).count() > 0) { frame = f; break; } }
console.log('frame found', !!frame);

await frame.locator('.file-item', { hasText: 'a-alpha.txt' }).click({ force: true });
await page.waitForTimeout(300);
frame = null;
for (const f of page.frames()) { if (await f.locator('.file-item', { hasText: 'a-alpha.txt' }).count() > 0) { frame = f; break; } }

console.log('--- Control-click on a second item (expected: selection UNCHANGED - swallowed as a native secondary click on macOS) ---');
await frame.locator('.file-item', { hasText: 'c-charlie.txt' }).click({ modifiers: ['Control'], force: true });
await page.waitForTimeout(500);
frame = null;
for (const f of page.frames()) { if (await f.locator('.file-item', { hasText: 'a-alpha.txt' }).count() > 0) { frame = f; break; } }
let selectedAfterCtrl = await frame.locator('.file-item.selected .file-name').allInnerTexts();
console.log('selected after Control-click:', selectedAfterCtrl, '(expected: ["a-alpha.txt"] only, unchanged)');

console.log('--- Meta/Cmd-click on the same item (expected: toggles it INTO the selection) ---');
await frame.locator('.file-item', { hasText: 'c-charlie.txt' }).click({ modifiers: ['Meta'], force: true });
await page.waitForTimeout(500);
frame = null;
for (const f of page.frames()) { if (await f.locator('.file-item', { hasText: 'a-alpha.txt' }).count() > 0) { frame = f; break; } }
let selectedAfterMeta = await frame.locator('.file-item.selected .file-name').allInnerTexts();
console.log('selected after Meta-click:', selectedAfterMeta, '(expected: both a-alpha.txt and c-charlie.txt)');

await browser.close();
