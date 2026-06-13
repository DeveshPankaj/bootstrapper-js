import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', err => errors.push(err.message));

await page.goto('http://localhost:8080');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// Check that /etc/wm/current.json was seeded from themes/default.json on startup
const seeded = await page.evaluate(() => {
  const fs = window.platform.host.getFS();
  return {
    current: fs.existsSync('/etc/wm/current.json') ? fs.readFileSync('/etc/wm/current.json', 'utf-8') : null,
    themes: fs.existsSync('/etc/wm/themes') ? fs.readdirSync('/etc/wm/themes') : null,
  };
});
console.log('seeded current.json:', seeded.current);
console.log('themes dir:', seeded.themes);

// Open settings.html via desktop icon
const settingsIcon = page.locator('.desktop-icons .file-item, .desktop-icons div').filter({ hasText: 'settings.html' }).first();
await settingsIcon.dblclick({ force: true });
await page.waitForTimeout(1500);

const findFrame = async (text) => {
  for (const f of page.frames()) {
    try {
      const c = await f.locator(`text=${text}`).count();
      if (c > 0) return f;
    } catch (e) {}
  }
  return null;
}

let frame = await findFrame('Window Manager');
console.log('found settings frame:', !!frame);

const navLink = frame.locator('a', { hasText: 'Window Manager' });
await navLink.click({ force: true });
await page.waitForTimeout(500);

frame = await findFrame('Themes');
console.log('found window-manager page frame:', !!frame);
await page.screenshot({ path: 'testing/screenshots/wm-themes-page.png' });

console.log('theme names:', await frame.locator('h3 ~ div strong').allTextContents());

// Click the "Ocean" theme
const oceanCard = frame.locator('div').filter({ hasText: /^Ocean/ }).first();
console.log('ocean card count:', await oceanCard.count());
await oceanCard.click({ force: true });
await page.waitForTimeout(500);
await page.screenshot({ path: 'testing/screenshots/wm-theme-ocean.png' });

// Verify current.json now matches the ocean theme and CSS vars updated
const result = await page.evaluate(() => {
  const fs = window.platform.host.getFS();
  const cs = getComputedStyle(document.documentElement);
  return {
    current: JSON.parse(fs.readFileSync('/etc/wm/current.json', 'utf-8')),
    headerBg: cs.getPropertyValue('--wm-header-bg'),
    accent: cs.getPropertyValue('--wm-accent'),
  };
});
console.log('current.json after selecting Ocean:', result.current);
console.log('css vars:', result.headerBg, result.accent);

console.log('console errors:', errors);

await browser.close();
