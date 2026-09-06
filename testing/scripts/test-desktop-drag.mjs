import { chromium } from 'playwright';

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 30 });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(5000);

  // Test with canvas WM
  await page.evaluate(() => {
    const fs = window.platform?.host?.getFS?.();
    if (fs) fs.writeFileSync('/etc/managers.json', JSON.stringify({ windowManager: 'canvas', dock: 'default' }));
  });
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(5000);

  // Check desktop icons exist
  const iconsInfo = await page.evaluate(() => {
    const icons = document.querySelectorAll('.desktop-item');
    const windowsEl = document.querySelector('.windows');
    const contentArea = document.querySelector('.content-area');
    return {
      iconCount: icons.length,
      iconsBB: Array.from(icons).slice(0, 3).map(i => ({
        name: i.querySelector('span')?.textContent,
        bb: i.getBoundingClientRect(),
        draggable: i.getAttribute('draggable'),
        style: i.getAttribute('style'),
      })),
      windowsPointerEvents: windowsEl ? getComputedStyle(windowsEl).pointerEvents : 'no .windows',
      windowsZIndex: windowsEl ? getComputedStyle(windowsEl).zIndex : 'n/a',
      contentAreaOverflow: contentArea ? getComputedStyle(contentArea).overflow : 'n/a',
      // What's at the center of the first icon?
      topElementAtIcon: (() => {
        const icons2 = document.querySelectorAll('.desktop-item');
        if (!icons2.length) return 'no icons';
        const bb = icons2[0].getBoundingClientRect();
        const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
        const el = document.elementFromPoint(cx, cy);
        return el ? { tag: el.tagName, class: el.className, id: el.id } : 'null';
      })(),
    };
  });
  console.log('\n=== Desktop icon info ===');
  console.log(JSON.stringify(iconsInfo, null, 2));

  if (iconsInfo.iconCount === 0) {
    console.log('No desktop icons found!');
    await browser.close();
    return;
  }

  // Get first two icons
  const firstIcon = page.locator('.desktop-item').first();
  const secondIcon = page.locator('.desktop-item').nth(1);

  const box1 = await firstIcon.boundingBox();
  const box2 = await secondIcon.boundingBox();
  console.log('\nFirst icon BB:', box1);
  console.log('Second icon BB:', box2);

  // Get names before drag
  const namesBefore = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.desktop-item span')).map(s => s.textContent)
  );
  console.log('\nOrder before drag:', namesBefore);

  if (!box1 || !box2) {
    console.log('Cannot get bounding boxes');
    await browser.close();
    return;
  }

  // Listen for dragstart/dragover/drop events
  await page.evaluate(() => {
    window._dragLog = [];
    document.addEventListener('dragstart', e => window._dragLog.push('dragstart: ' + (e.target?.className || '?')), true);
    document.addEventListener('dragover', e => window._dragLog.push('dragover: ' + (e.target?.className || '?')), true);
    document.addEventListener('drop', e => window._dragLog.push('drop: ' + (e.target?.className || '?')), true);
    document.addEventListener('dragend', e => window._dragLog.push('dragend'), true);
  });

  // Try HTML5 drag from first to second
  const src = { x: box1.x + box1.width / 2, y: box1.y + box1.height / 2 };
  const dst = { x: box2.x + box2.width / 2, y: box2.y + box2.height / 2 };
  console.log(`\nDragging from (${Math.round(src.x)},${Math.round(src.y)}) to (${Math.round(dst.x)},${Math.round(dst.y)})`);

  // Playwright drag
  await page.mouse.move(src.x, src.y);
  await sleep(100);
  await page.mouse.down();
  await sleep(100);
  // Move slowly to trigger drag
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(src.x + (dst.x - src.x) * i / steps, src.y + (dst.y - src.y) * i / steps);
    await sleep(30);
  }
  await sleep(200);
  await page.mouse.up();
  await sleep(500);

  const dragLog = await page.evaluate(() => window._dragLog || []);
  console.log('\nDrag event log:', dragLog.slice(0, 20));

  const namesAfter = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.desktop-item span')).map(s => s.textContent)
  );
  console.log('\nOrder after drag:', namesAfter);
  const changed = JSON.stringify(namesBefore) !== JSON.stringify(namesAfter);
  console.log(`Order changed: ${changed ? '✅ drag works' : '❌ drag did not reorder'}`);

  // Also check if there's a drag-over visual indicator during drag
  const dragOverVisible = dragLog.some(e => e.startsWith('dragover'));
  console.log(`dragover events fired: ${dragOverVisible ? '✅' : '❌'}`);
  const dragStartFired = dragLog.some(e => e.startsWith('dragstart'));
  console.log(`dragstart fired: ${dragStartFired ? '✅' : '❌'}`);

  console.log('\n=== DONE ===');
  await sleep(3000);
  await browser.close();
})();
