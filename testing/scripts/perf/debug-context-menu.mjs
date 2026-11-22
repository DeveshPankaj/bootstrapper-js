// Debug: does a right-click on the desktop open the context menu (before and after the
// background load finishes, with an untouched and a tampered /usr/lib/ui/menuItem.js)?
// Usage: BASE_URL=http://localhost:8090 node testing/scripts/perf/debug-context-menu.mjs
import { chromium } from 'playwright';

const BASE = (process.env.BASE_URL || 'http://localhost:8090').replace(/\/$/, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
page.on('console', m => { if (/menu|static|error/i.test(m.text())) console.log('console:', m.type(), m.text().slice(0, 200)); });
page.on('pageerror', e => console.log('pageerror:', e.message.slice(0, 200)));

const menuState = () => page.evaluate(() => [...document.querySelectorAll('.contextmenu')].map(m => ({
    visible: m.offsetParent !== null && m.style.display !== 'none', display: m.style.display, items: m.children.length,
})));
const rightClick = async (label) => {
    const box = await page.evaluate(() => { const el = document.querySelector('.content-area') || document.body; const r = el.getBoundingClientRect(); return { x: r.left + r.width - 40, y: r.top + r.height - 60 }; });
    const target = await page.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); return el ? `${el.tagName}.${el.className}` : null; }, box);
    await page.mouse.click(box.x, box.y, { button: 'right' });
    await sleep(1500);
    console.log(label, 'target:', target, 'menus:', JSON.stringify(await menuState()));
    await page.keyboard.press('Escape').catch(() => {});
    await page.mouse.click(box.x - 200, box.y - 200);
    await sleep(300);
};

await page.goto(BASE);
for (let i = 0; i < 300 && !(await page.evaluate(() => document.querySelectorAll('.vfs-desktop-icon').length > 0).catch(() => false)); i++) await sleep(200);
await rightClick('right after landing');
for (let i = 0; i < 300 && !(await page.evaluate(() => { const s = document.getElementById('wos-background-spinner'); return s && !s.classList.contains('active'); }).catch(() => false)); i++) await sleep(200);
await rightClick('after background load');
const orig = await page.evaluate(() => window.fs.readFileSync('/usr/lib/ui/menuItem.js', 'utf8'));
await page.evaluate((src) => window.fs.writeFileSync('/usr/lib/ui/menuItem.js', src + '\n;window.top.__sec_menu = 1;'), orig);
await rightClick('tampered vfs copy');
console.log('sentinel fired:', await page.evaluate(() => !!window.top.__sec_menu));
await browser.close();
