// Boot loading: the landing page first, everything else in the background.
//   first visit — one navigation (no service-worker reload), desktop icons served
//                 through the SW, background spinner shows then hides, preinstalled
//                 apps and deferred bundles register their commands afterwards, apps
//                 that aren't installed are never downloaded, and opening a file right
//                 after landing waits for its viewer instead of failing;
//   repeat visit — the only vfs file requested is meta.json (revalidation).
// Usage: BASE_URL=http://localhost:8090 node testing/scripts/perf/test-boot-loading.mjs
//        (a static server of docs/: node testing/scripts/perf/static-server.mjs 8090)
import { chromium } from 'playwright';

const BASE = (process.env.BASE_URL || 'http://localhost:8090').replace(/\/$/, '');
const ORIGIN = new URL(BASE).origin;
let failed = 0;
const check = (name, ok, detail = '') => {
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, timeout = 30000) => {
    for (const end = Date.now() + timeout; Date.now() < end; await sleep(200)) {
        const v = await fn().catch(() => null);
        if (v) return v;
    }
    return null;
};

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
// Record whether the background spinner ever turned on: under load the background
// work can finish before a poll started after landing would see it.
await page.addInitScript(() => {
    const watch = () => new MutationObserver(() => {
        if (document.querySelector('#wos-background-spinner.active')) window.__wosSpinnerSeen = true;
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    if (document.documentElement) watch(); else document.addEventListener('DOMContentLoaded', watch);
});
const requests = [];
page.on('request', r => requests.push(r.url()));
let navigations = 0;
page.on('framenavigated', f => { if (f === page.mainFrame()) navigations++; });
const errors = [];
page.on('pageerror', e => errors.push(String(e.message).slice(0, 160)));

try {
    // ── First visit ──
    await page.goto(BASE);
    const ready = await until(() => page.evaluate(() => document.querySelectorAll('.vfs-desktop-icon').length > 0), 60000);
    check('first visit: desktop shows', !!ready);

    const spinnerSeen = await until(() => page.evaluate(() => window.__wosSpinnerSeen === true), 10000);
    check('background spinner shows while the rest loads', !!spinnerSeen);

    // Opening a file right after landing: Notepad's bundle may still be loading — the
    // open waits for it instead of failing with "command not found".
    const opened = await page.evaluate(async () => {
        window.fs.writeFileSync('/tmp/boot-loading.txt', 'hello');
        try { await window.platform.host.openWindow('ui.notepad', '/tmp/boot-loading.txt'); return 'ok'; }
        catch (e) { return String(e && e.message || e); }
    });
    check('opening a file during background loading waits for its app', opened === 'ok', opened);

    const idle = await until(() => page.evaluate(() => {
        const s = document.getElementById('wos-background-spinner');
        return s && !s.classList.contains('active');
    }), 60000);
    check('spinner hides when background loading is done', !!idle);

    const commands = await page.evaluate(() => Object.fromEntries(
        ['ui.notepad', 'ui.markdown', 'ui.audioplayer', 'ui.imageviewer', 'ui.app-drawer', 'explorer', 'ui.pkg-manager']
            .map(n => [n, !!window.platform.host.getCommand(n)])));
    check('deferred bundles and background-installed apps registered', Object.values(commands).every(Boolean), JSON.stringify(commands));

    // Desktop icons are CSS background images at /(sw)/usr/share/icons/… — fetch each
    // from the page (through the SW) and require an image back.
    const icons = await page.evaluate(async () => {
        const urls = [...new Set([...document.querySelectorAll('.vfs-desktop-icon-img')]
            .map(el => /url\("([^"]+)"\)/.exec(getComputedStyle(el).backgroundImage)?.[1]).filter(Boolean))]; // quoted: the URL has '(sw)' in it
        return Promise.all(urls.map(async u => {
            try { const r = await fetch(u); return r.ok && (r.headers.get('content-type') || '').startsWith('image/'); }
            catch (_) { return false; }
        }));
    });
    check('desktop icons load through the service worker', icons.length > 0 && icons.every(Boolean), JSON.stringify(icons));
    check('first visit runs once (no service-worker reload)', navigations === 1, `main-frame navigations: ${navigations}`);

    const notInstalled = requests.filter(u => /\/public\/mount\/opt\/apps\/(ts-ide|glsl-shader|notebook|dashboard|totp-auth|robot-sim|webrtc|task-manager|snake-game|distributed-compute)\//.test(u));
    check('apps that are not installed are not downloaded', notInstalled.length === 0, notInstalled.slice(0, 3).join(', '));

    // ── Repeat visit ──
    await sleep(1500); // let the IndexedDB mirror flush
    requests.length = 0;
    await page.reload();
    await until(() => page.evaluate(() => document.querySelectorAll('.vfs-desktop-icon').length > 0), 60000);
    await sleep(4000);
    const vfs = requests.filter(u => u.startsWith(ORIGIN + '/public/mount/')).map(u => new URL(u).pathname);
    check('repeat visit: only meta.json is requested from the vfs mount', vfs.length === 1 && vfs[0] === '/public/mount/meta.json', JSON.stringify(vfs.slice(0, 8)));

    check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (err) {
    failed++;
    console.log('FAIL  unexpected error —', err.message);
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
