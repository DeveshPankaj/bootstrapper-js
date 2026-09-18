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

  const typeAndEnter = async (cmd) => {
    await f.locator('textarea.xterm-helper-textarea').click({ force: true });
    await f.locator('textarea.xterm-helper-textarea').type(cmd, { delay: 15 });
    await f.locator('textarea.xterm-helper-textarea').press('Enter');
  };

  await typeAndEnter('cd /tmp');
  await page.waitForTimeout(400);
  await typeAndEnter('echo hello-from-tmp');
  await page.waitForTimeout(400);
  await typeAndEnter('history');
  await page.waitForTimeout(500);

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
  console.log('--- terminal output ---');
  console.log(lines.filter(l => l.trim()).join('\n'));

  const fsCheck = await page.evaluate(() => {
    const fs = window.platform.host.getFS();
    return {
      homeHistoryExists: fs.existsSync('/home/user1/.bash_history'),
      tmpHistoryExists: fs.existsSync('/tmp/.bash_history'),
      homeHistoryContent: fs.existsSync('/home/user1/.bash_history') ? fs.readFileSync('/home/user1/.bash_history', 'utf8') : null,
    };
  });
  console.log('--- fs check ---');
  console.log(JSON.stringify(fsCheck, null, 2));

  await browser.close();
})();
