import { chromium } from 'playwright';
const PORT = process.env.PORT || 8095;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  const consoleWarnings = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error' || msg.type() === 'warning') consoleWarnings.push(msg.text()); });
  await page.goto(`http://localhost:${PORT}`);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);

  console.log('=== Boot warnings/errors mentioning removed paths ===');
  const relevant = consoleWarnings.filter(w => /home\/user1\/apps|home\/user1\/tools|home\/user1\/quotes|imageviewer\.js|spotlight\.js not found|Command: \[explorer\] not found/i.test(w));
  console.log(JSON.stringify(relevant, null, 2));

  console.log('=== VFS: confirm /home/user1/apps, /tools, /quotes do not exist ===');
  const vfsCheck = await page.evaluate(() => {
    const fs = window.platform.host.getFS();
    return {
      appsExists: fs.existsSync('/home/user1/apps'),
      toolsExists: fs.existsSync('/home/user1/tools'),
      quotesExists: fs.existsSync('/home/user1/quotes'),
      projectsExists: fs.existsSync('/home/user1/projects'),
      explorerMainExists: fs.existsSync('/opt/apps/file-explorer/main.js'),
    };
  });
  console.log(JSON.stringify(vfsCheck, null, 2));

  console.log('=== Open the file explorer via the "explorer" command, confirm it renders ===');
  await page.evaluate(() => {
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('explorer'))", window.platform);
  });
  await page.waitForTimeout(1500);
  const explorerFrames = page.frames().filter(f => /file-explorer|about:blank/.test(f.url()));
  let explorerOk = false;
  for (const fr of page.frames()) {
    try {
      const count = await fr.locator('text=Home').count();
      if (count > 0) { explorerOk = true; break; }
    } catch (_) {}
  }
  console.log('Explorer window shows a "Home" sidebar item:', explorerOk);

  console.log('=== Open the terminal via ui.terminal ===');
  await page.evaluate(() => {
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.terminal'))", window.platform);
  });
  await page.waitForTimeout(2000);
  let terminalFrame = null;
  for (const fr of page.frames()) { if (fr.url().includes('terminal/main.html')) { terminalFrame = fr; break; } }
  console.log('Terminal frame found:', !!terminalFrame);
  if (terminalFrame) {
    const termCheck = await terminalFrame.evaluate(() => !!window.__terminalApp);
    console.log('__terminalApp exposed:', termCheck);
  }

  console.log('=== Load app-drawer + image-viewer (both CORE_APPS referencing former home/user1/apps files) ===');
  const coreAppsCheck = await page.evaluate(async () => {
    const results = {};
    for (const cmd of ['ui.app-drawer', 'ui.imageviewer', 'ui.bookmarks', 'ui.dev-utils']) {
      results[cmd] = !!window.platform.host.getCommand(cmd);
    }
    return results;
  });
  console.log(JSON.stringify(coreAppsCheck, null, 2));

  console.log('All page errors:', errors.length ? errors : 'none');
  console.log('All console warnings:', JSON.stringify(consoleWarnings, null, 2));
  await browser.close();
})();
