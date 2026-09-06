import { chromium } from 'playwright';

(async () => {
  const b = await chromium.launch({ headless: false, slowMo: 30 });
  const p = await b.newPage();
  await p.setViewportSize({ width: 1400, height: 900 });
  await p.goto('http://localhost:8080');
  await p.waitForTimeout(3000);
  await p.reload({ waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(5000);

  // Check AppSDK injection in VFS file
  const vfsCheck = await p.evaluate(() => {
    const fs = window.platform?.host?.getFS?.();
    if (!fs) return 'no fs';
    try {
      const html = fs.readFileSync('/opt/apps/model-builder/main.html', 'utf-8');
      return { hasShim: html.includes('window.AppSDK'), lines: html.split('\n').length };
    } catch(e) { return 'read error: ' + e.message; }
  });
  console.log('VFS main.html check:', JSON.stringify(vfsCheck));

  // Check command registered
  const cmdCheck = await p.evaluate(() => {
    try {
      const cmd = window.platform?.host?.getCommand?.('ui.model-builder');
      return cmd ? 'FOUND: ' + (cmd.title || cmd.name) : 'NOT FOUND';
    } catch(e) { return 'error: ' + e.message; }
  });
  console.log('ui.model-builder command:', cmdCheck);

  // Check trainboard command
  const tbCmd = await p.evaluate(() => {
    try {
      const cmd = window.platform?.host?.getCommand?.('ui.trainboard');
      return cmd ? 'FOUND: ' + (cmd.title || cmd.name) : 'NOT FOUND';
    } catch(e) { return 'error: ' + e.message; }
  });
  console.log('ui.trainboard command:', tbCmd);

  // Try opening model-builder
  await p.evaluate(() => {
    window.platform?.host?.execCommand?.(
      "service('001-core.layout','open-window')(command('ui.model-builder'))",
      window.platform
    );
  });
  await p.waitForTimeout(3000);
  await p.screenshot({ path: 'testing/screenshots/model-builder-open.png' });
  console.log('Screenshot taken: model-builder-open.png');

  // Check for errors in console
  const errors = [];
  p.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await p.waitForTimeout(2000);
  console.log('Console errors:', errors.slice(0, 5));

  await b.close();
})();
