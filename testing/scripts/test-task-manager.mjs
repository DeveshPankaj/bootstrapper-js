import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Open a couple of extra app windows so the process list isn't trivially empty.
  await page.evaluate(() => {
    window.platform.host.callCommand('ui.terminal');
  });
  await page.waitForTimeout(1500);

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
  if (!f) { console.log('Task manager frame not found'); console.log('urls:', page.frames().map(x => x.url())); await browser.close(); return; }

  console.log('=== Test 1: rows render (apps + services merged) ===');
  await page.waitForTimeout(500);
  const rowCount = await f.evaluate(() => document.querySelectorAll('.tm-row').length);
  console.log('Row count:', rowCount);
  const rowTitles = await f.evaluate(() => [...document.querySelectorAll('.tm-row-title')].map(e => e.textContent));
  console.log('Row titles:', JSON.stringify(rowTitles));

  console.log('=== Test 2: sort by clicking a column header ===');
  const beforeSort = await f.evaluate(() => [...document.querySelectorAll('.tm-row-title')].map(e => e.textContent));
  await f.click('th.tm-sortable:has-text("PID")', { force: true });
  await page.waitForTimeout(300);
  const afterSortAsc = await f.evaluate(() => [...document.querySelectorAll('.tm-row td:nth-child(3)')].map(e => e.textContent));
  console.log('PIDs after asc sort:', JSON.stringify(afterSortAsc));
  await f.click('th.tm-sortable:has-text("PID")', { force: true });
  await page.waitForTimeout(300);
  const afterSortDesc = await f.evaluate(() => [...document.querySelectorAll('.tm-row td:nth-child(3)')].map(e => e.textContent));
  console.log('PIDs after desc sort:', JSON.stringify(afterSortDesc));

  console.log('=== Test 3: toggle Tree view, expect group headers ===');
  await f.click('.tm-segmented button:has-text("Tree")', { force: true });
  await page.waitForTimeout(300);
  const groupLabels = await f.evaluate(() => [...document.querySelectorAll('.tm-group-label')].map(e => e.textContent));
  console.log('Group labels:', JSON.stringify(groupLabels));

  console.log('=== Test 4: collapse a group ===');
  await f.click('.tm-group-row', { force: true });
  await page.waitForTimeout(300);
  const rowsAfterCollapse = await f.evaluate(() => document.querySelectorAll('.tm-row').length);
  console.log('Rows after collapsing first group:', rowsAfterCollapse, '(was', rowCount, 'in flat view before any services existed... just sanity check it decreased or stayed consistent)');

  console.log('=== Test 5: memory chip + status pills present ===');
  const memChip = await f.evaluate(() => { const el = document.querySelector('.tm-mem-chip'); return el ? el.textContent : null; });
  console.log('Memory chip:', memChip);
  const pillCount = await f.evaluate(() => document.querySelectorAll('.tm-row td span').length > 0);
  console.log('Status pills present:', pillCount);

  console.log('=== Test 6: End task action works ===');
  await f.click('.tm-segmented button:has-text("Flat")', { force: true });
  await page.waitForTimeout(300);
  const beforeEnd = await f.evaluate(() => document.querySelectorAll('.tm-row').length);
  // End the Xterm window specifically, not Task Manager's own row (ending
  // that would detach the very frame we're inspecting).
  const xtermRow = f.locator('tr.tm-row', { hasText: 'Xterm' });
  const hasXterm = await xtermRow.count();
  if (hasXterm) {
    await xtermRow.locator('.tm-action').click({ force: true });
    await page.waitForTimeout(2000);
    const afterEnd = await f.evaluate(() => document.querySelectorAll('.tm-row').length);
    console.log(`Rows before end task: ${beforeEnd}, after: ${afterEnd}`);
  } else {
    console.log('No Xterm row found to test end-task on');
  }

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
