import { chromium } from 'playwright';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:8080');
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    window.platform.host.exec(window.platform, '/opt/apps/ts-ide/main.js');
    window.platform.host.execCommand("service('001-core.layout', 'open-window') (command('ui.ts-ide'))", window.platform);
  });
  await page.waitForTimeout(2500);
  let f = null;
  for (const fr of page.frames()) { if (fr.url().includes('ts-ide/main.html')) { f = fr; break; } }
  await page.waitForTimeout(1000);

  const withTimeout = (p, ms) => Promise.race([p.then(r=>({ok:true,r})), new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),ms))]).catch(e=>({ok:false,error:e.message}));

  console.log('=== sdk().exists(VFS_BASE) on port 8080 ===');
  console.log(await f.evaluate(async () => {
    const withTimeout = (p, ms) => Promise.race([p.then(r=>({ok:true,r})), new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),ms))]).catch(e=>({ok:false,error:e.message}));
    return await withTimeout(sdk().exists(VFS_BASE), 4000);
  }));

  console.log('=== sidebar innerHTML length ===');
  console.log(await f.evaluate(() => document.getElementById('sb-content').innerHTML.length));

  await browser.close();
})();
