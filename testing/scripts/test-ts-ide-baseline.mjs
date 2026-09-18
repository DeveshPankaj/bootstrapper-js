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

  await page.evaluate(() => {
    window.platform.host.exec(window.platform, '/opt/apps/ts-ide/main.js');
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.ts-ide'))", window.platform);
  });
  await page.waitForTimeout(2000);

  let f = null;
  for (const fr of page.frames()) {
    if (fr.url().includes('ts-ide/main.html')) { f = fr; break; }
  }
  if (!f) { console.log('Frame not found'); console.log(page.frames().map(fr=>fr.url())); await browser.close(); return; }
  await page.waitForTimeout(2000);

  console.log('--- Test 1: default Hello Canvas (TS) example runs ---');
  await f.click('#run-btn', { force: true });
  await page.waitForTimeout(1000);
  const status1 = await f.evaluate(() => document.getElementById('status-msg').textContent);
  const logs1 = await f.evaluate(() => [...document.querySelectorAll('#console-lines .log')].map(l => l.textContent));
  console.log('Status:', status1);
  console.log('Console:', JSON.stringify(logs1));

  console.log('--- Test 2: switch to GLSL example ---');
  await f.evaluate(() => loadExample(2)); // GLSL Shader example index
  await page.waitForTimeout(500);
  await f.click('#run-btn', { force: true });
  await page.waitForTimeout(1000);
  const status2 = await f.evaluate(() => document.getElementById('status-msg').textContent);
  console.log('GLSL Status:', status2);

  console.log('--- Test 3: save + reload project ---');
  await f.evaluate(() => loadExample(0));
  await page.waitForTimeout(300);
  await f.evaluate(() => { editor.setValue('console.log("saved test content");'); });
  const dialogPromise = page.waitForEvent('dialog').then(d => d.accept('baseline-test-project'));
  await f.click('button:has-text("Save")', { force: true });
  await dialogPromise;
  await page.waitForTimeout(500);
  const saveLog = await f.evaluate(() => [...document.querySelectorAll('#console-lines .log')].map(l => l.textContent).slice(-3));
  console.log('Save result logs:', JSON.stringify(saveLog));

  console.log('Page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
