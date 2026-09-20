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

  console.log('=== Click "New" toolbar button, modal should show with Blank + 8 starters ===');
  await f.click('button:has-text("New")', { force: true });
  await page.waitForTimeout(200);
  const modalState = await f.evaluate(() => {
    const overlay = document.getElementById('newproj-overlay');
    const items = [...document.querySelectorAll('#newproj-body .newproj-item .nm')].map(n => n.textContent);
    return { visible: overlay.classList.contains('show'), items };
  });
  console.log(JSON.stringify(modalState, null, 2));

  console.log('=== Click a starter item (GLSL Shader), modal should close and starter should load ===');
  await f.click('.newproj-item:has-text("GLSL Shader")', { force: true });
  await page.waitForTimeout(500);
  const afterPick = await f.evaluate(() => ({
    modalVisible: document.getElementById('newproj-overlay').classList.contains('show'),
    filesKeys: Object.keys(files),
  }));
  console.log(JSON.stringify(afterPick, null, 2));

  console.log('=== Reopen modal, pick "Blank File…", confirm prompt path still works ===');
  await f.click('button:has-text("New")', { force: true });
  await page.waitForTimeout(200);
  page.once('dialog', d => d.accept('scratch.ts'));
  await f.click('.newproj-item:has-text("Blank File")', { force: true });
  await page.waitForTimeout(300);
  const afterBlank = await f.evaluate(() => ({
    modalVisible: document.getElementById('newproj-overlay').classList.contains('show'),
    filesKeys: Object.keys(files),
    activeFile,
  }));
  console.log(JSON.stringify(afterBlank, null, 2));

  console.log('=== Close via X button ===');
  await f.click('button:has-text("New")', { force: true });
  await page.waitForTimeout(200);
  await f.click('.newproj-panel .diff-close', { force: true });
  await page.waitForTimeout(200);
  const afterClose = await f.evaluate(() => document.getElementById('newproj-overlay').classList.contains('show'));
  console.log('Modal closed via X:', !afterClose);

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
