import { chromium } from 'playwright';

const WALLPAPERS = [
  'plasma-waves', 'particles-interactive', 'slowmo-orbs',
  'day-night-cycle', 'anime-peek', 'kitty-parallax',
  'parallax-mountains', 'minimal-drift',
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  console.log('=== Default preferences include all 8 canvas wallpapers ===');
  const defaults = await page.evaluate(() => {
    const fs = window.platform.host.getFS();
    const prefs = JSON.parse(fs.readFileSync('/user-preferences.json', 'utf-8'));
    return prefs.wallpapers.filter(w => w.startsWith('canvas:'));
  });
  console.log('Canvas wallpapers in default prefs:', defaults.length, JSON.stringify(defaults));

  console.log('=== Mount each wallpaper, confirm no errors ===');
  for (const name of WALLPAPERS) {
    const before = errors.length;
    await page.evaluate((n) => {
      window.platform.host.callCommand('set-wallpaper', `canvas:/usr/share/wallpapers/${n}.js`);
    }, name);
    await page.waitForTimeout(700);
    const mounted = await page.evaluate(() => !!document.getElementById('canvas-wallpaper-iframe'));
    console.log(`${name}: mounted=${mounted}, newErrors=${errors.length - before}`);
  }

  console.log('=== anime-peek: reacts to window count ===');
  await page.evaluate(() => {
    window.platform.host.callCommand('set-wallpaper', 'canvas:/usr/share/wallpapers/anime-peek.js');
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'testing/screenshots/anime-peek-empty-desktop.png' });

  // Open a window (Terminal) — the character should retreat.
  await page.evaluate(() => {
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.terminal'))", window.platform);
  });
  await page.waitForTimeout(2500); // let peek ease back out
  await page.screenshot({ path: 'testing/screenshots/anime-peek-window-open.png' });
  console.log('Screenshots saved for anime-peek before/after opening a window.');

  console.log('=== day-night-cycle renders without throwing ===');
  await page.evaluate(() => {
    window.platform.host.callCommand('set-wallpaper', 'canvas:/usr/share/wallpapers/day-night-cycle.js');
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'testing/screenshots/day-night-cycle.png' });

  console.log('=== kitty-parallax and parallax-mountains screenshots ===');
  await page.evaluate(() => {
    window.platform.host.callCommand('set-wallpaper', 'canvas:/usr/share/wallpapers/kitty-parallax.js');
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'testing/screenshots/kitty-parallax.png' });

  await page.evaluate(() => {
    window.platform.host.callCommand('set-wallpaper', 'canvas:/usr/share/wallpapers/parallax-mountains.js');
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'testing/screenshots/parallax-mountains.png' });

  await page.evaluate(() => {
    window.platform.host.callCommand('set-wallpaper', 'canvas:/usr/share/wallpapers/minimal-drift.js');
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'testing/screenshots/minimal-drift.png' });

  console.log('Page errors total:', errors.length ? errors : 'none');
  await browser.close();
})();
