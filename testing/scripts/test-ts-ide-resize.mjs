import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  await page.evaluate(() => {
    window.platform.host.exec(window.platform, '/opt/apps/ts-ide/main.js');
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.ts-ide'))", window.platform);
  });
  await page.waitForTimeout(2000);

  let f = null;
  for (const fr of page.frames()) {
    if (fr.url().includes('ts-ide/main.html')) { f = fr; break; }
  }
  if (!f) { console.log('Frame not found'); await browser.close(); return; }
  await page.waitForTimeout(2000);

  const before = await f.evaluate(() => ({
    sidebar: document.getElementById('sidebar').getBoundingClientRect().width,
    rightPanel: document.getElementById('right-panel').getBoundingClientRect().width,
  }));
  console.log('Before resize:', JSON.stringify(before));

  // Drag the left resizer (sidebar | editor) to the right by 60px
  const leftResizer = f.locator('#resizer-left');
  const leftBox = await leftResizer.boundingBox();
  await page.mouse.move(leftBox.x + 2, leftBox.y + leftBox.height/2);
  await page.mouse.down();
  await page.mouse.move(leftBox.x + 62, leftBox.y + leftBox.height/2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);

  // Drag the right resizer (editor | preview) to the left by 80px (grows right panel)
  const rightResizer = f.locator('#resizer-right');
  const rightBox = await rightResizer.boundingBox();
  await page.mouse.move(rightBox.x + 2, rightBox.y + rightBox.height/2);
  await page.mouse.down();
  await page.mouse.move(rightBox.x - 78, rightBox.y + rightBox.height/2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);

  const after = await f.evaluate(() => ({
    sidebar: document.getElementById('sidebar').getBoundingClientRect().width,
    rightPanel: document.getElementById('right-panel').getBoundingClientRect().width,
  }));
  console.log('After resize:', JSON.stringify(after));
  console.log('Sidebar grew by ~60px:', Math.abs((after.sidebar - before.sidebar) - 60) < 5);
  console.log('Right panel grew by ~80px:', Math.abs((after.rightPanel - before.rightPanel) - 80) < 5);

  // Test clamping: drag sidebar resizer far left (should clamp to min 120)
  const leftBox2 = await leftResizer.boundingBox();
  await page.mouse.move(leftBox2.x + 2, leftBox2.y + leftBox2.height/2);
  await page.mouse.down();
  await page.mouse.move(leftBox2.x - 500, leftBox2.y + leftBox2.height/2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  const clamped = await f.evaluate(() => document.getElementById('sidebar').getBoundingClientRect().width);
  console.log('Sidebar clamped to min (120):', clamped);

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
