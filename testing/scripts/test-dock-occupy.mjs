import { chromium } from 'playwright';

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 30 });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(4000);

  // Use macOS dock (full-width, 80px height) to test the overlap issue
  await page.evaluate(() => {
    const fs = window.platform?.host?.getFS?.();
    if (fs) fs.writeFileSync('/etc/managers.json', JSON.stringify({
      windowManager: 'default', dockManager: 'macos', occupyBottom: true
    }));
  });
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(5000);

  const state1 = await page.evaluate(() => {
    const body = document.body
    const layoutEl = document.querySelector('.layout-default')
    const dockIframe = document.getElementById('vfs-dock-iframe')
    const contentArea = document.querySelector('.content-area')
    const dockH = getComputedStyle(document.documentElement).getPropertyValue('--vfs-dock-height').trim()
    const layoutPB = getComputedStyle(layoutEl || document.body).paddingBottom
    return {
      hasOccupyClass: body.classList.contains('vfs-dock-occupy'),
      hasDockActive: body.classList.contains('vfs-dock-active'),
      dockIframeH: dockIframe?.style.height,
      cssVar: dockH,
      layoutPaddingBottom: layoutPB,
      contentAreaBottom: contentArea?.getBoundingClientRect().bottom,
      viewportH: window.innerHeight,
    }
  });
  console.log('\n=== macOS dock with occupyBottom: true ===');
  console.log(JSON.stringify(state1, null, 2));

  const expectedBottom = 900 - 80; // viewport - dock height
  const actualBottom = state1.contentAreaBottom;
  const overlap1 = actualBottom > expectedBottom + 5;
  console.log(`Content area bottom: ${Math.round(actualBottom)}px (expected ≤ ${expectedBottom}px)`);
  console.log(`Windows overlap dock: ${overlap1 ? '❌ BUG' : '✅ FIXED'}`);

  // Open settings and check toggle is present
  await page.evaluate(() => window.__wosWmBridge?.launch?.('ui.settings'));
  await page.waitForTimeout(3000);

  console.log('\n=== Now test disabling occupyBottom ===');
  await page.evaluate(() => {
    window.platform?.host?.callCommand?.('set-dock-occupy', false)
  });
  await sleep(500);

  const state2 = await page.evaluate(() => ({
    hasOccupyClass: document.body.classList.contains('vfs-dock-occupy'),
    layoutPaddingBottom: getComputedStyle(document.querySelector('.layout-default') || document.body).paddingBottom,
    contentAreaBottom: document.querySelector('.content-area')?.getBoundingClientRect().bottom,
  }));
  console.log('After set-dock-occupy(false):', JSON.stringify(state2));
  console.log(`Occupy class removed: ${!state2.hasOccupyClass ? '✅' : '❌'}`);
  console.log(`Padding zero: ${state2.layoutPaddingBottom === '0px' ? '✅' : '❌ (got ' + state2.layoutPaddingBottom + ')'}`);

  // Re-enable
  await page.evaluate(() => window.platform?.host?.callCommand?.('set-dock-occupy', true));
  await sleep(500);
  const state3 = await page.evaluate(() => ({
    hasOccupyClass: document.body.classList.contains('vfs-dock-occupy'),
    contentAreaBottom: document.querySelector('.content-area')?.getBoundingClientRect().bottom,
  }));
  console.log('After re-enable:', JSON.stringify(state3));
  console.log(`Occupy class back: ${state3.hasOccupyClass ? '✅' : '❌'}`);

  console.log('\n=== DONE ===');
  await sleep(4000);
  await browser.close();
})();
