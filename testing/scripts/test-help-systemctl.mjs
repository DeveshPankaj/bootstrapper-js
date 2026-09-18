import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  await page.evaluate(() => window.platform.host.callCommand('ui.terminal'));
  await page.waitForTimeout(2000);

  let f = null;
  for (const fr of page.frames()) {
    if (fr.url().includes('terminal/main.html')) { f = fr; break; }
  }
  if (!f) { console.log('terminal frame not found'); await browser.close(); return; }

  await f.locator('textarea.xterm-helper-textarea').click({ force: true });
  await f.locator('textarea.xterm-helper-textarea').type('help', { delay: 15 });
  await f.locator('textarea.xterm-helper-textarea').press('Enter');
  await page.waitForTimeout(800);

  const lines = await f.evaluate(() => {
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
  console.log(lines.filter(l => l.includes('systemctl')).join('\n') || 'NOT FOUND');

  await browser.close();
})();
