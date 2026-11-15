// Debug helper: dumps which iframes exist after opening Settings, and the settings
// window's rendered nav text — used to diagnose why certain /etc/settings/*.js
// sections (Window Manager, Layout, Projects) weren't appearing in the sidebar
// (root cause: those files existed on disk but were missing from meta.json, so a
// fresh vfs never had them bootstrapped — see meta.json's /etc/settings/* entries).
import { chromium } from 'playwright';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
page.on('console', msg => console.log('CONSOLE', msg.type(), msg.text()));
await page.goto('http://localhost:8080');
await page.waitForTimeout(3000);
await page.reload();
await page.waitForTimeout(3000);
await page.reload();
await page.waitForTimeout(3000);
const t0 = Date.now();
while (Date.now() - t0 < 30000) {
  const ok = await page.evaluate(() => !!window.platform?.host?.getCommand?.('ui.settings')).catch(() => false);
  if (ok) break;
  await sleep(1000);
}
console.log('settings command found');
const res = await page.evaluate(() => {
  try { window.platform.host.callCommand('ui.settings'); return 'ok'; } catch (e) { return 'err: ' + e.message; }
});
console.log('callCommand result:', res);
await page.waitForTimeout(3000);
console.log('frames:', page.frames().map(f => f.url()));
const f = page.frames().find(fr => fr.url().includes('settings/main.html'));
console.log('settings frame found:', !!f);
if (f) {
  const text = await f.evaluate(() => document.body.innerText).catch(e => 'ERR:' + e.message);
  console.log('nav/body text (first 800 chars):', text.slice(0, 800));
}
await page.screenshot({ path: 'testing/screenshots/debug-settings-frame.png' });
await browser.close();
