import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  console.log('=== Test 1: systemd.self reports PID 1 and a boot time ===');
  const self = await page.evaluate(() => window.platform.host.callCommand('systemd.self'));
  console.log(JSON.stringify(self));

  console.log('=== Test 2: cron/widgets/shell now boot as real systemd units ===');
  const units = await page.evaluate(() => window.platform.host.callCommand('systemd.list'));
  console.log(JSON.stringify(units, null, 2));

  console.log('=== Test 3: PID 1 is globally reserved - first window does not get pid 1 ===');
  await page.evaluate(() => window.platform.host.callCommand('ui.terminal'));
  await page.waitForTimeout(1500);
  const firstWindowPid = await page.evaluate(() => {
    const procs = window.platform.host.callCommand('process.list');
    return procs.length ? procs[0].pid : null;
  });
  console.log('First window pid (should be >= 2):', firstWindowPid);

  console.log('=== Test 4: Task Manager shows systemd as a process, PID first by default sort ===');
  await page.evaluate(() => {
    window.platform.host.exec(window.platform, '/opt/apps/task-manager/main.js');
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.task-manager'))", window.platform);
  });
  await page.waitForTimeout(2000);

  let f = null;
  for (const fr of page.frames()) {
    const found = await fr.evaluate(() => !!document.querySelector('.task-manager')).catch(() => false);
    if (found) { f = fr; break; }
  }
  if (!f) { console.log('Task manager frame not found'); await browser.close(); return; }

  const flatRows = await f.evaluate(() => [...document.querySelectorAll('.tm-row')].map(r => ({
    title: r.querySelector('.tm-row-title')?.textContent,
    pid: r.children[2]?.textContent,
    kind: r.children[1]?.textContent,
  })));
  console.log('Flat view rows (default sort):', JSON.stringify(flatRows, null, 2));

  console.log('=== Test 5: systemd row has no End task/Stop/Start button ===');
  const systemdRowHasAction = await f.evaluate(() => {
    const rows = [...document.querySelectorAll('.tm-row')];
    const sysRow = rows.find(r => r.querySelector('.tm-row-title')?.textContent === 'systemd');
    return sysRow ? !!sysRow.querySelector('.tm-action') : 'ROW NOT FOUND';
  });
  console.log('systemd row has action button (should be false):', systemdRowHasAction);

  console.log('=== Test 6: Tree view shows systemd as root, cron/widgets/shell nested under Background Services ===');
  await f.click('.tm-segmented button:has-text("Tree")', { force: true });
  await page.waitForTimeout(500);
  const treeStructure = await f.evaluate(() => {
    const out = [];
    document.querySelectorAll('.tm-row, .tm-group-row').forEach(el => {
      if (el.classList.contains('tm-group-row')) {
        out.push({ type: 'group', label: el.querySelector('.tm-group-label')?.textContent });
      } else {
        out.push({ type: 'row', title: el.querySelector('.tm-row-title')?.textContent });
      }
    });
    return out;
  });
  console.log(JSON.stringify(treeStructure, null, 2));
  await page.screenshot({ path: 'testing/screenshots/task-manager-systemd-tree.png' });

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
