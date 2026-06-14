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
      if (await f.locator('.settings-nav-item').count() > 1) { settingsFrame = f; break; }
    } catch (e) { /* ignore */ }
  }
}
console.log('settings frame found:', !!settingsFrame);

const navItems = await settingsFrame.locator('.settings-nav-item').evaluateAll(els =>
  els.map(el => ({ icon: el.querySelector('.settings-nav-icon')?.textContent, label: el.querySelector('span:last-child')?.textContent }))
);
console.log('nav items:', JSON.stringify(navItems, null, 2));

// Click through each page and check it renders a title
for (const item of navItems) {
  await settingsFrame.locator('.settings-nav-item', { hasText: item.label }).first().click({ force: true });
  await page.waitForTimeout(300);
  const title = await settingsFrame.locator('.settings-page-title, h1').first().textContent().catch(() => '<none>');
  console.log(`page "${item.label}" -> title: "${title}"`);
}

await page.screenshot({ path: 'testing/screenshots/settings-split.png' });

// Reopen settings and verify no duplicate nav items
await page.evaluate(() => {
  window.platform.host.execCommand(`service('root', 'exec') ('/home/user1/settings.html');`, window.platform);
});
await page.waitForTimeout(1500);

let settingsFrame2 = null;
for (let i = 0; i < 30 && !settingsFrame2; i++) {
  await page.waitForTimeout(200);
  for (const f of page.frames()) {
    try {
      if (f !== settingsFrame && await f.locator('.settings-nav-item').count() > 1) { settingsFrame2 = f; break; }
    } catch (e) {}
  }
}
console.log('second settings frame found:', !!settingsFrame2);
const navItems2 = await settingsFrame2.locator('.settings-nav-item').evaluateAll(els =>
  els.map(el => el.querySelector('span:last-child')?.textContent)
);
console.log('second window nav items:', JSON.stringify(navItems2));

await browser.close();
