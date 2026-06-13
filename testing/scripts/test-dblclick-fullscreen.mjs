import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

page.on('pageerror', err => console.log('PAGEERROR:', err.message));

await page.goto('http://localhost:8080');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// Open a single app window via a desktop icon double click (Notes.md)
const icon = page.locator('.desktop-icons .file-item, .desktop-icons div').filter({ hasText: 'Notes.md' }).first();
console.log('icon count:', await icon.count());
await icon.dblclick({ force: true });
await page.waitForTimeout(1500);

console.log('windows count:', await page.locator('.window').count());
console.log('visible windows count:', await page.locator('.window:not(.hidden)').count());

const win = page.locator('.window:not(.hidden)').last();
const header = win.locator('.window-header').first();

const before = await win.boundingBox();
console.log('before:', before);

await page.screenshot({ path: 'testing/screenshots/dblclick-before.png' });

const headerBox = await header.boundingBox();
console.log('headerBox:', headerBox);
// double click in the empty middle area of the header (not on title/icons)
await page.mouse.dblclick(headerBox.x + headerBox.width / 2, headerBox.y + headerBox.height / 2);
await page.waitForTimeout(800);

const after = await win.boundingBox();
console.log('after:', after);
console.log('data-fullscreen:', await win.getAttribute('data-fullscreen'));

await page.screenshot({ path: 'testing/screenshots/dblclick-after.png' });

// double click again to toggle back (recompute header position, since the
// window moved when it went fullscreen)
const headerBox2 = await header.boundingBox();
console.log('headerBox2:', headerBox2);
await page.mouse.dblclick(headerBox2.x + 30, headerBox2.y + headerBox2.height / 2);
await page.waitForTimeout(800);

const after2 = await win.boundingBox();
console.log('after2 (toggled back):', after2);
console.log('data-fullscreen:', await win.getAttribute('data-fullscreen'));

await page.screenshot({ path: 'testing/screenshots/dblclick-after2.png' });

await browser.close();
