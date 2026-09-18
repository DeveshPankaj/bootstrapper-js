import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
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

  const check = await f.evaluate(() => ({
    hasAppSDK: !!window.AppSDK,
    methods: window.AppSDK ? Object.keys(window.AppSDK) : null,
  }));
  console.log('AppSDK check:', JSON.stringify(check));

  // Try calling mkdir/writeText directly and see what happens
  const tryWrite = await f.evaluate(async () => {
    try {
      await sdk().mkdir('/home/user1/projects/creatures');
      await sdk().writeText('/home/user1/projects/creatures/debug.json', '{"test":1}');
      return 'ok';
    } catch (e) { return 'ERR: ' + e.message; }
  });
  console.log('tryWrite:', tryWrite);

  await browser.close();
})();
