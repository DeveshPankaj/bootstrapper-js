import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  console.log('=== Set plasma-waves.js as canvas wallpaper ===');
  const r1 = await page.evaluate(() => {
    try {
      window.platform.host.callCommand('set-wallpaper', 'canvas:/home/user1/wallpapers/plasma-waves.js');
      return 'ok';
    } catch (e) { return 'ERR: ' + e.message; }
  });
  console.log('callCommand result:', r1);
  await page.waitForTimeout(1500);

  const mount1 = await page.evaluate(() => {
    var ifr = document.getElementById('canvas-wallpaper-iframe');
    if (!ifr) return { mounted: false };
    var doc = ifr.contentDocument; // sandbox="allow-scripts" only (no allow-same-origin) blocks this from the top page too, expect null
    return { mounted: true, hasSrcdoc: !!ifr.srcdoc, styleZ: ifr.style.zIndex, pointerEvents: ifr.style.pointerEvents };
  });
  console.log('Mount check (plasma):', JSON.stringify(mount1));

  console.log('=== Switch to particles-interactive.js and check mouse forwarding ===');
  await page.evaluate(() => {
    window.platform.host.callCommand('set-wallpaper', 'canvas:/home/user1/wallpapers/particles-interactive.js');
  });
  await page.waitForTimeout(1000);
  // Move the mouse over the desktop and confirm the layout's mousemove handler exists / doesn't throw
  await page.mouse.move(400, 300);
  await page.mouse.move(420, 320);
  await page.waitForTimeout(300);
  const mount2 = await page.evaluate(() => !!document.getElementById('canvas-wallpaper-iframe'));
  console.log('Mounted after switch to particles:', mount2);

  console.log('=== Switch to slowmo-orbs.js ===');
  await page.evaluate(() => {
    window.platform.host.callCommand('set-wallpaper', 'canvas:/home/user1/wallpapers/slowmo-orbs.js');
  });
  await page.waitForTimeout(1000);
  const mount3 = await page.evaluate(() => !!document.getElementById('canvas-wallpaper-iframe'));
  console.log('Mounted after switch to slowmo-orbs:', mount3);

  console.log('=== Switch back to a normal image wallpaper — canvas iframe should unmount ===');
  await page.evaluate(() => {
    window.platform.host.callCommand('set-wallpaper', '/public/wp-11.jpg');
  });
  await page.waitForTimeout(500);
  const unmounted = await page.evaluate(() => !document.getElementById('canvas-wallpaper-iframe'));
  console.log('Canvas iframe correctly removed:', unmounted);

  console.log('=== Bad path handling — should not crash ===');
  const badPath = await page.evaluate(() => {
    try {
      window.platform.host.callCommand('set-wallpaper', 'canvas:/does/not/exist.js');
      return 'ok';
    } catch (e) { return 'ERR: ' + e.message; }
  });
  console.log('Bad path call result:', badPath);
  await page.waitForTimeout(300);
  const noMountOnBadPath = await page.evaluate(() => !document.getElementById('canvas-wallpaper-iframe'));
  console.log('No iframe mounted for bad path:', noMountOnBadPath);

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
