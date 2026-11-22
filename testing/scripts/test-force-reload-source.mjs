// Settings › Storage › Default Files › Force Reload with a source URL.
//   - the Source field is prefilled with this site's meta.json; empty means the default;
//   - another source asks first, naming its origin; declining writes nothing;
//   - entries are checked like the kernel's bootstrap: absolute/protocol-relative
//     URLs, '..', query characters and non-normalised targets are skipped;
//   - a system file from another source is restored from this site on the next boot,
//     while a user file keeps the loaded copy;
//   - plain http:// (other than localhost) is refused before anything is fetched.
// The "other site" is https://mirror.test, served by Playwright request routing.
// Usage: BASE_URL=http://localhost:8090 node testing/scripts/test-force-reload-source.mjs
//        (a static server of docs/: node testing/scripts/perf/static-server.mjs 8090)
import { chromium } from 'playwright';

const BASE = (process.env.BASE_URL || 'http://localhost:8090').replace(/\/$/, '');
const MIRROR = 'https://mirror.test';
let failed = 0;
const check = (name, ok, detail = '') => {
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, timeout = 30000) => {
    for (const end = Date.now() + timeout; Date.now() < end; await sleep(250)) {
        const v = await fn().catch(() => null);
        if (v) return v;
    }
    return null;
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const mirrorHits = [];
const mirrorMeta = [
    { path: '/home/user1/mirror.txt', file: '/home/user1/mirror.txt', force_reload: true },
    { path: '/bin/ls.run', file: '/bin/ls.run', force_reload: true },
    { path: '/home/user1/abs.txt', file: 'https://evil.test/x.txt', force_reload: true },
    { path: '/home/user1/proto.txt', file: '//evil.test/x.txt', force_reload: true },
    { path: '/home/user1/dotdot.txt', file: '/../x.txt', force_reload: true },
    { path: '/home/user1/query.txt', file: '/home/user1/mirror.txt?x=1', force_reload: true },
    { path: '/home/user1/../../etc/escape.txt', file: '/home/user1/mirror.txt', force_reload: true },
    { path: 'home/user1/relative.txt', file: '/home/user1/mirror.txt', force_reload: true },
];
await context.route(`${MIRROR}/**`, (route) => {
    const url = new URL(route.request().url());
    mirrorHits.push(url.pathname);
    const headers = { 'access-control-allow-origin': '*' };
    if (url.pathname === '/public/mount/meta.json') return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(mirrorMeta) });
    if (url.pathname === '/public/mount/home/user1/mirror.txt') return route.fulfill({ status: 200, headers, contentType: 'text/plain', body: 'from the mirror' });
    if (url.pathname === '/public/mount/bin/ls.run') return route.fulfill({ status: 200, headers, contentType: 'text/plain', body: '/* mirror ls */' });
    return route.fulfill({ status: 404, headers, body: 'no' });
});
const evilHits = [];
await context.route('**://evil.test/**', (route) => { evilHits.push(route.request().url()); route.fulfill({ status: 200, body: 'evil' }); });

const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e.message).slice(0, 160)));
const dialogs = [];
let answer = true;
page.on('dialog', (d) => { dialogs.push(d.message()); (answer ? d.accept() : d.dismiss()).catch(() => {}); });

const booted = () => until(() => page.evaluate(() => document.querySelectorAll('.vfs-desktop-icon').length > 0), 60000);
const settled = () => until(() => page.evaluate(() => { const s = document.getElementById('wos-background-spinner'); return s && !s.classList.contains('active'); }), 60000);
const openStorage = async () => {
    await page.evaluate(() => window.platform.host.openWindow('ui.settings', '08-storage'));
    return until(async () => {
        for (const f of page.frames()) if (await f.locator('#force-reload-source').count().catch(() => 0)) return f;
        return null;
    }, 20000);
};
const read = (p) => page.evaluate((p) => { try { return window.fs.readFileSync(p, 'utf8'); } catch (_) { return null; } }, p);
const forceReload = (f) => f.locator('button', { hasText: 'Force Reload' }).evaluate(el => el.click());

