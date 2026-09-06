import { chromium } from 'playwright';

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 30 });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(5000);

  // Use canvas WM
  await page.evaluate(() => {
    const fs = window.platform?.host?.getFS?.();
    if (fs) fs.writeFileSync('/etc/managers.json', JSON.stringify({ windowManager: 'canvas', dock: 'default' }));
  });
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(5000);

  // Verify VFS has new manager.js
  const vfsCheck = await page.evaluate(() => {
    const fs = window.platform?.host?.getFS?.();
    if (!fs || !fs.existsSync('/opt/desktop/manager.js')) return 'missing';
    const src = fs.readFileSync('/opt/desktop/manager.js', 'utf-8');
    return {
      hasDragStart: src.includes('onDragStart'),
      hasDragOver: src.includes('onDragOver'),
      hasSaveOrder: src.includes('saveOrder'),
      hasOrderPath: src.includes('ORDER_PATH'),
    };
  });
  console.log('VFS manager.js check:', vfsCheck);

  // Check icons are present with draggable
  const icons = await page.evaluate(() => {
    const els = document.querySelectorAll('.vfs-desktop-icon');
    return Array.from(els).map(el => ({
      name: el.querySelector('.vfs-desktop-icon-label')?.textContent,
      draggable: el.getAttribute('draggable'),
      bb: el.getBoundingClientRect(),
    }));
  });
  console.log('\nDesktop icons:', icons.map(i => `${i.name} (draggable=${i.draggable})`));

  if (icons.length < 2) {
    console.log('Need at least 2 icons to test drag');
    await browser.close();
    return;
  }

  const [icon1, icon2] = icons;
  console.log(`\nDragging "${icon1.name}" onto "${icon2.name}"`);

  // Add drag event listeners
  await page.evaluate(() => {
    window._dragLog = [];
    document.addEventListener('dragstart', e => window._dragLog.push('dragstart:' + (e.target.className || '')), true);
    document.addEventListener('dragover',  e => window._dragLog.push('dragover:'  + (e.target.className || '')), true);
    document.addEventListener('drop',      e => window._dragLog.push('drop:'      + (e.target.className || '')), true);
    document.addEventListener('dragend',   e => window._dragLog.push('dragend'),  true);
  });

  // Perform HTML5 drag using dispatchEvent
  const src = { x: icon1.bb.x + 36, y: icon1.bb.y + 36 };
  const dst = { x: icon2.bb.x + 36, y: icon2.bb.y + 36 };

  // Use Playwright's dragTo which dispatches proper HTML5 DnD events
  await page.locator('.vfs-desktop-icon').first().dragTo(page.locator('.vfs-desktop-icon').nth(1), { force: true });
  await sleep(800);

  const dragLog = await page.evaluate(() => window._dragLog || []);
  console.log('\nDrag events:', dragLog.slice(0, 15));

  const iconsAfter = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.vfs-desktop-icon-label')).map(el => el.textContent)
  );
  console.log('\nOrder before:', icons.map(i => i.name));
  console.log('Order after: ', iconsAfter);

  const reordered = JSON.stringify(icons.map(i => i.name)) !== JSON.stringify(iconsAfter);
  console.log(`\nReorder worked: ${reordered ? '✅' : '❌'}`);

  const dragStartFired = dragLog.some(e => e.startsWith('dragstart'));
  const dropFired = dragLog.some(e => e.startsWith('drop'));
  console.log(`dragstart fired: ${dragStartFired ? '✅' : '❌'}`);
  console.log(`drop fired: ${dropFired ? '✅' : '❌'}`);

  // Check persisted order
  const savedOrder = await page.evaluate(() => {
    const fs = window.platform?.host?.getFS?.();
    const path = '/home/user1/.desktop-order.json';
    if (!fs || !fs.existsSync(path)) return 'not saved';
    return fs.readFileSync(path, 'utf-8');
  });
  console.log('\nPersisted order:', savedOrder);

  console.log('\n=== DONE ===');
  await sleep(4000);
  await browser.close();
})();
