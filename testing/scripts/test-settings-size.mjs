import { chromium } from 'playwright';

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 30 });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(4000);

  // Switch to canvas WM
  await page.evaluate(() => {
    const fs = window.platform?.host?.getFS?.();
    if (fs) fs.writeFileSync('/etc/managers.json', JSON.stringify({ windowManager: 'canvas', dock: 'default' }));
  });
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(5000);

  // Check what settings file VFS has
  const settingsCheck = await page.evaluate(() => {
    const fs = window.platform?.host?.getFS?.();
    if (!fs) return 'no fs';
    const paths = ['/opt/apps/settings/main.html', '/home/user1/settings.html'];
    const results = {};
    for (const p of paths) {
      if (fs.existsSync(p)) {
        const src = fs.readFileSync(p, 'utf-8');
        const hasOldPercentage = src.includes("width: '70%'") || src.includes("width:'70%'");
        const hasNewFixed = src.includes('Math.min(860');
        results[p] = { hasOldPercentage, hasNewFixed };
      } else {
        results[p] = 'missing';
      }
    }
    return results;
  });
  console.log('Settings file check:', JSON.stringify(settingsCheck, null, 2));

  // Open settings via bridge
  await page.evaluate(() => {
    window.__wosWmBridge?.launch?.('ui.settings');
  });
  await page.waitForTimeout(3000);

  // Check window size
  const winState = await page.evaluate(() => {
    const ca = document.querySelector('.content-area');
    const wins = document.querySelectorAll('.window');
    return Array.from(wins).map(w => ({
      name: w.getAttribute('data-name'),
      style: { left: w.style.left, top: w.style.top, width: w.style.width, height: w.style.height },
      bb: w.getBoundingClientRect(),
    }));
  });
  console.log('\nWindows after opening settings:');
  winState.forEach(w => {
    console.log(`  [${w.name}] style=${JSON.stringify(w.style)} bb=${JSON.stringify({x: Math.round(w.bb.x), y: Math.round(w.bb.y), w: Math.round(w.bb.width), h: Math.round(w.bb.height)})}`);
  });

  const settingsWin = winState.find(w => w.name === 'ui.settings');
  if (settingsWin) {
    const bb = settingsWin.bb;
    console.log(`\nSettings window: ${Math.round(bb.width)}x${Math.round(bb.height)} at (${Math.round(bb.x)}, ${Math.round(bb.y)})`);
    const vw = 1400, vh = 900;
    const ok = bb.width <= 900 && bb.height <= 620 && bb.x >= 0 && bb.y >= 0 && bb.x + bb.width <= vw && bb.y + bb.height <= vh;
    console.log(`Size ok (≤900x620, fully on screen): ${ok ? '✅' : '❌'}`);
  } else {
    console.log('Settings window not found');
  }

  await sleep(3000);
  await browser.close();
})();
