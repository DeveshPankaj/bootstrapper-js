import { chromium } from 'playwright';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:8085');
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

  console.log('=== sdk().exists(VFS_BASE) ===');
  console.log(await f.evaluate(async () => {
    const withTimeout = (p, ms) => Promise.race([p.then(r=>({ok:true,r})), new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),ms))]).catch(e=>({ok:false,error:e.message}));
    return await withTimeout(sdk().exists(VFS_BASE), 4000);
  }));

  console.log('=== window.platform.host.getFS().existsSync(VFS_BASE) directly (outside sandbox) ===');
  console.log(await page.evaluate(() => {
    try { return window.platform.host.getFS().existsSync('/home/user1/.local/share/ui.ts-ide/projects'); }
    catch(e){ return 'ERROR: '+e.message; }
  }));

  console.log('=== sdk().mkdir(VFS_BASE) then sdk().list(VFS_BASE) ===');
  console.log(await f.evaluate(async () => {
    const withTimeout = (p, ms) => Promise.race([p.then(r=>({ok:true,r})), new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),ms))]).catch(e=>({ok:false,error:e.message}));
    const mk = await withTimeout(sdk().mkdir(VFS_BASE), 4000);
    const ls = await withTimeout(sdk().list(VFS_BASE), 4000);
    return { mk, ls };
  }));

  await browser.close();
})();
