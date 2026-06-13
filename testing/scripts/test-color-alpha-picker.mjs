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

await page.locator('.taskbar-settings').click({ force: true });
await page.waitForTimeout(1500);

let settingsFrame = null;
for (const frame of page.frames()) {
  if (await frame.locator('text=Window Manager').count() > 0) {
    settingsFrame = frame;
    break;
  }
}
console.log('settings opened:', !!settingsFrame);
await settingsFrame.locator('text=Window Manager').first().click({ force: true });
await page.waitForTimeout(500);

// Re-find frame after re-render
for (const frame of page.frames()) {
  if (await frame.locator('text=Taskbar background').count() > 0) {
    settingsFrame = frame;
    break;
  }
}

const windowRow = settingsFrame.locator('text=Window background').locator('xpath=..');
const taskbarRow = settingsFrame.locator('text=Taskbar background').locator('xpath=..');

console.log('window bg color input count:', await windowRow.locator('input[type="color"]').count());
console.log('window bg range input count:', await windowRow.locator('input[type="range"]').count());
console.log('taskbar bg color input count:', await taskbarRow.locator('input[type="color"]').count());
console.log('taskbar bg range input count:', await taskbarRow.locator('input[type="range"]').count());

const taskbarColorVal = await taskbarRow.locator('input[type="color"]').inputValue();
const taskbarRangeVal = await taskbarRow.locator('input[type="range"]').inputValue();
console.log('taskbar color hex:', taskbarColorVal, 'alpha:', taskbarRangeVal);

// Change taskbar background color and check persisted current.json
await taskbarRow.locator('input[type="color"]').evaluate(el => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, '#ff0000');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(500);

// Change taskbar background alpha and check persisted current.json
await taskbarRow.locator('input[type="range"]').evaluate(el => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, '0.3');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(500);

const current = await page.evaluate(() => {
  const fs = window.platform.host.getFS();
  return JSON.parse(fs.readFileSync('/etc/wm/current.json', 'utf-8'));
});
console.log('persisted taskbarBackground:', current.appearance.taskbarBackground);

await page.screenshot({ path: 'testing/screenshots/color-alpha-picker.png' });
await browser.close();
