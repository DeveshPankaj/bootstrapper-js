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

  console.log('=== Let heartbeat/cron units accumulate a few journal lines ===');
  await page.waitForTimeout(8000);

  console.log('=== Opening terminal ===');
  await page.evaluate(() => {
    window.platform.host.callCommand('ui.terminal');
  });
  await page.waitForTimeout(2500);

  let termFrame = null;
  for (const fr of page.frames()) {
    if (fr.url().includes('terminal/main.html') || fr.url().includes('xtermjs.html')) { termFrame = fr; break; }
  }
  console.log('Terminal frame found:', !!termFrame);
  if (!termFrame) {
    console.log('Frame urls:', page.frames().map(f => f.url()).filter(u => u && u !== 'about:blank'));
    await browser.close();
    process.exit(1);
  }

  const app = await termFrame.evaluate(() => !!window.__terminalApp);
  console.log('Terminal app ready:', app);

  const typeAndEnter = async (cmd) => {
    await termFrame.locator('textarea.xterm-helper-textarea').click({ force: true });
    await termFrame.locator('textarea.xterm-helper-textarea').type(cmd, { delay: 15 });
    await termFrame.locator('textarea.xterm-helper-textarea').press('Enter');
  };

  const dumpBuffer = async () => termFrame.evaluate(() => {
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

  const clear = async () => { await typeAndEnter('clear'); await page.waitForTimeout(400); };

  await page.waitForTimeout(1000);

  console.log('\n=== Test 1: bare `journalctl` (merged, last ~50) ===');
  await clear();
  await typeAndEnter('journalctl');
  await page.waitForTimeout(1200);
  let lines = await dumpBuffer();
  console.log(lines.filter(l => l.trim()).join('\n'));

  console.log('\n=== Test 2: `journalctl -u heartbeat` ===');
  await clear();
  await typeAndEnter('journalctl -u heartbeat');
  await page.waitForTimeout(1200);
  lines = await dumpBuffer();
  console.log(lines.filter(l => l.trim()).join('\n'));

  console.log('\n=== Test 3: `journalctl -n 5` ===');
  await clear();
  await typeAndEnter('journalctl -n 5');
  await page.waitForTimeout(1200);
  lines = await dumpBuffer();
  console.log(lines.filter(l => l.trim()).join('\n'));

  console.log('\n=== Test 4: `journalctl -u nonexistent-unit` ===');
  await clear();
  await typeAndEnter('journalctl -u nonexistent-unit');
  await page.waitForTimeout(1000);
  lines = await dumpBuffer();
  console.log(lines.filter(l => l.trim()).join('\n'));

  console.log('\n=== Test 5: `journalctl -f` (follow), then send a few keystrokes + q to exit) ===');
  await clear();
  await typeAndEnter('journalctl -f');
  await page.waitForTimeout(1500);
  // Send a couple of harmless keystrokes first (should be ignored by the
  // follow loop's onData handler, only 'q'/Ctrl+C stop it), then 'q'.
  await termFrame.locator('textarea.xterm-helper-textarea').press('x');
  await page.waitForTimeout(300);
  await termFrame.locator('textarea.xterm-helper-textarea').press('q');
  await page.waitForTimeout(1000);
  lines = await dumpBuffer();
  console.log(lines.filter(l => l.trim()).join('\n'));

  // Confirm the terminal is responsive again after follow mode exits (i.e. it
  // didn't hang) by running one more command and seeing a fresh prompt/output.
  await clear();
  await typeAndEnter('echo journalctl-follow-exited-cleanly');
  await page.waitForTimeout(800);
  lines = await dumpBuffer();
  console.log('\n=== Post-follow sanity check ===');
  console.log(lines.filter(l => l.trim()).join('\n'));

  console.log('\nPage errors:', errors.length ? errors : 'none');
  await browser.close();
})();
