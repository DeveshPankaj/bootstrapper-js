// Debug: opens Settings, clicks every section in the sidebar, and records its
// headings, a short text sample and any errors (screenshot per section in
// testing/screenshots/settings-sections/).
// Usage: BASE_URL=http://localhost:8090 node testing/scripts/debug-settings-content.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = (process.env.BASE_URL || 'http://localhost:8090').replace(/\/$/, '');
const SHOTS = 'testing/screenshots/settings-sections';
mkdirSync(SHOTS, { recursive: true });
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
const errors = [];
page.on('pageerror', e => errors.push(e.message.slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
await page.goto(BASE);
await until(() => page.evaluate(() => document.querySelectorAll('.vfs-desktop-icon').length > 0), 60000);
await until(() => page.evaluate(() => { const s = document.getElementById('wos-background-spinner'); return s && !s.classList.contains('active'); }), 60000);
await page.evaluate(() => window.platform.host.openWindow('ui.settings'));
const frame = await until(async () => {
    for (const f of page.frames()) if (await f.locator('.settings-nav-item').count().catch(() => 0)) return f;
    return null;
}, 20000);
const labels = (await frame.locator('.settings-nav-item').allTextContents()).map(t => t.trim());
for (let i = 0; i < labels.length; i++) {
    errors.length = 0;
    await frame.locator('.settings-nav-item').nth(i).click({ force: true });
    await sleep(900);
    const info = await frame.evaluate(() => {
        const c = document.querySelector('.settings-content');
        const heads = [...c.querySelectorAll('h1,h2,h3,h4')].map(h => h.textContent.trim()).filter(Boolean);
        return { heads, text: c.innerText.replace(/\s+/g, ' ').slice(0, 160), empty: !c.innerText.trim() };
    });
    const name = labels[i].replace(/^[a-z_]+/, '');
    console.log(`[${i}] ${name}: ${JSON.stringify(info.heads)}${info.empty ? ' EMPTY' : ''}${errors.length ? ' ERRORS ' + JSON.stringify(errors) : ''}\n      ${info.text}`);
    await page.screenshot({ path: `${SHOTS}/${String(i).padStart(2, '0')}-${name.replace(/\W+/g, '-')}.png` });
}
await browser.close();
