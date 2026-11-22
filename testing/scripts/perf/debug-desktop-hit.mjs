// Debug: which element sits at the bottom-right of .content-area (where the security
// suite right-clicks to open the desktop context menu)?
// Usage: BASE_URL=http://localhost:8090 node testing/scripts/perf/debug-desktop-hit.mjs
import { chromium } from 'playwright';
const BASE = (process.env.BASE_URL || 'http://localhost:8090').replace(/\/$/, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto(BASE);
for (let i = 0; i < 300 && !(await page.evaluate(() => document.querySelectorAll('.vfs-desktop-icon').length > 0).catch(() => false)); i++) await sleep(200);
await sleep(6000);
console.log(JSON.stringify(await page.evaluate(() => {
    const el = document.querySelector('.content-area'); const r = el.getBoundingClientRect();
    const x = r.left + r.width - 40, y = r.top + r.height - 60;
    const path = []; for (let n = document.elementFromPoint(x, y); n && n !== document.body; n = n.parentElement)
        path.push(`${n.tagName}${n.id ? '#' + n.id : ''}${n.className && typeof n.className === 'string' ? '.' + n.className.split(' ').join('.') : ''}${n.tagName === 'IFRAME' ? ` [${n.getAttribute('src') || 'srcdoc/blank'} ${Math.round(n.getBoundingClientRect().width)}x${Math.round(n.getBoundingClientRect().height)}]` : ''}`);
    return { contentArea: [r.left, r.top, r.width, r.height].map(Math.round), point: [x, y].map(Math.round), path };
}), null, 1));
await browser.close();
