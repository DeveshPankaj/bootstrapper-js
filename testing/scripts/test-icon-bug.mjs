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

// Write a real PNG named json.png into /mnt/public via virtual fs directly
await page.evaluate(async () => {
  const fs = window.platform.host.getFS();
  const res = await fetch('/public/json.png');
  const buf = await res.arrayBuffer();
  if (!fs.existsSync('/mnt/public')) fs.mkdirSync('/mnt/public', { recursive: true });
  fs.writeFileSync('/mnt/public/json.png', Buffer.from(buf));
});

// Open the file explorer (Files)
await page.locator('.taskbar .material-symbols-outlined', { hasText: 'folder' }).first().click({ force: true });
await page.waitForTimeout(2000);

let explorerFrame = null;
for (const frame of page.frames()) {
  if (await frame.locator('[aria-label="mount_local_folder"]').count() > 0) {
    explorerFrame = frame;
    break;
  }
}
console.log('explorer frame found:', !!explorerFrame);

// Navigate to /mnt/public via sidebar "Mounted" then double-click "public"
await explorerFrame.getByText('Mounted', { exact: true }).click({ force: true });
await page.waitForTimeout(800);
await explorerFrame.locator('.file-item', { hasText: 'public' }).dblclick({ force: true });
await page.waitForTimeout(800);

const info = await explorerFrame.evaluate(() => {
  const items = [...document.querySelectorAll('.file-item')];
  for (const item of items) {
    const nameEl = item.querySelector('.file-name');
    if (nameEl?.textContent?.includes('json.png')) {
      const fileDiv = item.querySelector('.file');
      return {
        ext: fileDiv.getAttribute('data-ext'),
        bg: getComputedStyle(fileDiv).backgroundImage,
      };
    }
  }
  return null;
});
console.log('json.png file div:', info);

await page.screenshot({ path: 'testing/screenshots/icon-bug.png' });

await browser.close();
