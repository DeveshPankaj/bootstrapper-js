import { chromium } from 'playwright';

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  console.log('Loading app...');
  await page.goto('http://localhost:8080');
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);

  // Switch to Canvas WM via Settings
  console.log('Switching to Canvas WM...');
  // Look for settings in the dock or desktop
  // Try right-clicking desktop to find settings
  await page.mouse.click(700, 400, { button: 'right' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-pankajdevesh-Desktop-Gitea-Workspaces-bootstrapper-js/c0cedca3-4725-445d-be45-549cc7b04f40/scratchpad/01-initial.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // Use IPC to switch WM to canvas directly
  const switched = await page.evaluate(async () => {
    // Write canvas config to /etc/managers.json via the VFS
    try {
      const fs = window.__vfs || (window.platform && window.platform.host && window.platform.host.getFS && window.platform.host.getFS());
      if (fs) {
        fs.writeFileSync('/etc/managers.json', JSON.stringify({ windowManager: 'canvas', dock: 'default' }));
        return 'written via vfs';
      }
      return 'no fs';
    } catch(e) {
      return 'error: ' + e.message;
    }
  });
  console.log('WM switch result:', switched);

  // Reload to apply canvas WM
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-pankajdevesh-Desktop-Gitea-Workspaces-bootstrapper-js/c0cedca3-4725-445d-be45-549cc7b04f40/scratchpad/02-canvas-wm.png' });

  // Find layout iframe
  const getLayoutFrame = async () => {
    for (const frame of page.frames()) {
      try {
        const count = await frame.locator('.layout-default').count();
        if (count > 0) return frame;
      } catch {}
    }
    return null;
  };

  const layoutFrame = await getLayoutFrame();
  if (!layoutFrame) {
    console.log('No layout frame found, trying direct page');
  }

  // Open Files app by double-clicking a desktop icon
  console.log('Opening Files app...');
  // Click on Files icon in dock
  const dockFrames = page.frames().filter(f => f.url() === 'about:blank');

  // Try to find the dock iframe with Files button
  let clicked = false;
  for (const frame of page.frames()) {
    try {
      const filesBtn = frame.locator('.item').filter({ hasText: /files/i }).first();
      const cnt = await filesBtn.count();
      if (cnt > 0) {
        await filesBtn.click({ force: true });
        clicked = true;
        console.log('Clicked Files in dock');
        break;
      }
    } catch {}
  }

  if (!clicked) {
    // Double click a desktop icon
    await page.mouse.dblclick(80, 80, { force: true });
    console.log('Double clicked desktop area');
  }

  await page.waitForTimeout(3000);
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-pankajdevesh-Desktop-Gitea-Workspaces-bootstrapper-js/c0cedca3-4725-445d-be45-549cc7b04f40/scratchpad/03-files-open.png' });

  // Find the window header to drag
  console.log('Looking for window header...');
  let header = null;
  for (const frame of page.frames()) {
    try {
      const h = frame.locator('.window-header').first();
      if (await h.count() > 0) {
        header = h;
        console.log('Found window-header in frame:', frame.url());
        break;
      }
    } catch {}
  }

  if (!header) {
    // Try the main page
    header = page.locator('.window-header').first();
    console.log('Using main page window-header, count:', await header.count());
  }

  if (await header.count() === 0) {
    console.log('No window header found!');
    await page.screenshot({ path: '/private/tmp/claude-501/-Users-pankajdevesh-Desktop-Gitea-Workspaces-bootstrapper-js/c0cedca3-4725-445d-be45-549cc7b04f40/scratchpad/04-no-header.png' });
    await browser.close();
    return;
  }

  // Get the scroll position BEFORE drag
  const getScrollPos = async () => {
    return await page.evaluate(() => {
      const ca = document.querySelector('.content-area');
      return ca ? { top: ca.scrollTop, left: ca.scrollLeft } : { top: -1, left: -1 };
    });
  };

  const scrollBefore = await getScrollPos();
  console.log('Scroll before mousedown:', scrollBefore);

  // Get header bounding box
  const box = await header.boundingBox();
  console.log('Header box:', box);

  if (box) {
    const headerCenterX = box.x + box.width / 2;
    const headerCenterY = box.y + box.height / 2;

    // Simulate mousedown on header
    console.log('Pressing mouse on header...');
    await page.mouse.move(headerCenterX, headerCenterY);
    await page.mouse.down();
    await page.waitForTimeout(500);

    const scrollAfterDown = await getScrollPos();
    console.log('Scroll after mousedown:', scrollAfterDown);

    const scrollChanged = Math.abs(scrollAfterDown.top - scrollBefore.top) > 5 ||
                          Math.abs(scrollAfterDown.left - scrollBefore.left) > 5;
    console.log('SCROLL CHANGED ON MOUSEDOWN:', scrollChanged, '(BUG if true)');

    await page.screenshot({ path: '/private/tmp/claude-501/-Users-pankajdevesh-Desktop-Gitea-Workspaces-bootstrapper-js/c0cedca3-4725-445d-be45-549cc7b04f40/scratchpad/05-after-mousedown.png' });

    // Now try dragging
    await page.mouse.move(headerCenterX, headerCenterY + 100, { steps: 10 });
    await page.waitForTimeout(300);
    await page.mouse.up();

    const scrollAfterDrag = await getScrollPos();
    console.log('Scroll after drag down:', scrollAfterDrag);
    await page.screenshot({ path: '/private/tmp/claude-501/-Users-pankajdevesh-Desktop-Gitea-Workspaces-bootstrapper-js/c0cedca3-4725-445d-be45-549cc7b04f40/scratchpad/06-after-drag.png' });

    // Now manually scroll down
    console.log('Scrolling canvas down...');
    await page.evaluate(() => {
      const ca = document.querySelector('.content-area');
      if (ca) ca.scrollTop = 500;
    });
    await page.waitForTimeout(500);

    const scrollManual = await getScrollPos();
    console.log('After manual scroll:', scrollManual);

    // Now click the header again
    const box2 = await header.boundingBox();
    console.log('Header box after scroll:', box2);
    if (box2) {
      await page.mouse.move(box2.x + box2.width/2, box2.y + box2.height/2);
      await page.mouse.down();
      await page.waitForTimeout(500);

      const scrollAfterClick = await getScrollPos();
      console.log('Scroll after clicking header again:', scrollAfterClick);
      const scrollChangedAgain = Math.abs(scrollAfterClick.top - scrollManual.top) > 10;
      console.log('SCROLL CHANGED ON 2ND CLICK:', scrollChangedAgain, '(BUG if true)');

      await page.mouse.up();
      await page.screenshot({ path: '/private/tmp/claude-501/-Users-pankajdevesh-Desktop-Gitea-Workspaces-bootstrapper-js/c0cedca3-4725-445d-be45-549cc7b04f40/scratchpad/07-after-2nd-click.png' });
    }
  }

  console.log('\n=== TEST COMPLETE ===');
  await sleep(2000);
  await browser.close();
})();
