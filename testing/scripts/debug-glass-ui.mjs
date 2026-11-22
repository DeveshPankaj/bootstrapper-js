// Screenshots of the glass UI (Settings, Files) in dark and light mode, to
// testing/screenshots/glass-ui/. Usage:
//   BASE_URL=http://localhost:8090 node testing/scripts/debug-glass-ui.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = (process.env.BASE_URL || 'http://localhost:8090').replace(/\/$/, '');
const OUT = 'testing/screenshots/glass-ui';
mkdirSync(OUT, { recursive: true });
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

const frameWith = (sel) => until(async () => {
    for (const f of page.frames()) if (await f.locator(sel).count().catch(() => 0)) return f;
    return null;
}, 20000);
const closeAll = () => page.evaluate(() => document.querySelectorAll('.window').forEach(w => w.remove()));

for (const mode of ['dark', 'light']) {
    await page.evaluate((m) => window.platform.host.callCommand('set-appearance-mode', m), mode);
    await closeAll();
    await page.evaluate(() => window.platform.host.openWindow('ui.settings', '06-window-manager'));
    const s = await frameWith('.settings-nav-item');
    await sleep(1500);
    await page.screenshot({ path: `${OUT}/settings-${mode}-window-manager.png` });
    await s.locator('.settings-nav-item').filter({ has: s.locator('span:last-child', { hasText: /^Managers$/ }) }).first().click({ force: true });
    await sleep(800);
    await page.screenshot({ path: `${OUT}/settings-${mode}-managers.png` });
    await s.locator('.settings-nav-item').filter({ has: s.locator('span:last-child', { hasText: /^Storage$/ }) }).first().click({ force: true });
    await sleep(800);
    await page.screenshot({ path: `${OUT}/settings-${mode}-storage.png` });
    await closeAll();
    await page.evaluate(() => window.platform.host.openWindow('explorer', '/home/user1'));
    const f = await frameWith('.file-explorer');
    await sleep(1500);
    await f?.locator('.file-item').first().click({ force: true }).catch(() => {});
    await f?.locator('[aria-label="details"]').click({ force: true }).catch(() => {});
    await sleep(800);
    await page.screenshot({ path: `${OUT}/files-${mode}.png` });
    console.log(mode, 'done; appearance =', await page.evaluate(() => document.documentElement.getAttribute('data-appearance')));
}
await browser.close();
