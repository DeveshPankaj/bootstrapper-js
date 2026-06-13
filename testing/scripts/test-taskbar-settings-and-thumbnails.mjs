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

// Click the taskbar settings icon
await page.locator('.taskbar-settings').click({ force: true });
await page.waitForTimeout(1500);

// Find the settings window iframe
let settingsFrame = null;
for (const frame of page.frames()) {
  if (await frame.locator('text=Window Manager').count() > 0) {
    settingsFrame = frame;
    break;
  }
}
console.log('settings window opened:', !!settingsFrame);

if (settingsFrame) {
  // Navigate to Window Manager page if not already shown
  const wmLink = settingsFrame.locator('text=Window Manager').first();
  await wmLink.click({ force: true }).catch(() => {});
  await page.waitForTimeout(500);
  console.log('Taskbar background row present:', await settingsFrame.locator('text=Taskbar background').count());
}

// Open the file explorer to check image thumbnails
console.log('explorer icon count:', await page.locator('[aria-label="explorer"]').count());
await page.locator('[aria-label="explorer"]').first().click({ force: true });
await page.waitForTimeout(2000);

let explorerFrame = null;
for (const frame of page.frames()) {
  if (await frame.locator('.file-explorer-status').count() > 0) {
    explorerFrame = frame;
    break;
  }
}
console.log('explorer opened:', !!explorerFrame);
if (!explorerFrame) {
  console.log('frame count:', page.frames().length);
}

if (explorerFrame) {
  // Look for a .file element whose background-image points to /(sw)
  const fileEls = explorerFrame.locator('.file[data-ext=".png"], .file[data-ext=".jpg"], .file[data-ext=".jpeg"], .file[data-ext=".webp"], .file[data-ext=".svg"]');
  const count = await fileEls.count();
  console.log('image file elements found:', count);
  if (count > 0) {
    const bg = await fileEls.first().evaluate(el => getComputedStyle(el).backgroundImage);
    console.log('first image file background:', bg);
  }
}

await page.screenshot({ path: 'testing/screenshots/settings-and-explorer.png' });
await browser.close();
