// Debug: lists the Settings sidebar on the first and second open (and the
// registered section names), with a screenshot of each.
// Usage: BASE_URL=http://localhost:8090 node testing/scripts/debug-settings-sections.mjs
import { chromium } from 'playwright';

const BASE = (process.env.BASE_URL || 'http://localhost:8090').replace(/\/$/, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, timeout = 30000) => {
    for (const end = Date.now() + timeout; Date.now() < end; await sleep(250)) {
        const v = await fn().catch(() => null);
        if (v) return v;
    }
    return null;
};
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
page.on('pageerror', e => console.log('pageerror:', e.message.slice(0, 200)));
await page.goto(BASE);
await until(() => page.evaluate(() => document.querySelectorAll('.vfs-desktop-icon').length > 0), 60000);
await until(() => page.evaluate(() => { const s = document.getElementById('wos-background-spinner'); return s && !s.classList.contains('active'); }), 60000);

const sidebar = () => until(async () => {
    for (const f of page.frames()) {
        const items = await f.locator('.settings-nav-item').allTextContents().catch(() => []);
        if (items.length) return items.map(t => t.trim());
    }
    return null;
}, 20000);
const sections = () => page.evaluate(() => {
    let names = [];
    window.platform.host.settingsSections$.subscribe(s => { names = s.map(x => `${x.name}:${x.meta?.title}`); }).unsubscribe();
    return names;
});

for (const round of [1, 2]) {
    await page.evaluate(() => window.platform.host.openWindow('ui.settings'));
    await sleep(2500);
    const items = await sidebar();
    console.log(`open #${round}: ${items?.length} items:`, JSON.stringify(items));
    console.log(`  sections: ${JSON.stringify(await sections())}`);
    await page.screenshot({ path: `testing/screenshots/settings-sidebar-${round}.png` });
    await page.evaluate(() => document.querySelectorAll('.window').forEach(w => w.querySelector('.window-close, [data-action="close"], .close')?.click()));
    await page.evaluate(() => { for (const w of document.querySelectorAll('.window[data-name="ui.settings"]')) w.remove(); });
    await sleep(800);
}
await browser.close();
