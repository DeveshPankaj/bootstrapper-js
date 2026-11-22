// Debug helper: first visit — is the page SW-controlled, and what does an icon fetch return?
import { chromium } from 'playwright';
const BASE = (process.env.BASE_URL || 'http://localhost:8090').replace(/\/$/, '');
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
page.on('console', m => { if (/sw|service|bridge/i.test(m.text())) console.log('[console]', m.type(), m.text().slice(0, 200)); });
await page.goto(BASE);
for (let i = 0; i < 300 && !(await page.evaluate(() => document.querySelectorAll('.vfs-desktop-icon').length).catch(() => 0)); i++) await page.waitForTimeout(100);
await page.waitForTimeout(3000);
console.log(JSON.stringify(await page.evaluate(async () => {
    const r = await fetch('/(sw)/usr/share/icons/folder-icon.png');
    return { controlled: !!navigator.serviceWorker.controller, status: r.status, type: r.headers.get('content-type'), exists: window.fs.existsSync('/usr/share/icons/folder-icon.png'), bootLog: window.__bootLog };
}), null, 1));
await browser.close();
