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

// Write a small 1x1 PNG into the home directory so the desktop icon list picks it up
const tinyPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
await page.evaluate((b64) => {
  const fs = window.platform.host.getFS();
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  fs.writeFileSync('/home/user1/test-thumb.png', Buffer.from(bytes));
}, tinyPngBase64);

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const icon = page.locator('.desktop-icons .file-item').filter({ hasText: 'test-thumb.png' }).first();
console.log('icon found:', await icon.count());
const fileDiv = icon.locator('.file').first();
const bg = await fileDiv.evaluate(el => getComputedStyle(el).backgroundImage);
console.log('background-image:', bg);

await page.screenshot({ path: 'testing/screenshots/image-thumbnail.png' });

// cleanup
await page.evaluate(() => {
  const fs = window.platform.host.getFS();
  fs.unlinkSync('/home/user1/test-thumb.png');
});

await browser.close();
