import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
mkdirSync('testing/screenshots', { recursive: true });

async function testDock(dockId, screenshotName) {
  const browser = await chromium.launch({ headless: false, args: ['--window-size=1400,900'] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type()==='error') console.log(`[${dockId}][err]`, m.text().substring(0,100)); });

  await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);

  // Switch to this dock via settings managers.json update
  await page.evaluate(async (id) => {
    try { await window.platform?.host?.callCommand('open-vfs-dock', id); } catch(e) {}
  }, dockId);
  await page.waitForTimeout(2000);

  // Check launch items
  const items = await page.evaluate(() => window.__wosWmBridge?.getLaunchItems?.() ?? []);
  console.log(`[${dockId}] launch items:`, items.map(i => `${i.icon}(${i.name})`).join(', '));

  // Screenshot with no windows
  await page.screenshot({ path: `testing/screenshots/${screenshotName}-empty.png` });
  console.log(`Screenshot: ${screenshotName}-empty.png`);

  // Open Explorer via context menu
  await page.mouse.click(700, 450, { button: 'right' });
  await page.waitForTimeout(600);
  await page.getByText('Explorer').first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(2000);

  // Open Terminal too
  await page.mouse.click(700, 450, { button: 'right' });
  await page.waitForTimeout(600);
  await page.getByText('Terminal').first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(2500);

  await page.screenshot({ path: `testing/screenshots/${screenshotName}-with-windows.png` });
  console.log(`Screenshot: ${screenshotName}-with-windows.png`);

  // Check dock HTML
  const dockIframe = await page.$('#vfs-dock-iframe');
  if (dockIframe) {
    const frame = await dockIframe.contentFrame();
    if (frame) {
      const items = await frame.$$('.item');
      console.log(`[${dockId}] dock items visible:`, items.length);
    }
  }

  await browser.close();
}

await testDock('default', 'dock-default');
await testDock('macos', 'dock-macos');
console.log('Done.');
