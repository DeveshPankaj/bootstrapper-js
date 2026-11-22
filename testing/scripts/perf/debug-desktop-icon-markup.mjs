// Debug helper: prints the markup of the first desktop icon (how icons are rendered).
import { chromium } from 'playwright';
const BASE = (process.env.BASE_URL || 'http://localhost:8090').replace(/\/$/, '');
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto(BASE);
for (let i = 0; i < 300 && !(await page.evaluate(() => document.querySelectorAll('.vfs-desktop-icon').length).catch(() => 0)); i++) await page.waitForTimeout(100);
await page.waitForTimeout(2000);
console.log(await page.evaluate(() => document.querySelector('.vfs-desktop-icon')?.outerHTML.slice(0, 600)));
console.log(await page.evaluate(() => { const el = document.querySelector('.vfs-desktop-icon *[style*="background"], .vfs-desktop-icon img'); return el ? getComputedStyle(el).backgroundImage + ' | ' + (el.src || '') : 'none'; }));
await browser.close();
