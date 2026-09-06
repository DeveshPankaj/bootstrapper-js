import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('testing/screenshots', { recursive: true });

const browser = await chromium.launch({ headless: false, args: ['--window-size=1400,900'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

const errors = [];
page.on('console', m => {
  if (m.type() === 'error') {
    errors.push(m.text());
    console.log('[err]', m.text().substring(0, 150));
  }
});

await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);

// Right-click desktop to open context menu
await page.mouse.click(700, 450, { button: 'right' });
await page.waitForTimeout(800);
await page.screenshot({ path: 'testing/screenshots/ctx-open.png' });

// Click Explorer
await page.getByText('Explorer').first().click({ force: true }).catch(e => console.log('click err:', e.message));
await page.waitForTimeout(3000);

await page.screenshot({ path: 'testing/screenshots/after-explorer.png' });

// Check for ReferenceError about doc
const docErrors = errors.filter(e => e.includes('doc is not defined') || e.includes('ReferenceError'));
console.log('doc ReferenceErrors:', docErrors.length);

// Check dock for the window
const dockFrame = await page.$('#vfs-dock-iframe');
if (dockFrame) {
  const frame = await dockFrame.contentFrame();
  if (frame) {
    const items = await frame.$$('.win-icon');
    console.log('Dock items:', items.length);
    const html = await frame.$eval('#dock', el => el.innerHTML).catch(() => '');
    console.log('Dock HTML:', html.substring(0, 200));
  }
}

// Open terminal too
await page.mouse.click(700, 450, { button: 'right' });
await page.waitForTimeout(600);
await page.getByText('Terminal').first().click({ force: true }).catch(() => {});
await page.waitForTimeout(2500);

await page.screenshot({ path: 'testing/screenshots/two-windows.png' });
console.log('Total errors:', errors.length);

await browser.close();
