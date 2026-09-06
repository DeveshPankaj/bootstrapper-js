import { chromium } from 'playwright';

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 30 });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(5000);

  // Switch to Canvas WM
  await page.evaluate(() => {
    const fs = window.platform?.host?.getFS?.();
    if (fs) fs.writeFileSync('/etc/managers.json', JSON.stringify({ windowManager: 'canvas', dock: 'default' }));
  });
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(6000);

  // Open a window via platform command
  const openResult = await page.evaluate(async () => {
    try {
      const cmds = window.platform?.host;
      if (!cmds) return 'no host';
      // List available commands
      const cmd = cmds.getCommand('ui.file-explorer') || cmds.getCommand('explorer') || cmds.getCommand('ui.notepad');
      if (!cmd) return 'no command found';
      // Create window
      const wm = window.__wosWmBridge;
      if (wm && wm.launch) {
        wm.launch(cmd.name);
        return 'launched ' + cmd.name;
      }
      return 'no wm bridge';
    } catch(e) { return 'err: ' + e.message; }
  });
  console.log('Open window:', openResult);
  await page.waitForTimeout(3000);

  // If no window, try clicking in the dock iframe
  const headerCount = await page.locator('.window-header').count();
  if (headerCount === 0) {
    console.log('No header via platform, trying dock iframes...');
    const iframes = page.frames();
    for (const f of iframes) {
      try {
        const items = await f.locator('.item').all();
        for (const item of items) {
          const box = await item.boundingBox().catch(() => null);
          if (!box) continue;
          const txt = await item.innerText().catch(() => '');
          console.log('  dock item:', txt.trim(), 'at', box.x, box.y);
        }
      } catch {}
    }

    // Click first dock item
    for (const f of iframes) {
      try {
        const first = f.locator('.item').first();
        if (await first.count() > 0) {
          await first.click({ force: true });
          console.log('Clicked first dock item');
          break;
        }
      } catch {}
    }
    await page.waitForTimeout(3000);
  }

  // Wait for scroll to settle
  let prev = -1;
  for (let i = 0; i < 30; i++) {
    const s = await page.evaluate(() => document.querySelector('.content-area')?.scrollTop ?? -1);
    if (Math.abs(s - prev) < 1 && i > 5) break;
    prev = s;
    await sleep(100);
  }
  console.log('Scroll settled at scrollTop:', prev);

  // Check headers in all frames
  let headerBox = null;
  for (const f of page.frames()) {
    try {
      const h = f.locator('.window-header').first();
      if (await h.count() > 0) {
        headerBox = await h.boundingBox();
        console.log('Found .window-header in', f.url().substring(0, 50), 'at', headerBox);
        break;
      }
    } catch {}
  }
  // Also check main page
  if (!headerBox) {
    const h = page.locator('.window-header').first();
    if (await h.count() > 0) {
      headerBox = await h.boundingBox();
      console.log('Found .window-header in main page at', headerBox);
    }
  }

  if (!headerBox) {
    console.log('Still no header found. Windows on page:');
    const wins = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.window')).map(w => ({
        class: w.className,
        style: w.getAttribute('style'),
        pid: w.dataset.pid,
      }));
    });
    console.log(wins);
    await browser.close();
    return;
  }

  // ─── TEST 1: Does mousedown on header change scrollTop? ───
  const scrollBefore = await page.evaluate(() => document.querySelector('.content-area')?.scrollTop ?? -1);
  console.log('\n--- TEST 1: mousedown on header ---');
  console.log('scrollTop before mousedown:', scrollBefore);

  await page.mouse.move(headerBox.x + headerBox.width / 2, headerBox.y + headerBox.height / 2);
  await page.mouse.down();

  const scrollSamples = [];
  for (let i = 0; i < 15; i++) {
    await sleep(100);
    scrollSamples.push(await page.evaluate(() => document.querySelector('.content-area')?.scrollTop ?? -1));
  }
  await page.mouse.up();

  const maxScrollChange = Math.max(...scrollSamples.map(s => Math.abs(s - scrollBefore)));
  console.log('scrollTop samples (100ms each):', scrollSamples.join(', '));
  console.log(`Max scroll change: ${maxScrollChange}px  →  ${maxScrollChange > 5 ? '❌ BUG - still scrolling on mousedown' : '✅ FIXED'}`);

  // ─── TEST 2: Drag the window ───
  console.log('\n--- TEST 2: drag header down 150px ---');
  const hcx = headerBox.x + headerBox.width / 2;
  const hcy = headerBox.y + headerBox.height / 2;

  const winPosBefore = await page.evaluate(() => {
    const w = document.querySelector('.window');
    return w ? { top: w.style.top, left: w.style.left } : null;
  });
  console.log('Window position before drag:', winPosBefore);

  await page.mouse.move(hcx, hcy);
  await page.mouse.down();
  await page.mouse.move(hcx, hcy + 150, { steps: 15 });
  await page.mouse.up();

  await sleep(200);
  const winPosAfter = await page.evaluate(() => {
    const w = document.querySelector('.window');
    return w ? { top: w.style.top, left: w.style.left } : null;
  });
  console.log('Window position after drag:', winPosAfter);

  const expectedTopApprox = (parseFloat(winPosBefore?.top) || 0) + 150;
  const actualTop = parseFloat(winPosAfter?.top) || 0;
  const dragError = Math.abs(actualTop - expectedTopApprox);
  console.log(`Expected top ~${expectedTopApprox}px, got ${actualTop}px (error: ${dragError}px)`);
  console.log(`Drag accuracy: ${dragError < 20 ? '✅ OK' : '❌ WRONG (drag jumped)'}`);

  // ─── TEST 3: Scroll canvas, click header, check scroll ───
  console.log('\n--- TEST 3: scroll canvas down, click header, check scroll ---');
  await page.evaluate(() => { const ca = document.querySelector('.content-area'); if (ca) ca.scrollTop = 500; });
  await sleep(300);
  const scrollAt500 = await page.evaluate(() => document.querySelector('.content-area')?.scrollTop ?? -1);
  console.log('Manually set scrollTop:', scrollAt500);

  const hbox3 = await page.locator('.window-header').first().boundingBox();
  if (hbox3 && hbox3.y > -100 && hbox3.y < 1000) {
    await page.mouse.move(hbox3.x + hbox3.width / 2, hbox3.y + hbox3.height / 2);
    await page.mouse.down();
    const samples3 = [];
    for (let i = 0; i < 15; i++) {
      await sleep(100);
      samples3.push(await page.evaluate(() => document.querySelector('.content-area')?.scrollTop ?? -1));
    }
    await page.mouse.up();
    const max3 = Math.max(...samples3.map(s => Math.abs(s - scrollAt500)));
    console.log('scrollTop samples after click:', samples3.join(', '));
    console.log(`Max change from 500: ${max3}px  →  ${max3 > 20 ? '❌ BUG - scrolled to ' + Math.min(...samples3) : '✅ FIXED'}`);
  } else {
    console.log('Header not in view after scroll (y=' + hbox3?.y + '), skipping test 3');
  }

  console.log('\n=== ALL TESTS DONE ===');
  await sleep(3000);
  await browser.close();
})();
