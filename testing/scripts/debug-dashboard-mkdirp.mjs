import { chromium } from 'playwright';
const PORT = process.env.PORT || 8097;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}`);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);

  await page.evaluate(() => {
    window.platform.host.exec(window.platform, '/opt/apps/dashboard/main.js');
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.dashboard'))", window.platform);
  });
  let f = null;
  for (let attempt = 0; attempt < 6 && !f; attempt++) {
    await page.waitForTimeout(1000);
    for (const fr of page.frames()) { if (fr.url().includes('dashboard/dashboard.html')) { f = fr; break; } }
  }
  if (!f) { console.log('Frame not found'); await browser.close(); return; }

  // Wipe the whole .local dir to simulate a user/browser that never had it,
  // then call saveConfig() and confirm it recreates the nested dir itself.
  const result = await page.evaluate(() => {
    const fs = window.platform.host.getFS();
    function rmrf(p) {
      try {
        const st = fs.statSync(p);
        if (st.isDirectory()) { fs.readdirSync(p).forEach(n => rmrf(p + '/' + n)); fs.rmdirSync(p); }
        else fs.unlinkSync(p);
      } catch (_) {}
    }
    rmrf('/home/user1/.local');
    return { existsBefore: fs.existsSync('/home/user1/.local/share/dashboard') };
  });
  console.log('Before save, dir exists:', result.existsBefore);

  const afterSave = await f.evaluate(() => {
    try {
      saveConfig();
      const fs = window.platform.host.getFS();
      return { ok: true, content: fs.readFileSync('/home/user1/.local/share/dashboard/dashboard.json', 'utf8') };
    } catch (e) { return { ok: false, error: e.message }; }
  });
  console.log('After saveConfig() with no pre-existing dir:', JSON.stringify(afterSave));

  await browser.close();
})();
