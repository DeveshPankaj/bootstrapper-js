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

// Seed an extra test wallpaper into user-preferences.json
await page.evaluate(() => {
  const fs = window.fs;
  const prefs = JSON.parse(fs.readFileSync('/user-preferences.json', 'utf-8'));
  if (!prefs.wallpapers.includes('/public/wallpaper-test.webp')) {
    prefs.wallpapers.push('/public/wallpaper-test.webp');
  }
  fs.writeFileSync('/user-preferences.json', JSON.stringify(prefs, null, 2));
});

// Open Settings -> Wallpaper page
await page.evaluate(() => {
  window.platform.host.execCommand(`service('root', 'exec') ('/home/user1/settings.html');`, window.platform);
});
await page.waitForTimeout(1500);

let settingsFrame = null;
for (const frame of page.frames()) {
  if (await frame.locator('text=Wallpaper').count() > 0) { settingsFrame = frame; break; }
}
console.log('settings frame found:', !!settingsFrame);

await settingsFrame.locator('text=Wallpaper').first().click({ force: true });
await page.waitForTimeout(500);

// re-find frame after re-render
for (const frame of page.frames()) {
  if (await frame.locator('.wallpaper-card').count() > 0) { settingsFrame = frame; break; }
}

const cardCountBefore = await settingsFrame.locator('.wallpaper-card').count();
console.log('wallpaper cards before delete:', cardCountBefore);

// Right-click the last wallpaper card (our test wallpaper)
const lastCard = settingsFrame.locator('.wallpaper-card').last();
await lastCard.click({ button: 'right', force: true });
await page.waitForTimeout(300);

const menuVisible = await settingsFrame.locator('.wallpaper-context-menu').count();
console.log('context menu visible:', menuVisible);

await settingsFrame.locator('.wallpaper-context-menu button', { hasText: 'Delete' }).click({ force: true });
await page.waitForTimeout(500);

const cardCountAfter = await settingsFrame.locator('.wallpaper-card').count();
console.log('wallpaper cards after delete:', cardCountAfter);

const prefsAfter = await page.evaluate(() => JSON.parse(window.fs.readFileSync('/user-preferences.json', 'utf-8')).wallpapers);
console.log('wallpapers in json after delete:', JSON.stringify(prefsAfter));

await page.screenshot({ path: 'testing/screenshots/wallpaper-delete-test.png' });
console.log('errors:', errors);

await browser.close();
