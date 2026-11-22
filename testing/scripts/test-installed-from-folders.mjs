// Installed apps come from the /opt/apps folders, not from a JSON list:
//   - the list (`pkg.installed-apps`, its installed.json snapshot, App Manager) is the
//     folders that hold a main file; every default app folder carries an app.json;
//   - deleting an app's folder uninstalls it: gone from the list at once, not loaded
//     after a reload, and a preinstalled app is not delivered again;
//   - an App Manager install writes the app's app.json; deleting that folder removes it;
//   - deleting a system app's folder doesn't break the desktop: the system restores it;
//   - an old install (folder without app.json + installed.json record) gets an app.json
//     from that record;
//   - a manifest can't point the main file outside its folder.
// Usage: BASE_URL=http://localhost:8090 node testing/scripts/test-installed-from-folders.mjs
//        (a static server of docs/: node testing/scripts/perf/static-server.mjs 8090)
import { chromium } from 'playwright';

const BASE = (process.env.BASE_URL || 'http://localhost:8090').replace(/\/$/, '');
const DEFAULTS = ['app-drawer', 'audio-player', 'file-explorer', 'image-viewer', 'pkg-manager', 'settings', 'spotlight', 'terminal'];
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
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e.message).slice(0, 160)));
const requests = [];
page.on('request', r => requests.push(r.url()));

const booted = () => until(() => page.evaluate(() => document.querySelectorAll('.vfs-desktop-icon').length > 0), 60000);
const settled = () => until(() => page.evaluate(() => { const s = document.getElementById('wos-background-spinner'); return s && !s.classList.contains('active'); }), 60000);
const reboot = async () => { await sleep(1500); await page.reload(); await booted(); await settled(); await sleep(1000); };
const ids = () => page.evaluate(() => (window.platform.host.callCommand('pkg.installed-apps') || []).map(a => a.id).sort());
const snapshotIds = () => page.evaluate(() => JSON.parse(window.fs.readFileSync('/etc/pkg/installed.json', 'utf8')).map(a => a.id).sort());
const has = (cmd) => page.evaluate((c) => !!window.platform.host.getCommand(c), cmd);
const exists = (p) => page.evaluate((p) => window.fs.existsSync(p), p);
const rmrf = (p) => page.evaluate((p) => {
    const fs = window.fs;
    const rm = (q) => { if (fs.statSync(q).isDirectory()) { for (const n of fs.readdirSync(q)) rm(`${q}/${n}`); fs.rmdirSync(q); } else fs.unlinkSync(q); };
    rm(p);
}, p);
const appManagerFrame = (name) => until(async () => {
    for (const f of page.frames()) if (await f.locator(`.pkg-card .pkg-card-name:text-is(${JSON.stringify(name)})`).count().catch(() => 0)) return f;
    return null;
}, 30000);

