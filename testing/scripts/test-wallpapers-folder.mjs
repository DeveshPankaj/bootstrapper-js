import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on('pageerror', err => { errors.push(err.message); console.log('PAGEERROR:', err.message); });
page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('check-public-ip') && !msg.text().includes('Failed to load resource')) { errors.push(msg.text()); console.log('CONSOLE ERROR:', msg.text()); } });

await page.goto('http://localhost:8080');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// Seed a wallpapers folder with a couple of test images
await page.evaluate(() => {
  const fs = window.fs;
  fs.mkdirSync('/home/user1/wallpapers', { recursive: true });
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const bytes = Uint8Array.from(atob(pngBase64), c => c.charCodeAt(0));
  fs.writeFileSync('/home/user1/wallpapers/wp1.png', Buffer.from(bytes));
  fs.writeFileSync('/home/user1/wallpapers/wp2.png', Buffer.from(bytes));
  fs.writeFileSync('/home/user1/wallpapers/notanimage.txt', 'hello');
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

for (const frame of page.frames()) {
  if (await frame.locator('.wallpaper-card').count() > 0) { settingsFrame = frame; break; }
}

const cardCountBefore = await settingsFrame.locator('.wallpaper-card').count();
console.log('wallpaper cards before setting folder:', cardCountBefore);

// Click "Set Wallpapers Folder"
await settingsFrame.locator('button', { hasText: 'Set Wallpapers Folder' }).click({ force: true });
await page.waitForTimeout(500);

let pickerFrame = settingsFrame;
console.log('filepicker visible:', await pickerFrame.locator('.filepicker-dialog').count());

// Navigate: Root -> home -> user1 -> wallpapers
const nav = async (name) => {
  await pickerFrame.locator('.filepicker-item', { hasText: name }).first().dblclick({ force: true });
  await page.waitForTimeout(300);
};
await nav('wallpapers');

// Choose this folder
await pickerFrame.locator('button', { hasText: 'Choose This Folder' }).click({ force: true });
await page.waitForTimeout(500);

// re-find frame
for (const frame of page.frames()) {
  if (await frame.locator('.wallpaper-card').count() > 0) { settingsFrame = frame; break; }
}

const folderLabel = await settingsFrame.locator('text=/Wallpapers folder/').textContent();
console.log('folder label:', folderLabel);

const cardCountAfter = await settingsFrame.locator('.wallpaper-card').count();
console.log('wallpaper cards after setting folder:', cardCountAfter);

const prefsAfter = await page.evaluate(() => JSON.parse(window.fs.readFileSync('/user-preferences.json', 'utf-8')).wallpapers_dir);
console.log('wallpapers_dir in prefs:', prefsAfter);

await page.screenshot({ path: 'testing/screenshots/wallpapers-folder.png' });
console.log('errors:', errors);

await browser.close();
