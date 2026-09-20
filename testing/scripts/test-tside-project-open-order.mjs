import { chromium } from 'playwright';
const PORT = process.env.PORT || 8085;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto(`http://localhost:${PORT}`);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);

  await page.evaluate(() => {
    window.platform.host.exec(window.platform, '/opt/apps/ts-ide/main.js');
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.ts-ide'))", window.platform);
  });
  await page.waitForTimeout(2500);

  let f = null;
  for (const fr of page.frames()) { if (fr.url().includes('ts-ide/main.html')) { f = fr; break; } }
  if (!f) { console.log('Frame not found'); await browser.close(); return; }
  await page.waitForTimeout(3500);

  console.log('=== Simulate a project being open (bypass AppSDK, which never completes its handshake headlessly) ===');
  const simResult = await f.evaluate(async () => {
    projectDir = '/mnt/vfs-projects/my-test-project';
    activeFile = 'index.html';
    await refreshSidebar();
    return { projectDir, projectNameFn: typeof projectName === 'function' ? projectName() : 'n/a' };
  });
  console.log(JSON.stringify(simResult));

  console.log('=== Sidebar order when a project IS open (VSCode-style) ===');
  const order = await f.evaluate(() => {
    const nodes = [...document.getElementById('sb-content').children];
    return nodes.map(n => ({ cls: n.className, text: n.textContent.trim().slice(0, 40) }));
  });
  console.log(JSON.stringify(order, null, 2));

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
