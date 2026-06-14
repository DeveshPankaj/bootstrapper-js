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

// --- Test 1: widgets present, including the new memory widget ---
const widgetNames = await page.locator('.widget').evaluateAll(els => els.map(el => el.getAttribute('data-widget')));
console.log('widgets:', JSON.stringify(widgetNames));

const memoryWidget = page.locator('.widget[data-widget="memory"]');
await page.waitForTimeout(1000);
console.log('memory widget text:', await memoryWidget.innerText());

// --- Test 2: drag the memory widget and verify position persists ---
const box1 = await memoryWidget.boundingBox();
await page.mouse.move(box1.x + 20, box1.y + 10);
await page.mouse.down();
await page.mouse.move(box1.x - 200, box1.y + 100, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(300);

const box2 = await memoryWidget.boundingBox();
console.log('memory widget moved:', JSON.stringify({ before: { x: box1.x, y: box1.y }, after: { x: box2.x, y: box2.y } }));

const positions = await page.evaluate(() => {
  const fs = window.platform.host.getFS();
  try { return JSON.parse(fs.readFileSync('/etc/widgets/positions.json', 'utf-8')); } catch (e) { return null; }
});
console.log('persisted positions:', JSON.stringify(positions));

// --- Test 3: open Settings, go to Widgets page, disable a widget ---
await page.evaluate(() => {
  window.platform.host.execCommand(`service('root', 'exec') ('/home/user1/settings.html');`, window.platform);
});
await page.waitForTimeout(1500);

let settingsFrame = null;
for (let i = 0; i < 30 && !settingsFrame; i++) {
  await page.waitForTimeout(200);
  for (const f of page.frames()) {
    try {
      if (await f.locator('.settings-nav-item', { hasText: 'Widgets' }).count() > 0) { settingsFrame = f; break; }
    } catch (e) { /* ignore */ }
  }
}
console.log('settings frame found:', !!settingsFrame);

await settingsFrame.locator('.settings-nav-item', { hasText: 'Widgets' }).click({ force: true });
await page.waitForTimeout(500);

const widgetRows = await settingsFrame.locator('.settings-page .settings-row').evaluateAll(els =>
  els.map(el => ({ title: el.querySelector('.settings-row-title')?.textContent, checked: el.querySelector('input[type=checkbox]')?.checked }))
);
console.log('widget rows:', JSON.stringify(widgetRows));

// Uncheck the "Clock" widget
await settingsFrame.locator('.settings-page .settings-row', { hasText: 'Clock' }).locator('input[type=checkbox]').uncheck({ force: true });
await page.waitForTimeout(500);

console.log('clock widget visible after disable:', await page.locator('.widget[data-widget="clock"]').count());

const widgetsConfig = await page.evaluate(() => {
  const fs = window.platform.host.getFS();
  try { return JSON.parse(fs.readFileSync('/etc/widgets/config.json', 'utf-8')); } catch (e) { return null; }
});
console.log('widgets config:', JSON.stringify(widgetsConfig));

// Re-enable for cleanliness
await settingsFrame.locator('.settings-page .settings-row', { hasText: 'Clock' }).locator('input[type=checkbox]').check({ force: true });
await page.waitForTimeout(300);

// --- Test 4: multi-desktop ---
const desktopPills = await page.locator('.desktop-pill').count();
console.log('desktop pills:', desktopPills);

// Open a window (Notes.md) on desktop 1
const icon = page.locator('.desktop-icons .file-item, .desktop-icons div').filter({ hasText: 'Notes.md' }).first();
await icon.dblclick({ force: true });
await page.waitForTimeout(1000);
console.log('windows on desktop 1:', await page.locator('.taskbar-window-icon').count());
console.log('open window visible:', await page.locator('.window').first().isVisible());

// Add a second desktop via the desktop background's right-click context menu
// Note: an open window's overlay iframe covers the full viewport in headless
// mode, so a coordinate-based click (even with force:true) can hit the
// overlay instead of the menu item. Use a real DOM .click() via evaluate,
// which still triggers React's delegated onClick, to bypass that.
await page.locator('.content-area').dispatchEvent('contextmenu', { clientX: 400, clientY: 400 });
await page.waitForTimeout(300);
await page.locator('.contextmenu button', { hasText: 'Add Desktop' }).evaluate(el => el.click());
await page.waitForTimeout(500);
console.log('desktop pills after add:', await page.locator('.desktop-pill').count());

// On desktop 2, the window from desktop 1 should be hidden, taskbar icon gone
console.log('window visible on desktop 2:', await page.locator('.window').first().isVisible());
console.log('windows on desktop 2 (taskbar):', await page.locator('.taskbar-window-icon').count());

// Switch back to desktop 1
await page.locator('.desktop-pill').first().evaluate(el => el.click());
await page.waitForTimeout(500);
console.log('window visible on desktop 1 again:', await page.locator('.window').first().isVisible());
console.log('windows on desktop 1 again (taskbar):', await page.locator('.taskbar-window-icon').count());

// Right-click desktop 2 pill and delete it
const desktop2 = page.locator('.desktop-pill').nth(1);
await desktop2.evaluate(el => {
  const rect = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 }));
});
await page.waitForTimeout(300);
const menuItems = await page.locator('.desktop-context-menu button').allTextContents();
console.log('context menu items:', JSON.stringify(menuItems));
await page.locator('.desktop-context-menu button', { hasText: 'Delete desktop' }).evaluate(el => el.click());
await page.waitForTimeout(500);
console.log('desktop pills after delete:', await page.locator('.desktop-pill').count());

const desktopsConfig = await page.evaluate(() => {
  const fs = window.platform.host.getFS();
  try { return JSON.parse(fs.readFileSync('/etc/wm/desktops.json', 'utf-8')); } catch (e) { return null; }
});
console.log('desktops config:', JSON.stringify(desktopsConfig));

await page.screenshot({ path: 'testing/screenshots/widgets-and-desktops.png' });
await browser.close();
