import { chromium } from 'playwright';

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 30 });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(5000);

  // Set canvas WM
  await page.evaluate(() => {
    const fs = window.platform?.host?.getFS?.();
    if (fs) fs.writeFileSync('/etc/managers.json', JSON.stringify({ windowManager: 'canvas', dock: 'default' }));
  });
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(6000);

  // Verify bridge is accessible from canvas.js context
  const bridgeCheck = await page.evaluate(() => {
    try {
      const fs = window.platform?.host?.getFS?.();
      if (!fs || !fs.existsSync('/opt/wm/canvas.js')) return 'no canvas.js';
      const src = fs.readFileSync('/opt/wm/canvas.js', 'utf-8');
      // Check if bridge override exists and uses platform.window
      const hasBridgeOverride = src.includes('_canvasTogglePatch');
      const usesPlatformWindow = src.includes('platform.window.__wosWmBridge') || src.includes('window.__wosWmBridge');
      return { hasBridgeOverride, usesPlatformWindow };
    } catch(e) { return 'err: ' + e; }
  });
  console.log('canvas.js bridge check:', bridgeCheck);

  // Check if bridge override actually runs (window.__wosWmBridge accessible?)
  const bridgeTest = await page.evaluate(() => {
    // window.__wosWmBridge is on the layout iframe's window
    // canvas.js runs via execString with window = {platform, document, top}
    // platform.window IS the layout iframe's window
    const b = window.__wosWmBridge;
    return {
      bridgeExists: !!b,
      isPatched: !!b?._canvasTogglePatch,
      hasMethods: b ? Object.keys(b).join(',') : 'none',
    };
  });
  console.log('Bridge state:', bridgeTest);

  // Open file explorer
  await page.evaluate(() => {
    window.__wosWmBridge?.launch?.('ui.file-explorer');
  });
  await page.waitForTimeout(2000);

  // Wait for scroll to settle
  for (let i = 0; i < 20; i++) {
    await sleep(150);
    const s = await page.evaluate(() => document.querySelector('.content-area')?.scrollTop ?? 0);
    if (s === await page.evaluate(() => document.querySelector('.content-area')?.scrollTop ?? 0)) break;
  }

  const state1 = await page.evaluate(() => {
    const ca = document.querySelector('.content-area');
    const win = document.querySelector('.window');
    const header = document.querySelector('.window-header');
    const winsBB = document.querySelector('.windows')?.getBoundingClientRect();
    return {
      scrollTop: ca?.scrollTop,
      scrollLeft: ca?.scrollLeft,
      caHeight: ca?.clientHeight,
      caWidth: ca?.clientWidth,
      winStyle: { top: win?.style.top, left: win?.style.left, width: win?.style.width, height: win?.style.height },
      winOffsetTop: win?.offsetTop,
      winOffsetHeight: win?.offsetHeight,
      winBB: win?.getBoundingClientRect(),
      headerBB: header?.getBoundingClientRect(),
      windowsBB: winsBB,
    };
  });
  console.log('\n=== State after opening window ===');
  console.log(JSON.stringify(state1, null, 2));

  // Scroll canvas down so window goes off-screen
  console.log('\n--- Scrolling canvas down 800px ---');
  await page.evaluate(() => {
    const ca = document.querySelector('.content-area');
    if (ca) ca.scrollTop = 800;
  });
  await sleep(500);

  const state2 = await page.evaluate(() => {
    const ca = document.querySelector('.content-area');
    const win = document.querySelector('.window');
    const header = document.querySelector('.window-header');
    return {
      scrollTop: ca?.scrollTop,
      winBB: win?.getBoundingClientRect(),
      headerBB: header?.getBoundingClientRect(),
      winInView: (() => {
        const h = header?.getBoundingClientRect();
        return h ? (h.top >= 0 && h.bottom <= (ca?.clientHeight || 900)) : false;
      })(),
    };
  });
  console.log('After scrolling down 800px:', state2);

  // Find dock and click the file explorer icon
  console.log('\n--- Clicking dock icon to focus window ---');
  let dockClicked = false;
  for (const frame of page.frames()) {
    try {
      const items = await frame.locator('.item').all();
      for (const item of items) {
        const txt = await item.innerText().catch(() => '');
        if (/files|explorer/i.test(txt)) {
          await item.click({ force: true });
          dockClicked = true;
          console.log('Clicked Files in dock');
          break;
        }
      }
      if (dockClicked) break;
    } catch {}
  }

  if (!dockClicked) {
    // Try ipc.call directly
    await page.evaluate(async () => {
      // Get the window pid
      const wins = window.__wosWmBridge?.getWindows?.() || [];
      const win = wins[0];
      if (win) window.__wosWmBridge?.toggleWindow?.(win.pid);
    });
    console.log('Triggered toggleWindow via bridge');
  }

  // Wait for scroll to settle
  await sleep(2000);
  const scrollSamples = [];
  for (let i = 0; i < 10; i++) {
    scrollSamples.push(await page.evaluate(() => document.querySelector('.content-area')?.scrollTop ?? 0));
    await sleep(100);
  }
  console.log('Scroll samples after dock click:', scrollSamples.join(', '));

  const state3 = await page.evaluate(() => {
    const ca = document.querySelector('.content-area');
    const win = document.querySelector('.window');
    const header = document.querySelector('.window-header');
    return {
      scrollTop: ca?.scrollTop,
      winBB: win?.getBoundingClientRect(),
      headerBB: header?.getBoundingClientRect(),
      winVisible: !win?.classList.contains('minimized'),
    };
  });
  console.log('\nAfter dock click (should be centered):');
  console.log(JSON.stringify(state3, null, 2));

  const caHeight = state1.caHeight || 900;
  const headerBB = state3.headerBB;
  if (headerBB) {
    const centerY = caHeight / 2;
    const headerCenterY = (headerBB.top + headerBB.bottom) / 2;
    console.log(`\nViewport center Y: ${centerY}`);
    console.log(`Window center Y in viewport: ${(state3.winBB?.top + state3.winBB?.bottom) / 2}`);
    console.log(`Window fully in view: ${state3.winBB?.top >= 0 && state3.winBB?.bottom <= caHeight}`);
    console.log(`Header in view: ${headerBB.top >= 0 && headerBB.bottom <= caHeight}`);
  }

  console.log('\n=== DONE ===');
  await sleep(3000);
  await browser.close();
})();
