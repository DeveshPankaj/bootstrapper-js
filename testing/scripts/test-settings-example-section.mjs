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

await page.evaluate(() => {
  window.platform.host.execCommand(`service('root', 'exec') ('/home/user1/settings.html');`, window.platform);
});
await page.waitForTimeout(1500);

let settingsFrame = null;
for (let i = 0; i < 30 && !settingsFrame; i++) {
  await page.waitForTimeout(200);
  for (const f of page.frames()) {
    try {
      if (await f.locator('.settings-nav-item', { hasText: 'Example' }).count() > 0) { settingsFrame = f; break; }
    } catch (e) { /* ignore */ }
  }
}
console.log('settings frame found with Example nav item:', !!settingsFrame);

const navItems = await settingsFrame.locator('.settings-nav-item').evaluateAll(els =>
  els.map(el => ({ icon: el.querySelector('.settings-nav-icon')?.textContent, label: el.querySelector('span:last-child')?.textContent, bg: el.querySelector('.settings-nav-icon')?.style.background }))
);
console.log('nav items:', JSON.stringify(navItems, null, 2));

await settingsFrame.locator('.settings-nav-item', { hasText: 'Example' }).click({ force: true });
await page.waitForTimeout(500);

console.log('title:', await settingsFrame.locator('.settings-page-title').first().textContent());
console.log('clock:', await settingsFrame.locator('#example-clock').textContent());
console.log('count before click:', await settingsFrame.locator('#example-count').textContent());

await settingsFrame.locator('#example-button').click({ force: true });
await settingsFrame.locator('#example-button').click({ force: true });
await page.waitForTimeout(200);
console.log('count after 2 clicks:', await settingsFrame.locator('#example-count').textContent());

// Re-open settings (close + reopen) and check section isn't duplicated
await page.waitForTimeout(300);
await page.evaluate(() => {
  window.platform.host.execCommand(`service('root', 'exec') ('/home/user1/settings.html');`, window.platform);
});
await page.waitForTimeout(1500);

const allFrames = page.frames();
let exampleCount = 0;
for (const f of allFrames) {
  try {
    exampleCount += await f.locator('.settings-nav-item', { hasText: 'Example' }).count();
  } catch (e) {}
}
console.log('total "Example" nav items across frames after reopening:', exampleCount);

await page.screenshot({ path: 'testing/screenshots/settings-example-section.png' });

await browser.close();
