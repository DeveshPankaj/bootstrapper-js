import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on('pageerror', err => { errors.push(err.message); console.log('PAGEERROR:', err.message); });
page.on('console', msg => { if (msg.type() === 'error') { errors.push(msg.text()); console.log('CONSOLE ERROR:', msg.text()); } });

await page.goto('http://localhost:8080');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

await page.evaluate(() => {
  window.platform.host.execCommand(`service('root', 'exec') ('/home/user1/settings.html');`, window.platform);
});
await page.waitForTimeout(1500);

let settingsFrame = null;
for (const frame of page.frames()) {
  if (await frame.locator('text=Window Manager').count() > 0) { settingsFrame = frame; break; }
}
console.log('settings frame found:', !!settingsFrame);

await settingsFrame.locator('text=Window Manager').first().click({ force: true });
await page.waitForTimeout(500);

await page.screenshot({ path: 'testing/screenshots/wm-themes-current.png' });
console.log('captured wm-themes-current.png');
console.log('errors:', errors);

await browser.close();
