// Debug: open Mermaid Viewer on a file and print console errors / frame state.
// Usage: OS_URL=http://localhost:8090 node testing/scripts/debug-mermaid.mjs
import { launch, bootReady, sleep, installApp, openApp, writeFiles } from './security/verify-viewers-lib.mjs';
const browser = await launch();
const page = await bootReady(await browser.newContext());
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console', m.type(), m.text().slice(0, 220)); });
page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 220)));
page.on('requestfailed', (r) => console.log('requestfailed', r.url().slice(0, 120), r.failure()?.errorText));
await writeFiles(page, { '/home/user1/mm/a.mmd': 'graph TD\n  A --> B' });
console.log('install', await installApp(page, 'mermaid-viewer').catch(e => 'ERR ' + e.message));
console.log('cmd', await page.evaluate(() => !!window.platform.host.getCommand('ui.mermaid')));
await openApp(page, 'ui.mermaid', '/home/user1/mm/a.mmd').catch(e => console.log('openApp', e.message));
await sleep(8000);
for (const f of page.frames()) {
  const info = await f.evaluate(() => ({ url: location.href.slice(0, 60), svg: !!document.querySelector('.mv-svg-wrap svg'), mv: !!document.querySelector('[class^="mv-"]'), mermaid: typeof window.mermaid })).catch(() => null);
  if (info && (info.mv || info.svg)) console.log(JSON.stringify(info));
}
console.log('windows', await page.evaluate(() => [...document.querySelectorAll('.window')].map(w => w.dataset.name)));
await browser.close();
