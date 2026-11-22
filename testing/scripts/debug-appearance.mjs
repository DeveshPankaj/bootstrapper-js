// Debug: does a Settings / Files window get the appearance (data-appearance on its
// document, platform.host.appearance$ in its realm)?
// Usage: BASE_URL=http://localhost:8090 node testing/scripts/debug-appearance.mjs
import { chromium } from 'playwright';
const BASE = (process.env.BASE_URL || 'http://localhost:8090').replace(/\/$/, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
page.on('console', m => { if (/appearance|error/i.test(m.text())) console.log('console:', m.text().slice(0, 200)); });
await page.goto(BASE);
for (let i = 0; i < 200 && !(await page.evaluate(() => document.querySelectorAll('.vfs-desktop-icon').length > 0).catch(() => false)); i++) await sleep(250);
await sleep(3000);
await page.evaluate(() => window.platform.host.callCommand('set-appearance-mode', 'light'));
await page.evaluate(() => window.platform.host.openWindow('ui.settings'));
await page.evaluate(() => window.platform.host.openWindow('explorer', '/home/user1'));
await sleep(3000);
for (const f of page.frames()) {
    const info = await f.evaluate(() => ({
        url: location.href.slice(0, 60),
        attr: document.documentElement.getAttribute('data-appearance'),
        hasPlatform: typeof platform !== 'undefined',
        hasSubject: typeof platform !== 'undefined' && !!platform.host?.appearance$,
        hostAppearance: typeof platform !== 'undefined' && platform.host?.getAppearance?.(),
        settings: !!document.querySelector('.settings-root'), files: !!document.querySelector('.file-explorer'),
    })).catch(e => ({ err: e.message.slice(0, 80) }));
    if (info.settings || info.files || f === page.mainFrame()) console.log(JSON.stringify(info));
}
await browser.close();
