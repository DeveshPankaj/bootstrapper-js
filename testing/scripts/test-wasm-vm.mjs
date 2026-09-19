import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import path from 'path';

const SCRATCHPAD = '/private/tmp/claude-501/-Users-pankajdevesh-Desktop-Gitea-Workspaces-bootstrapper-js/c0cedca3-4725-445d-be45-549cc7b04f40/scratchpad';
const SCREENSHOTS = '/Users/pankajdevesh/Desktop/Gitea-Workspaces/bootstrapper-js/testing/screenshots';

const browser = await chromium.launch({
  headless: false,
  slowMo: 100,
  args: [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();

// Collect console errors
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('requestfailed', r => errors.push(`REQFAIL: ${r.url()} — ${r.failure()?.errorText}`));

console.log('Navigating to app…');
await page.goto('http://localhost:8080');
await page.waitForTimeout(3000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// Screenshot of main desktop
await page.screenshot({ path: `${SCREENSHOTS}/wasm-vm-01-desktop.png`, fullPage: false });
console.log('Screenshot 1: desktop');

// Find and click the WASM VM app — it may need to be installed first via registry
// Let's open it by navigating directly to the main.html file
// Serve directly as a static file — no SW needed for the app HTML itself
const appUrl = 'http://localhost:8080/public/mount/opt/apps/alpine-wasm/main.html';
const appPage = await ctx.newPage();
const appErrors = [];
appPage.on('console', m => {
  if (m.type() !== 'debug') console.log(`[APP ${m.type()}]`, m.text().slice(0, 300));
  if (m.type() === 'error') appErrors.push(m.text());
});
appPage.on('requestfailed', r => {
  console.log(`[APP REQFAIL]`, r.url(), r.failure()?.errorText);
  appErrors.push(`REQFAIL: ${r.url()}`);
});

console.log('Opening app directly…');
await appPage.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
await appPage.waitForTimeout(3000);

// Screenshot of initial load (Linux mode)
await appPage.screenshot({ path: `${SCREENSHOTS}/wasm-vm-02-linux-mode.png` });
console.log('Screenshot 2: Linux mode initial');

// Check mode buttons exist
const modeBtns = await appPage.locator('#mode-btns .mode-btn').count();
console.log('Mode buttons:', modeBtns);

const linuxBtnActive = await appPage.locator('.mode-btn.active').textContent();
console.log('Active mode:', linuxBtnActive.trim());

// Check tabs
const tabs = await appPage.locator('.tab').allTextContents();
console.log('Tabs:', tabs.map(t => t.trim()).join(', '));

// Wait for images to fetch + boot
console.log('Waiting 30s for Linux to boot…');
await appPage.waitForTimeout(30000);
await appPage.screenshot({ path: `${SCREENSHOTS}/wasm-vm-03-linux-boot.png` });
console.log('Screenshot 3: Linux 30s into boot');

// Check status
const statusText = await appPage.locator('#status-text').textContent();
console.log('Status:', statusText);

// Click KolibriOS mode
console.log('\nSwitching to KolibriOS mode…');
await appPage.bringToFront();
await appPage.locator('.mode-btn[data-mode="kolibri"]').click();
await appPage.waitForTimeout(2000);

// Screenshot: KolibriOS loading
await appPage.screenshot({ path: `${SCREENSHOTS}/wasm-vm-04-kolibri-loading.png` });
console.log('Screenshot 4: KolibriOS fetching');

// Check VGA wrap is visible, IPC tab is hidden
const vgaVisible = await appPage.locator('#vga-wrap').isVisible();
const ipcTabHidden = await appPage.locator('#tab-ipc').isHidden();
console.log('VGA wrap visible:', vgaVisible);
console.log('IPC tab hidden:', ipcTabHidden);

// Quick check 10s in
await appPage.waitForTimeout(10000);
const earlyState = await appPage.evaluate(() => ({
  statusText: document.getElementById('status-text')?.textContent,
  canvasSize: (() => { const c = document.querySelector('#screen_container canvas'); return c ? `${c.width}x${c.height}` : 'n/a'; })(),
  vgaLoadingVisible: document.getElementById('vga-loading')?.style.display !== 'none',
  dbgEmuExists: !!window.dbgEmu,
}));
console.log('Early KolibriOS state (10s):', JSON.stringify(earlyState));
await appPage.screenshot({ path: `${SCREENSHOTS}/wasm-vm-04b-kolibri-10s.png` });

// Wait for KolibriOS to fetch + boot
console.log('Waiting 35s more for KolibriOS to boot…');
await appPage.waitForTimeout(35000);
await appPage.screenshot({ path: `${SCREENSHOTS}/wasm-vm-05-kolibri-running.png` });
console.log('Screenshot 5: KolibriOS running');

// Check emulator state and canvas
const emuState = await appPage.evaluate(() => {
  const emu = window.dbgEmu;
  const canvas = document.querySelector('#screen_container canvas');
  const textDiv = document.querySelector('#screen_container div:first-child');

  const info = {
    emuExists: !!emu,
    emuRunning: emu ? (typeof emu.is_running === 'function' ? emu.is_running() : 'api-n/a') : 'no emu',
    canvasDisplay: canvas ? canvas.style.display || 'css:block' : 'no canvas',
    canvasSize: canvas ? `${canvas.width}x${canvas.height}` : 'n/a',
    textDivDisplay: textDiv ? textDiv.style.display || 'css' : 'no div',
    textDivLen: textDiv ? textDiv.textContent.length : 0,
    textDivContent: textDiv ? textDiv.textContent.slice(0, 500) : '',
  };

  // Check if canvas has pixels
  if (canvas && canvas.width > 0 && canvas.height > 0) {
    try {
      const ctx = canvas.getContext('2d');
      const d = ctx.getImageData(0, 0, Math.min(canvas.width, 100), Math.min(canvas.height, 100)).data;
      let nonBlack = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 10 || d[i+1] > 10 || d[i+2] > 10) nonBlack++;
      }
      info.canvasNonBlackPixels = nonBlack;
    } catch(e) { info.canvasPixelErr = e.message; }
  }

  return info;
});
console.log('Emulator state:', JSON.stringify(emuState, null, 2));

const statusKolibri = await appPage.locator('#status-text').textContent();
console.log('Status (KolibriOS):', statusKolibri);

// Check IPC tab is hidden in KolibriOS mode
const ipcHidden2 = await appPage.locator('#tab-ipc').isHidden();
console.log('IPC tab hidden in KolibriOS:', ipcHidden2);

// Switch back to Linux
console.log('\nSwitching back to Linux mode…');
await appPage.locator('.mode-btn[data-mode="linux"]').click();
await appPage.waitForTimeout(2000);
await appPage.screenshot({ path: `${SCREENSHOTS}/wasm-vm-06-linux-restart.png` });
console.log('Screenshot 6: Linux restarted');

const ipcTabVisible = await appPage.locator('#tab-ipc').isVisible();
console.log('IPC tab visible after back to Linux:', ipcTabVisible);

const consoleErrors = errors.filter(e => !e.includes('favicon'));
if (consoleErrors.length > 0) {
  console.log('\nConsole errors:\n', consoleErrors.slice(0,5).join('\n'));
} else {
  console.log('\nNo unexpected console errors.');
}

console.log('\nKeeping browser open 10s…');
await appPage.waitForTimeout(10000);

await browser.close();
console.log('Done.');
