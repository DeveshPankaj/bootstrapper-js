import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('testing/screenshots', { recursive: true });

const browser = await chromium.launch({ headless: false, args: ['--window-size=1400,900'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

page.on('console', msg => {
  if (msg.type() === 'error') console.log('[err]', msg.text().substring(0, 100));
});

await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);

// Right-click on the desktop background (middle of screen, avoid icons)
await page.mouse.click(700, 500, { button: 'right' });
await page.waitForTimeout(1000);

await page.screenshot({ path: 'testing/screenshots/contextmenu.png' });
console.log('Screenshot saved: contextmenu.png');

// Check what appeared
const menuVisible = await page.evaluate(() => {
  const el = document.querySelector('.contextmenu, [class*="context-menu"]');
  if (!el) return 'not found';
  return window.getComputedStyle(el).display;
});
console.log('Context menu element display:', menuVisible);

const menuItems = await page.$$eval(
  '.contextmenu-item, [class*="menu-item"], .context-menu li',
  els => els.map(el => el.textContent?.trim())
).catch(() => []);
console.log('Menu items text:', menuItems);

await browser.close();
