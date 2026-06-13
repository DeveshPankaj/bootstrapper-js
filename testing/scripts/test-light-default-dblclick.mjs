import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

page.on('pageerror', err => console.log('PAGEERROR:', err.message));

await page.goto('http://localhost:8080');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// Check seeded current.json is Light
const current = await page.evaluate(() => {
  const fs = window.platform.host.getFS();
  return JSON.parse(fs.readFileSync('/etc/wm/current.json', 'utf-8'));
});
console.log('seeded theme name:', current.name);

// Open a single app window via a desktop icon double click (Notes.md)
const icon = page.locator('.desktop-icons .file-item, .desktop-icons div').filter({ hasText: 'Notes.md' }).first();
await icon.dblclick({ force: true });
await page.waitForTimeout(1500);

const win = page.locator('.window:not(.hidden)').last();
const header = win.locator('.window-header').first();

const before = await win.boundingBox();
console.log('before:', before);

// double click in the middle (empty) area of the header, not on title or icons
let headerBox = await header.boundingBox();
await page.mouse.dblclick(headerBox.x + headerBox.width * 0.7, headerBox.y + headerBox.height / 2);
await page.waitForTimeout(800);

let after = await win.boundingBox();
console.log('after toggling on (empty header area):', after, 'data-fullscreen=', await win.getAttribute('data-fullscreen'));

// double click on the title text to toggle off
headerBox = await header.boundingBox();
await page.mouse.dblclick(headerBox.x + 30, headerBox.y + headerBox.height / 2);
await page.waitForTimeout(800);

after = await win.boundingBox();
console.log('after toggling off (title):', after, 'data-fullscreen=', await win.getAttribute('data-fullscreen'));

// double click directly on the close icon should NOT toggle fullscreen (and not close, since close.onclick just logs)
headerBox = await header.boundingBox();
const closeIcon = header.locator('.material-symbols-outlined').last();
const closeBox = await closeIcon.boundingBox();
await page.mouse.dblclick(closeBox.x + closeBox.width / 2, closeBox.y + closeBox.height / 2);
await page.waitForTimeout(800);

after = await win.boundingBox();
console.log('after dblclick on close icon (should be unchanged):', after, 'data-fullscreen=', await win.getAttribute('data-fullscreen'));

await page.screenshot({ path: 'testing/screenshots/light-default-and-dblclick.png' });

await browser.close();
