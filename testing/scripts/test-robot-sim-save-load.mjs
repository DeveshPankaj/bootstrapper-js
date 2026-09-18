import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const dialogs = [];
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('dialog', async d => {
    dialogs.push({ type: d.type(), msg: d.message() });
    if (d.type() === 'prompt') await d.accept('test-creature');
    else await d.accept();
  });
  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  await page.evaluate(() => {
    window.platform.host.exec(window.platform, '/opt/apps/robot-sim/main.js');
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.robot-sim'))", window.platform);
  });
  await page.waitForTimeout(2000);

  let f = null;
  for (const fr of page.frames()) {
    if (fr.url().includes('robot-sim/main.html')) { f = fr; break; }
  }
  if (!f) { console.log('Frame not found'); await browser.close(); return; }
  await page.waitForTimeout(2000);

  await f.click('[data-robot="custom"]', { force: true });
  await page.waitForTimeout(300);
  await f.selectOption('#preset-sel', 'inchworm');
  await page.waitForTimeout(500);

  await f.click('button:has-text("💾 Save")', { force: true });
  await page.waitForTimeout(1000);

  // Verify the file landed in the VFS
  const vfsCheck = await page.evaluate(() => {
    const fs = window.platform.host.getFS();
    const path = '/home/user1/projects/creatures/test-creature.json';
    try {
      const exists = fs.existsSync(path);
      const content = exists ? fs.readFileSync(path, 'utf-8') : null;
      return { exists, content };
    } catch (e) { return { error: e.message }; }
  });
  console.log('VFS save check:', JSON.stringify(vfsCheck));

  // Clear then load it back
  await f.click('#btn-builder', { force: true });
  await page.waitForTimeout(300);
  await f.click('button:has-text("Clear")', { force: true });
  await page.waitForTimeout(300);
  let counts = await f.evaluate(() => document.getElementById('design-bones').textContent);
  console.log('Bones after clear:', counts);

  await f.click('button:has-text("📂 Load")', { force: true });
  await page.waitForTimeout(1000);
  counts = await f.evaluate(() => ({
    bones: document.getElementById('design-bones').textContent,
    joints: document.getElementById('design-joints').textContent,
    muscles: document.getElementById('design-muscles').textContent,
  }));
  console.log('Design after load:', JSON.stringify(counts));
  console.log('Dialogs seen:', JSON.stringify(dialogs));
  console.log('Page errors:', errors.length ? errors : 'none');

  await browser.close();
})();
