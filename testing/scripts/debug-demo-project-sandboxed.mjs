// Debug helper for test-demo-project-sandboxed.mjs: dumps every frame's origin and text.
import { launch, bootOS } from './security/spike-lib.mjs';
const browser = await launch();
const context = await browser.newContext();
const page = await bootOS(context);
page.on('console', m => console.log('[console]', m.type(), m.text().slice(0, 300)));
await page.evaluate(() => window.platform.host.exec(window.platform, '/home/user1/projects/temp.html'));
await page.waitForTimeout(12000);
console.log('windows:', await page.evaluate(() => [...document.querySelectorAll('.window')].map(w => w.getAttribute('data-name'))));
for (const f of page.frames()) {
    const info = await f.evaluate(() => ({ origin: self.origin, ipc: typeof window.ipc, react: typeof window.React, babel: typeof window.Babel, text: (document.body?.innerText || '').slice(0, 200) })).catch(e => ({ err: String(e).slice(0, 120) }));
    if (info.origin === 'null' || info.err) console.log(f.url().slice(0, 60), JSON.stringify(info));
}
await browser.close();
