// Boot cost: requests (by kind), bytes and time until the desktop is ready, for a
// first visit and a repeat visit (warm HTTP cache + service worker).
// Usage: BASE_URL=https://pankajdevesh.com node testing/scripts/perf/measure-boot.mjs [label]
// Writes testing/scripts/perf/results/<label>.json
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

const BASE = (process.env.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
const label = process.argv[2] || 'run';
const origin = new URL(BASE).origin;

const kindOf = (url) => {
    const u = new URL(url);
    if (u.origin !== origin) return 'cdn/external';
    if (/\.bundle\.js$/.test(u.pathname)) return 'bundles';
    if (u.pathname.startsWith('/public/mount/')) return 'vfs files';
    if (u.pathname.startsWith('/(sw)/')) return 'vfs via SW';
    return 'other same-origin';
};

async function visit(page, reload) {
    const reqs = [];
    let bytes = 0;
    const onReq = (r) => reqs.push({ url: r.url(), t: Date.now() });
    const onDone = async (r) => { try { bytes += (await r.sizes()).responseBodySize || 0; } catch (_) {} };
    page.on('request', onReq);
    page.on('requestfinished', onDone);
    const t0 = Date.now();
    if (reload) await page.reload({ waitUntil: 'commit' }); else await page.goto(BASE, { waitUntil: 'commit' });
    // Desktop ready: layout rendered and desktop icons shown.
    let ready = null;
    for (const deadline = Date.now() + 120000; Date.now() < deadline;) {
        const ok = await page.evaluate(() => !!document.querySelector('.layout-default') && document.querySelectorAll('.vfs-desktop-icon').length > 0).catch(() => false);
        if (ok) { ready = Date.now() - t0; break; }
        await page.waitForTimeout(100);
    }
    const atReady = reqs.length;
    // Then wait for the network to go quiet (3 s without a request) — background work done.
    let last = reqs.length, quietSince = Date.now();
    for (const deadline = Date.now() + 120000; Date.now() < deadline;) {
        await page.waitForTimeout(250);
        if (reqs.length !== last) { last = reqs.length; quietSince = Date.now(); }
        else if (Date.now() - quietSince > 3000) break;
    }
    page.off('request', onReq);
    page.off('requestfinished', onDone);
    const settled = quietSince - t0;
    const byKind = {};
    for (const r of reqs) byKind[kindOf(r.url)] = (byKind[kindOf(r.url)] || 0) + 1;
    const beforeReady = {};
    for (const r of reqs.slice(0, atReady)) beforeReady[kindOf(r.url)] = (beforeReady[kindOf(r.url)] || 0) + 1;
    return { desktopReadyMs: ready, megabytes: +(bytes / 1048576).toFixed(2), requestsBeforeReady: atReady, beforeReadyByKind: beforeReady, requestsTotal: reqs.length, settledMs: settled, byKind };
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
// The first navigation installs the service worker, which reloads the page once on activation.
const first = await visit(page, false);
await page.waitForTimeout(2000);
const repeat = await visit(page, true);
const repeat2 = await visit(page, true);
await browser.close();

const out = { label, base: BASE, at: new Date().toISOString(), first, repeat, repeat2 };
mkdirSync('testing/scripts/perf/results', { recursive: true });
writeFileSync(`testing/scripts/perf/results/${label}.json`, JSON.stringify(out, null, 2));
const row = (n, v) => console.log(`${n.padEnd(8)} desktop ready ${String(v.desktopReadyMs).padStart(6)} ms | ${String(v.megabytes).padStart(6)} MB | requests before ready ${String(v.requestsBeforeReady).padStart(4)} | total ${String(v.requestsTotal).padStart(4)} | settled ${String(v.settledMs).padStart(6)} ms | ${JSON.stringify(v.byKind)}`);
console.log(`[${label}] ${BASE}`);
row('first', first); row('repeat', repeat); row('repeat2', repeat2);
