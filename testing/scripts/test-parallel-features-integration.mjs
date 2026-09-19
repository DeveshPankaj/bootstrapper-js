import { chromium } from 'playwright';

const PORT = process.env.PORT || 8085;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto(`http://localhost:${PORT}`);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);

  console.log('=== Boot sanity: no page errors after boot ===');
  console.log('Errors so far:', errors.length ? errors : 'none');

  console.log('=== 1. Notification bell widget present ===');
  await page.waitForSelector('.widget-notifications', { timeout: 15000 }).catch(() => {});
  const bellPresent = await page.evaluate(() => !!document.querySelector('.widget-notifications'));
  console.log('Bell widget found:', bellPresent);

  console.log('=== 2. Default dock renders ===');
  // The dock iframe is sandboxed WITHOUT allow-same-origin, so
  // ifr.contentDocument is null from inside the page's own JS
  // (page.evaluate) - Playwright's page.frames() API isn't bound by that
  // same-origin restriction, so use it instead (matches
  // testing/scripts/test-dock-sidebar-minimal.mjs's working approach).
  await page.waitForSelector('#vfs-dock-iframe', { timeout: 15000 }).catch(() => {});
  const dockIframeHandle = await page.$('#vfs-dock-iframe');
  const dockFrame = dockIframeHandle ? await dockIframeHandle.contentFrame() : null;
  if (dockFrame) await dockFrame.waitForSelector('.item', { timeout: 5000 }).catch(() => {});
  const dockItemCount = dockFrame ? await dockFrame.$$eval('.item', els => els.length).catch(() => -1) : -1;
  console.log('Default dock item count:', dockItemCount);

  console.log('=== 3. journalctl works in terminal ===');
  await page.evaluate(() => window.platform.host.callCommand('ui.terminal'));
  await page.waitForTimeout(2000);
  let termFrame = null;
  for (const fr of page.frames()) { if (fr.url().includes('terminal/main.html')) { termFrame = fr; break; } }
  if (termFrame) {
    await termFrame.locator('textarea.xterm-helper-textarea').click({ force: true });
    await termFrame.locator('textarea.xterm-helper-textarea').type('journalctl -n 3', { delay: 15 });
    await termFrame.locator('textarea.xterm-helper-textarea').press('Enter');
    await page.waitForTimeout(800);
    const lines = await termFrame.evaluate(() => {
      const app = window.__terminalApp;
      const session = app.sessions.find(s => s.tabEl.classList.contains('active')) || app.sessions[0];
      const buf = session.terminal.buffer.active;
      const out = [];
      for (let i = 0; i < buf.length; i++) { const l = buf.getLine(i); if (l) out.push(l.translateToString(true)); }
      return out;
    });
    console.log('journalctl output tail:', lines.filter(l => l.trim()).slice(-4));
  } else {
    console.log('Terminal frame not found');
  }

  console.log('=== 4. TS-IDE Diff button present ===');
  await page.evaluate(() => {
    window.platform.host.exec(window.platform, '/opt/apps/ts-ide/main.js');
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.ts-ide'))", window.platform);
  });
  await page.waitForTimeout(2500);
  let ideFrame = null;
  for (const fr of page.frames()) { if (fr.url().includes('ts-ide/main.html')) { ideFrame = fr; break; } }
  if (ideFrame) {
    const hasDiffBtn = await ideFrame.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Diff'));
    console.log('TS-IDE has Diff button:', hasDiffBtn);
  } else {
    console.log('TS-IDE frame not found');
  }

  console.log('=== 5. Package Manager opens without error ===');
  const winsBefore = await page.evaluate(() => window.platform.host.callCommand('process.list').length);
  await page.evaluate(() => {
    window.platform.host.exec(window.platform, '/opt/apps/pkg-manager/main.js');
  });
  await page.waitForTimeout(1000);
  const pkgOpenResult = await page.evaluate(() => {
    try {
      window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.pkg-manager'))", window.platform);
      return 'ok';
    } catch (e) { return 'ERROR: ' + e.message; }
  });
  console.log('Package manager open attempt:', pkgOpenResult);
  await page.waitForTimeout(1500);
  const winsAfter = await page.evaluate(() => window.platform.host.callCommand('process.list').map(w => w.title));
  console.log('Windows before/after:', winsBefore, '->', JSON.stringify(winsAfter));

  console.log('=== Final: total page errors across whole run ===');
  console.log(errors.length ? errors : 'none');

  await page.screenshot({ path: 'testing/screenshots/final-integration-check.png' });
  await browser.close();
})();