try {
    await page.goto(BASE);
    await booted();
    await settled();
    const serverLs = await (await fetch(`${BASE}/public/mount/bin/ls.run`)).text();

    // ── Prefill and validation ──
    let f = await openStorage();
    const prefilled = await f.locator('#force-reload-source').inputValue();
    check('Source is prefilled with this site\'s meta.json', prefilled === `${BASE}/public/mount/meta.json`, prefilled);

    await f.locator('#force-reload-source').fill('http://evil.test');
    await sleep(200);
    const note = await f.locator('#force-reload-source + .settings-row-subtitle').textContent();
    const disabled = await f.locator('button', { hasText: 'Force Reload' }).isDisabled();
    check('plain http:// (not localhost) is refused before fetching', /https/.test(note) && disabled && evilHits.length === 0, note);

    // ── Another source, declined ──
    await f.locator('#force-reload-source').fill(MIRROR);
    await sleep(200);
    check('a site address resolves to its meta.json', (await f.locator('#force-reload-source + .settings-row-subtitle').textContent()).includes(`${MIRROR}/public/mount/meta.json`));
    answer = false;
    dialogs.length = 0;
    await forceReload(f);
    await sleep(800);
    check('another source asks first, naming its origin', dialogs.length === 1 && dialogs[0].includes(MIRROR) && /runs when the desktop starts/.test(dialogs[0]), dialogs[0]?.slice(0, 90));
    check('declining fetches and writes nothing', mirrorHits.length === 0 && (await read('/home/user1/mirror.txt')) === null);

    // ── Another source, accepted ──
    answer = true;
    await page.evaluate(() => { window.__beforeReload = 1; });
    await forceReload(f);
    await until(() => page.evaluate(() => window.__beforeReload === undefined).catch(() => false), 30000);
    await booted();
    check('the user file comes from the other source', (await read('/home/user1/mirror.txt')) === 'from the mirror');
    const skipped = await page.evaluate(() => ['/home/user1/abs.txt', '/home/user1/proto.txt', '/home/user1/dotdot.txt', '/home/user1/query.txt', '/etc/escape.txt', '/home/user1/relative.txt'].filter(p => window.fs.existsSync(p)));
    check('URLs, "..", query characters and bad targets are skipped', skipped.length === 0 && evilHits.length === 0, JSON.stringify({ skipped, evilHits }));
    await settled();
    const ls = await until(async () => { const v = await read('/bin/ls.run'); return v === serverLs ? v : null; }, 30000);
    check('a system file from the other source is restored from this site on the next boot', ls === serverLs);

    // ── Empty means this site ──
    await page.evaluate(() => window.fs.writeFileSync('/home/user1/Notes.md', 'local edit'));
    f = await openStorage();
    await f.locator('#force-reload-source').fill('');
    await sleep(200);
    check('an empty source means this site', /This site \(default\)/.test(await f.locator('#force-reload-source + .settings-row-subtitle').textContent()));
    const metaRequests = [];
    page.on('request', r => { if (r.url().endsWith('/meta.json')) metaRequests.push(r.url()); });
    mirrorHits.length = 0;
    dialogs.length = 0;
    await page.evaluate(() => { window.__beforeReload = 1; });
    await forceReload(f);
    await until(() => page.evaluate(() => window.__beforeReload === undefined).catch(() => false), 60000);
    await booted();
    const notes = await read('/home/user1/Notes.md');
    const serverNotes = await (await fetch(`${BASE}/public/mount/home/user1/Notes.md`)).text();
    check('the default reload uses this site', metaRequests[0] === `${BASE}/public/mount/meta.json` && mirrorHits.length === 0, metaRequests[0]);
    check('the default reload restores the shipped files', notes === serverNotes, (notes || '').slice(0, 40));
    check('the default reload keeps its original prompt', /re-download every file listed in meta.json/.test(dialogs[0] || ''));

    check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (err) {
    failed++;
    console.log('FAIL  unexpected error —', err.message);
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
