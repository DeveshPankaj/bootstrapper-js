import { chromium } from 'playwright';
const PORT = process.env.PORT || 8097;

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

  console.log('=== VFS: new config path exists (seeded by meta.json), old path does not ===');
  const seedCheck = await page.evaluate(() => {
    const fs = window.platform.host.getFS();
    return {
      newPathExists: fs.existsSync('/home/user1/.local/share/dashboard/dashboard.json'),
      newPathContent: fs.existsSync('/home/user1/.local/share/dashboard/dashboard.json') ? fs.readFileSync('/home/user1/.local/share/dashboard/dashboard.json', 'utf8') : null,
      oldPathExists: fs.existsSync('/home/user1/dashboard.json'),
    };
  });
  console.log(JSON.stringify(seedCheck, null, 2));

  console.log('=== Load dashboard app + open window ===');
  await page.evaluate(() => {
    window.platform.host.exec(window.platform, '/opt/apps/dashboard/main.js');
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.dashboard'))", window.platform);
  });
  await page.waitForTimeout(2000);

  let f = null;
  for (let attempt = 0; attempt < 6 && !f; attempt++) {
    await page.waitForTimeout(1000);
    for (const fr of page.frames()) { if (fr.url().includes('dashboard/dashboard.html')) { f = fr; break; } }
  }
  console.log('Dashboard frame found:', !!f);
  if (!f) { console.log('Page errors:', errors); await browser.close(); return; }

  console.log('=== Dashboard loaded state (should read defaults since seed was {groups:[]}) ===');
  const loadedState = await f.evaluate(() => ({ groupCount: state.groups.length, hasBookmarksTab: !!document.querySelector('[data-tab="bookmarks"], .tab') }));
  console.log(JSON.stringify(loadedState));

  console.log('=== Trigger a save via saveConfig() directly, confirm it lands at the new vfs path ===');
  await f.evaluate(() => { state.groups.push({ id: 'test123', name: 'TestGroup', color: '#000', items: [] }); saveConfig(); });
  await page.waitForTimeout(300);
  const savedCheck = await page.evaluate(() => {
    const fs = window.platform.host.getFS();
    const content = fs.readFileSync('/home/user1/.local/share/dashboard/dashboard.json', 'utf8');
    return { content, oldPathStillAbsent: !fs.existsSync('/home/user1/dashboard.json') };
  });
  console.log(JSON.stringify(savedCheck, null, 2));

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
