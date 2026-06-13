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

// Drop a real image (favicon.ico) into the virtual fs at /home/user1, so the
// explorer's home directory has a thumbnail-able file.
await page.evaluate(async () => {
  const fs = window.platform.host.getFS();
  const res = await fetch('/public/favicon.ico');
  const buf = await res.arrayBuffer();
  fs.writeFileSync('/home/user1/favicon.ico', Buffer.from(buf));
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

// Refresh listing by navigating to Home via the sidebar shortcut
await explorerFrame.locator('.nav-shortcuts >> text=Home').click({ force: true }).catch(async () => {
  await explorerFrame.getByRole('navigation').getByText('Home', { exact: true }).click({ force: true });
});
await page.waitForTimeout(1000);

const bg = await explorerFrame.evaluate(() => {
  const items = [...document.querySelectorAll('.file-item')];
  for (const item of items) {
    const nameEl = item.querySelector('.file-name');
    if (nameEl?.textContent?.includes('favicon.ico')) {
      const fileDiv = item.querySelector('.file');
      return getComputedStyle(fileDiv).backgroundImage;
    }
  }
  return null;
});
console.log('favicon.ico thumbnail backgroundImage:', bg);

await page.screenshot({ path: 'testing/screenshots/thumbnail.png' });
console.log('console/page errors:', errors);

await browser.close();
