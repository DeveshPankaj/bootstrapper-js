import { chromium } from 'playwright';

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 30 });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  console.log('Loading app...');
  await page.goto('http://localhost:8080');
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);

  // Switch to Canvas WM
  await page.evaluate(() => {
    try {
      const frames = Array.from(document.querySelectorAll('iframe'));
      let fs;
      // Try to get fs from platform in main window
      if (window.platform && window.platform.host) {
        fs = window.platform.host.getFS();
      }
      if (fs) {
        fs.writeFileSync('/etc/managers.json', JSON.stringify({ windowManager: 'canvas', dock: 'default' }));
        return 'written';
      }
    } catch(e) { return 'err: ' + e; }
  });

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);

  // Read the actual canvas.js from VFS to verify our fix is present
  const canvasJsContent = await page.evaluate(() => {
    try {
      let fs;
      if (window.platform && window.platform.host) {
        fs = window.platform.host.getFS();
      }
      if (fs && fs.existsSync('/opt/wm/canvas.js')) {
        const content = fs.readFileSync('/opt/wm/canvas.js', 'utf-8');
        // Return just the setupWindow section
        const idx = content.indexOf('setupWindow');
        return content.substring(idx, idx + 800);
      }
      return 'no fs or file';
    } catch(e) { return 'err: ' + e; }
  });
  console.log('\n=== canvas.js setupWindow section from VFS ===');
  console.log(canvasJsContent);
  console.log('=== END ===\n');

  // Check where the content-area is
  const caInfo = await page.evaluate(() => {
    const ca = document.querySelector('.content-area');
    if (!ca) return 'no content-area';
    const rect = ca.getBoundingClientRect();
    return { rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }, scrollTop: ca.scrollTop };
  });
  console.log('Content-area info:', caInfo);

  // Open Files via dock click
  let opened = false;
  for (const frame of page.frames()) {
    try {
      const items = frame.locator('.item');
      const count = await items.count();
      for (let i = 0; i < count; i++) {
        const text = await items.nth(i).innerText().catch(() => '');
        if (/files|explorer/i.test(text)) {
          await items.nth(i).click({ force: true });
          opened = true;
          console.log('Clicked Files in dock');
          break;
        }
      }
      if (opened) break;
    } catch {}
  }

  if (!opened) {
    // Try clicking a desktop icon
    const desktopIcons = page.locator('.desktop-item, .file-item').first();
    if (await desktopIcons.count() > 0) {
      await desktopIcons.dblclick({ force: true });
      console.log('Double clicked desktop icon');
    }
  }

  await page.waitForTimeout(3000);

  // Check scroll position after window opens
  const scrollAfterOpen = await page.evaluate(() => {
    const ca = document.querySelector('.content-area');
    return ca ? { top: ca.scrollTop, left: ca.scrollLeft } : null;
  });
  console.log('Scroll after window open:', scrollAfterOpen);

  // Wait for smooth scroll to complete
  await page.waitForTimeout(1500);
  const scrollAfterWait = await page.evaluate(() => {
    const ca = document.querySelector('.content-area');
    return ca ? { top: ca.scrollTop, left: ca.scrollLeft } : null;
  });
  console.log('Scroll after waiting for smooth scroll:', scrollAfterWait);

  // Find header
  let headerBox = null;
  for (const frame of page.frames()) {
    try {
      const h = frame.locator('.window-header').first();
      if (await h.count() > 0) {
        headerBox = await h.boundingBox();
        console.log('Found header in frame:', frame.url(), headerBox);
        break;
      }
    } catch {}
  }

  if (!headerBox) {
    console.log('No header found!');
    await browser.close();
    return;
  }

  // Record scroll before mousedown
  const scrollBefore = await page.evaluate(() => {
    const ca = document.querySelector('.content-area');
    return ca ? { top: ca.scrollTop, left: ca.scrollLeft } : null;
  });
  console.log('Scroll BEFORE mousedown:', scrollBefore);

  // Now press mouse on header title area (middle of header)
  const hx = headerBox.x + headerBox.width / 2;
  const hy = headerBox.y + headerBox.height / 2;
  console.log(`Mouse down at (${hx}, ${hy})`);
  await page.mouse.move(hx, hy);
  await page.mouse.down();

  // Immediately check scroll
  const scrollImmediate = await page.evaluate(() => {
    const ca = document.querySelector('.content-area');
    return ca ? { top: ca.scrollTop, left: ca.scrollLeft } : null;
  });
  console.log('Scroll immediately after mousedown:', scrollImmediate);

  // Wait a bit (let smooth scrolls settle)
  await page.waitForTimeout(1000);
  const scrollAfterDown = await page.evaluate(() => {
    const ca = document.querySelector('.content-area');
    return ca ? { top: ca.scrollTop, left: ca.scrollLeft } : null;
  });
  console.log('Scroll 1s after mousedown:', scrollAfterDown);

  const bugPresent = Math.abs(scrollAfterDown.top - scrollBefore.top) > 5;
  console.log(`\nBUG PRESENT (scroll changed on mousedown): ${bugPresent}`);

  if (bugPresent) {
    // Diagnose: what's at the click position?
    const elemInfo = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el ? { tag: el.tagName, className: el.className, id: el.id } : 'nothing';
    }, { x: hx, y: hy });
    console.log('Element at click position:', elemInfo);
  }

  await page.mouse.up();

  console.log('\n=== TEST DONE ===');
  await sleep(2000);
  await browser.close();
})();
