import { chromium } from 'playwright';

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  console.log('Loading app...');
  await page.goto('http://localhost:8080');
  await page.waitForTimeout(3000);
  // Only reload once, with longer timeout
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(5000);

  // Switch to Canvas WM by writing to VFS
  const result = await page.evaluate(() => {
    try {
      // Try main window platform
      for (const key of ['platform']) {
        if (window[key] && window[key].host && window[key].host.getFS) {
          const fs = window[key].host.getFS();
          fs.writeFileSync('/etc/managers.json', JSON.stringify({ windowManager: 'canvas', dock: 'default' }));
          return 'ok via ' + key;
        }
      }
      return 'no platform found';
    } catch(e) { return 'err: ' + e.message; }
  });
  console.log('Switch WM:', result);

  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(5000);

  // Check what canvas.js is loaded (verify fix is present)
  const canvasCheck = await page.evaluate(() => {
    try {
      const fs = window.platform && window.platform.host && window.platform.host.getFS();
      if (!fs || !fs.existsSync('/opt/wm/canvas.js')) return 'no canvas.js';
      const src = fs.readFileSync('/opt/wm/canvas.js', 'utf-8');
      // Check if the fix is present
      const hasOldBug = src.includes('scrollToWindow(container, windowsEl)') &&
                        !src.includes('No scrollToWindow here');
      const hasNewFix = src.includes('No scrollToWindow here') ||
                        src.includes('moveOnTop()') && !src.includes('scrollToWindow(container');
      return { hasOldBug, hasNewFix, snippet: src.substring(src.indexOf('mousedown'), src.indexOf('mousedown') + 200) };
    } catch(e) { return 'err: ' + e.message; }
  });
  console.log('\n=== canvas.js mousedown check ===');
  console.log(JSON.stringify(canvasCheck, null, 2));

  // Get content-area details
  const caInfo = await page.evaluate(() => {
    const ca = document.querySelector('.content-area');
    if (!ca) return 'no .content-area';
    const r = ca.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height, scrollTop: ca.scrollTop, scrollLeft: ca.scrollLeft };
  });
  console.log('\nContent-area:', caInfo);

  // Open a window - click dock Files button
  let opened = false;
  for (const frame of page.frames()) {
    try {
      const cnt = await frame.locator('.item').count();
      for (let i = 0; i < cnt; i++) {
        const txt = await frame.locator('.item').nth(i).innerText().catch(() => '');
        if (/files|explorer/i.test(txt)) {
          await frame.locator('.item').nth(i).click({ force: true });
          opened = true;
          console.log('\nClicked Files in dock');
          break;
        }
      }
      if (opened) break;
    } catch {}
  }

  if (!opened) {
    // Try desktop double-click
    const icon = page.locator('.desktop-item, [class*="file"]').first();
    if (await icon.count() > 0) {
      await icon.dblclick({ force: true });
      console.log('\nDbl-clicked desktop icon');
    } else {
      console.log('\nNo way to open window found');
    }
  }

  await page.waitForTimeout(2000);

  // Wait for smooth scroll to finish (up to 2 seconds)
  let lastScroll = -1;
  for (let i = 0; i < 20; i++) {
    const s = await page.evaluate(() => {
      const ca = document.querySelector('.content-area');
      return ca ? ca.scrollTop : -1;
    });
    if (s === lastScroll) break;
    lastScroll = s;
    await sleep(100);
  }
  console.log('Scroll settled at:', lastScroll);

  // Find header
  let headerFrame = null, headerLoc = null;
  for (const frame of page.frames()) {
    try {
      const h = frame.locator('.window-header');
      if (await h.count() > 0) {
        headerLoc = h.first();
        headerFrame = frame;
        break;
      }
    } catch {}
  }
  if (!headerLoc) { console.log('No header!'); await browser.close(); return; }

  const box = await headerLoc.boundingBox();
  console.log('\nHeader bounding box:', box);

  // Record scroll before mousedown
  const scrollBefore = await page.evaluate(() => {
    const ca = document.querySelector('.content-area');
    return ca ? ca.scrollTop : -1;
  });
  console.log('scrollTop BEFORE mousedown:', scrollBefore);

  // Press mouse on middle of header
  const mx = box.x + box.width / 2;
  const my = box.y + box.height / 2;
  await page.mouse.move(mx, my);
  await page.mouse.down();

  // Poll scroll for 1 second
  const scrollSamples = [];
  for (let i = 0; i < 10; i++) {
    await sleep(100);
    const s = await page.evaluate(() => {
      const ca = document.querySelector('.content-area');
      return ca ? ca.scrollTop : -1;
    });
    scrollSamples.push(s);
  }
  await page.mouse.up();

  console.log('scrollTop samples after mousedown:', scrollSamples);
  const maxChange = Math.max(...scrollSamples.map(s => Math.abs(s - scrollBefore)));
  console.log(`\nMax scroll change after mousedown: ${maxChange}px`);
  console.log(`BUG: ${maxChange > 5 ? 'YES - scroll still changes on mousedown' : 'NO - fixed!'}`);

  // Test 2: scroll canvas down manually, click header again
  await page.evaluate(() => {
    const ca = document.querySelector('.content-area');
    if (ca) ca.scrollTop = 500;
  });
  await sleep(300);

  const scrollManual = await page.evaluate(() => document.querySelector('.content-area')?.scrollTop ?? -1);
  console.log('\nAfter manual scroll to 500:', scrollManual);

  // Header may have moved - get new position
  const box2 = await headerLoc.boundingBox();
  console.log('Header box after scroll:', box2);

  if (box2 && box2.y > 0 && box2.y < 900) {
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
    await page.mouse.down();
    const scrollSamples2 = [];
    for (let i = 0; i < 10; i++) {
      await sleep(100);
      const s = await page.evaluate(() => document.querySelector('.content-area')?.scrollTop ?? -1);
      scrollSamples2.push(s);
    }
    await page.mouse.up();
    console.log('scrollTop samples after 2nd click:', scrollSamples2);
    const maxChange2 = Math.max(...scrollSamples2.map(s => Math.abs(s - 500)));
    console.log(`Max scroll change after 2nd click: ${maxChange2}px`);
    console.log(`BUG 2: ${maxChange2 > 10 ? 'YES - scrolls to top on click' : 'NO - fixed!'}`);
  } else {
    console.log('Header not visible after manual scroll (y=' + (box2?.y) + ') - skipping test 2');
  }

  console.log('\n=== DONE ===');
  await sleep(3000);
  await browser.close();
})();
