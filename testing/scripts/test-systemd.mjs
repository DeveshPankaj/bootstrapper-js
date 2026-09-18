import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  console.log('=== Test 1: heartbeat.service autostarts (enabled by default) ===');
  const bootStatus = await page.evaluate(() => window.platform.host.callCommand('systemd.list'));
  console.log(JSON.stringify(bootStatus, null, 2));

  console.log('=== Test 2: wait for heartbeat ticks to accumulate in the journal ===');
  await page.waitForTimeout(12000);
  const journal = await page.evaluate(() => window.platform.host.callCommand('systemd.journal', 'heartbeat', 10));
  console.log(JSON.stringify(journal, null, 2));

  console.log('=== Test 3: systemctl.run via terminal ===');
  await page.evaluate(() => {
    window.platform.host.callCommand('ui.terminal');
  });
  await page.waitForTimeout(2500);

  let termFrame = null;
  for (const fr of page.frames()) {
    if (fr.url().includes('terminal/main.html') || fr.url().includes('xtermjs.html')) { termFrame = fr; break; }
  }
  console.log('Terminal frame found:', !!termFrame);
  if (!termFrame) console.log('Frame urls:', page.frames().map(f => f.url()).filter(u => u && u !== 'about:blank'));

  if (termFrame) {
    await page.waitForTimeout(500);
    const app = await termFrame.evaluate(() => !!window.__terminalApp);
    console.log('Terminal app ready:', app);

    // Type the command directly into xterm via its textarea, like a user would.
    const typeAndEnter = async (cmd) => {
      await termFrame.locator('textarea.xterm-helper-textarea').click({ force: true });
      await termFrame.locator('textarea.xterm-helper-textarea').type(cmd, { delay: 15 });
      await termFrame.locator('textarea.xterm-helper-textarea').press('Enter');
    };

    await page.waitForTimeout(1000);
    await typeAndEnter('systemctl list-units');
    await page.waitForTimeout(800);
    await typeAndEnter('systemctl status heartbeat');
    await page.waitForTimeout(800);
    await typeAndEnter('systemctl enable disk-usage-logger');
    await page.waitForTimeout(800);
    await typeAndEnter('systemctl start disk-usage-logger');
    await page.waitForTimeout(1500);
    await typeAndEnter('systemctl status disk-usage-logger');
    await page.waitForTimeout(800);
    await typeAndEnter('systemctl stop heartbeat');
    await page.waitForTimeout(800);

    const lines = await termFrame.evaluate(() => {
      const app = window.__terminalApp;
      const session = app.sessions.find(s => s.tabEl.classList.contains('active')) || app.sessions[0];
      const buf = session.terminal.buffer.active;
      const out = [];
      for (let i = 0; i < buf.length; i++) {
        const line = buf.getLine(i);
        if (line) out.push(line.translateToString(true));
      }
      return out;
    });
    console.log('--- terminal buffer ---');
    console.log(lines.filter(l => l.trim()).join('\n'));
  }

  console.log('=== Test 4: confirm heartbeat stopped, no more journal growth ===');
  const statusAfterStop = await page.evaluate(() => window.platform.host.callCommand('systemd.status', 'heartbeat'));
  console.log(JSON.stringify(statusAfterStop, null, 2));

  console.log('=== Test 5: Settings > Services page renders ===');
  await page.evaluate(() => {
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.settings'), '22-services')", window.platform);
  });
  await page.waitForTimeout(2000);
  let settingsFrame = null;
  for (const fr of page.frames()) {
    if (fr.url().includes('settings/main.html')) { settingsFrame = fr; break; }
  }
  console.log('Settings frame found:', !!settingsFrame);
  if (settingsFrame) {
    const activeNav = await settingsFrame.evaluate(() => {
      const el = document.querySelector('.settings-nav-item.active');
      return el ? el.textContent.trim() : null;
    });
    console.log('Active nav item:', activeNav);
    const rows = await settingsFrame.evaluate(() => document.querySelectorAll('.settings-row').length);
    console.log('Service rows rendered:', rows);
  }

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