try {
    await page.goto(BASE);
    await booted();
    await settled();
    await sleep(1000);

    // ── The list is the folders ──
    check('the installed list is the default app folders', JSON.stringify(await ids()) === JSON.stringify(DEFAULTS), (await ids()).join(' '));
    check('installed.json is a snapshot of the same list', JSON.stringify(await snapshotIds()) === JSON.stringify(DEFAULTS));
    const manifests = await page.evaluate((d) => d.filter(id => !window.fs.existsSync(`/opt/apps/${id}/app.json`)), DEFAULTS);
    check('every default app folder has an app.json', manifests.length === 0, manifests.join(' '));

    // ── Deleting a folder uninstalls the app ──
    check('precondition: Audio Player is registered', await has('ui.audioplayer'));
    await rmrf('/opt/apps/audio-player');
    check('deleting the folder removes it from the list at once', !(await ids()).includes('audio-player'));
    requests.length = 0;
    await reboot();
    check('after a reload the deleted app is not loaded', !(await has('ui.audioplayer')));
    check('a deleted preinstalled app is not delivered again', !(await exists('/opt/apps/audio-player')) && !requests.some(u => u.includes('/opt/apps/audio-player/')));
    check('the snapshot follows the folders', !(await snapshotIds()).includes('audio-player'));

    // ── App Manager install writes app.json; deleting the folder removes it ──
    await page.evaluate(() => window.platform.host.openWindow('ui.pkg-manager', 'Bookmarks'));
    let f = await appManagerFrame('Bookmarks');
    const card = f.locator('.pkg-card').filter({ has: f.locator('.pkg-card-name:text-is("Bookmarks")') }).first();
    await card.locator('button', { hasText: 'Install' }).first().evaluate(el => el.click());
    await until(() => has('ui.bookmarks'), 20000);
    const manifest = await page.evaluate(() => { try { return JSON.parse(window.fs.readFileSync('/opt/apps/bookmarks/app.json', 'utf8')); } catch (_) { return null; } });
    check('App Manager install writes the app\'s app.json', !!manifest && manifest.id === 'bookmarks' && !!manifest.version && manifest.main === 'main.js', JSON.stringify(manifest));
    check('the installed app is listed', (await ids()).includes('bookmarks'));
    await page.evaluate(() => document.querySelectorAll('.window').forEach(w => w.remove()));
    await rmrf('/opt/apps/bookmarks');
    await reboot();
    check('deleting an installed app\'s folder uninstalls it', !(await has('ui.bookmarks')) && !(await ids()).includes('bookmarks'));
    await page.evaluate(() => window.platform.host.openWindow('ui.pkg-manager', 'Bookmarks'));
    f = await appManagerFrame('Bookmarks');
    const buttons = await f.locator('.pkg-card').filter({ has: f.locator('.pkg-card-name:text-is("Bookmarks")') }).first().locator('button').allTextContents();
    check('App Manager offers Install again', buttons.some(t => /Install/.test(t)) && !buttons.some(t => /Uninstall|Open/.test(t)), JSON.stringify(buttons));
    await page.evaluate(() => document.querySelectorAll('.window').forEach(w => w.remove()));

    // ── A system app's folder is restored ──
    await rmrf('/opt/apps/spotlight');
    await reboot();
    check('a deleted system app is restored by the system', (await exists('/opt/apps/spotlight/main.js')) && (await has('spotlight')));

    // ── An old install: folder without app.json, metadata in installed.json ──
    await page.evaluate(async () => {
        const fs = window.fs;
        fs.mkdirSync('/opt/apps/colleps');
        fs.writeFileSync('/opt/apps/colleps/main.js', await (await fetch('/public/mount/opt/apps/colleps/main.js')).text());
        const snap = JSON.parse(fs.readFileSync('/etc/pkg/installed.json', 'utf8'));
        snap.push({ id: 'colleps', name: 'Colleps (old)', version: '0.9.0', appDir: '/opt/apps/colleps', mainFile: '/opt/apps/colleps/main.js', commandName: 'ui.colleps' });
        fs.writeFileSync('/etc/pkg/installed.json', JSON.stringify(snap));
    });
    await reboot();
    const migrated = await page.evaluate(() => { try { return JSON.parse(window.fs.readFileSync('/opt/apps/colleps/app.json', 'utf8')); } catch (_) { return null; } });
    check('an old install gets an app.json from its record', !!migrated && migrated.version === '0.9.0' && migrated.name === 'Colleps (old)', JSON.stringify(migrated));
    check('and loads', await has('ui.colleps'));

    // ── A manifest can't point outside its folder ──
    await page.evaluate(() => {
        const fs = window.fs;
        fs.writeFileSync('/home/user1/evil.js', 'window.top.__evilApp = 1');
        fs.mkdirSync('/opt/apps/evil-app');
        fs.writeFileSync('/opt/apps/evil-app/app.json', JSON.stringify({ id: 'evil-app', main: '../../home/user1/evil.js' }));
    });
    await reboot();
    const evil = await page.evaluate(() => window.top.__evilApp);
    check('a main file outside the app folder is neither listed nor run', evil === undefined && !(await ids()).includes('evil-app'));

    check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (err) {
    failed++;
    console.log('FAIL  unexpected error —', err.message);
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
