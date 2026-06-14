import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

page.on('pageerror', err => console.log('PAGEERROR:', err.message));
page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });

await page.goto('http://localhost:8080');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// --- Test 1: "Add desktop" button removed from taskbar ---
console.log('desktop-add buttons in taskbar:', await page.locator('.desktop-pill.desktop-add').count());
console.log('desktop pills:', await page.locator('.desktop-pill').count());

// --- Test 2: right-click desktop background shows "Add Desktop" item, adds a desktop ---
await page.locator('.content-area').click({ button: 'right', position: { x: 400, y: 400 }, force: true });
await page.waitForTimeout(300);
const menuItems = await page.locator('.contextmenu button').allTextContents();
console.log('desktop context menu items:', JSON.stringify(menuItems));

await page.locator('.contextmenu button', { hasText: 'Add Desktop' }).click({ force: true });
await page.waitForTimeout(500);
console.log('desktop pills after Add Desktop:', await page.locator('.desktop-pill').count());

const desktopsConfig = await page.evaluate(() => {
  const fs = window.platform.host.getFS();
  try { return JSON.parse(fs.readFileSync('/etc/wm/desktops.json', 'utf-8')); } catch (e) { return null; }
});
console.log('desktops config:', JSON.stringify(desktopsConfig));

// --- Test 3: toolbar widget renders with icons and opens a window on click ---
const toolbarWidget = page.locator('.widget[data-widget="toolbar"]');
console.log('toolbar widget present:', await toolbarWidget.count());
const items = await toolbarWidget.locator('.widget-toolbar-item').count();
console.log('toolbar items:', items);
const itemAttrs = await toolbarWidget.locator('.widget-toolbar-item').evaluateAll(els => els.map(el => el.getAttribute('aria-label')));
console.log('toolbar item commands:', JSON.stringify(itemAttrs));

const windowsBefore = await page.locator('.window').count();
await toolbarWidget.locator('.widget-toolbar-item').first().click({ force: true });
await page.waitForTimeout(800);
const windowsAfter = await page.locator('.window').count();
console.log('windows before/after toolbar click:', windowsBefore, windowsAfter);

await page.screenshot({ path: 'testing/screenshots/toolbar-and-desktop-menu.png' });
await browser.close();
