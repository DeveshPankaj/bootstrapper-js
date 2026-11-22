// Lists the same-origin vfs/static requests made by a repeat visit (after a first visit
// warmed everything up) — anything here beyond /public/mount/meta.json is a file the
// kernel thinks changed. Usage: BASE_URL=http://localhost:8090 node testing/scripts/perf/list-boot-requests.mjs
import { chromium } from 'playwright';
const BASE = (process.env.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
const ready = async () => { for (let i = 0; i < 300; i++) { if (await page.evaluate(() => document.querySelectorAll('.vfs-desktop-icon').length > 0).catch(() => false)) return; await page.waitForTimeout(100); } };
await page.goto(BASE); await ready(); await page.waitForTimeout(6000);
await page.reload(); await ready(); await page.waitForTimeout(6000);
const seen = [];
page.on('request', r => { const u = new URL(r.url()); if (u.origin === new URL(BASE).origin && !u.pathname.endsWith('.bundle.js')) seen.push(u.pathname); });
await page.reload(); await ready(); await page.waitForTimeout(6000);
console.log(seen.join('\n'));
await browser.close();
