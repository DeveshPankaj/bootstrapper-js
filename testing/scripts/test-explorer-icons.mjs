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

const iconCheck = await page.evaluate(() => {
  const fs = window.fs;
  const dir = '/usr/share/icons';
  return { exists: fs.existsSync(dir), files: fs.existsSync(dir) ? fs.readdirSync(dir) : [] };
});
console.log('icon dir:', JSON.stringify(iconCheck));

await page.evaluate(() => {
  window.platform.host.execCommand(`service('001-core.layout', 'open-window') (command('explorer'), '/home/user1')`, window.platform);
});
await page.waitForTimeout(1500);

let explorerFrame = null;
for (const frame of page.frames()) {
  if (await frame.locator('.file-item').count() > 0) { explorerFrame = frame; break; }
}
console.log('explorer frame found:', !!explorerFrame);

const itemCount = await explorerFrame.locator('.file-item').count();
console.log('file items:', itemCount);

await page.waitForTimeout(500);

const bgImages = await explorerFrame.locator('.file-item .file').evaluateAll(els =>
  els.slice(0, 8).map(el => getComputedStyle(el).backgroundImage)
);
console.log('background images:', JSON.stringify(bgImages, null, 2));

await page.screenshot({ path: 'testing/screenshots/explorer-icons.png' });
console.log('errors:', errors);

await browser.close();
