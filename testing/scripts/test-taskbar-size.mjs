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

const taskbarBefore = await page.locator('.taskbar').first().boundingBox();
console.log('taskbar height before:', taskbarBefore.height);

// Open settings -> Window Manager
await page.locator('.taskbar-settings').click({ force: true });
await page.waitForTimeout(1500);

let settingsFrame = null;
for (const frame of page.frames()) {
  if (await frame.locator('text=Window Manager').count() > 0) { settingsFrame = frame; break; }
}
await settingsFrame.locator('text=Window Manager').first().click({ force: true });
await page.waitForTimeout(500);
for (const frame of page.frames()) {
  if (await frame.locator('text=Taskbar size').count() > 0) { settingsFrame = frame; break; }
}

const sizeRow = settingsFrame.locator('text=Taskbar size').locator('xpath=..');
const slider = sizeRow.locator('input[type="range"]');
console.log('slider value before:', await slider.inputValue());

await slider.evaluate(el => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, '90');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(500);

const current = await page.evaluate(() => {
  const fs = window.platform.host.getFS();
  return JSON.parse(fs.readFileSync('/etc/wm/current.json', 'utf-8'));
});
console.log('persisted taskbarSize:', current.appearance.taskbarSize);

const cssVar = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--wm-taskbar-size'));
console.log('--wm-taskbar-size:', cssVar);

const taskbarAfter = await page.locator('.taskbar').first().boundingBox();
console.log('taskbar height after:', taskbarAfter.height);

await page.screenshot({ path: 'testing/screenshots/taskbar-size.png' });
await browser.close();
