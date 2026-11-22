// Default apps: a fresh profile gets only the essential apps (File Explorer, Settings,
// Terminal, Spotlight, Audio Player, App Drawer, plus App Manager and Image Viewer);
// everything else installs from App Manager. A deep link to an app that isn't
// installed (a WebRTC invite) opens App Manager on it, and after Install the link
// opens the app. Installed apps load on the next boot without being downloaded again.
// Usage: BASE_URL=http://localhost:8090 node testing/scripts/test-default-apps.mjs
//        (a static server of docs/: node testing/scripts/perf/static-server.mjs 8090)
import { chromium } from 'playwright';

const BASE = (process.env.BASE_URL || 'http://localhost:8090').replace(/\/$/, '');
const DEFAULT_APPS = ['app-drawer', 'audio-player', 'dock', 'file-explorer', 'image-viewer', 'pkg-manager', 'settings', 'spotlight', 'terminal'];
const DEFAULT_COMMANDS = ['explorer', 'ui.app-drawer', 'spotlight', 'ui.terminal', 'ui.settings', 'ui.audioplayer', 'ui.pkg-manager', 'ui.imageviewer', 'ui.notepad'];
const NOT_DEFAULT = ['ui.webrtc', 'ui.task-manager', 'ui.app-launcher', 'ui.snake-game', 'webamp', 'ui.sqlite', 'ui.distributed-compute', 'ui.remote-machines', 'ui.youtube-player'];

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
const booted = (page) => until(() => page.evaluate(() => document.querySelectorAll('.vfs-desktop-icon').length > 0), 60000);
const settled = (page) => until(() => page.evaluate(() => {
    const s = document.getElementById('wos-background-spinner');
    return s && !s.classList.contains('active');
}), 60000);
const frameWith = (page, selector, timeout = 20000) => until(async () => {
    for (const f of page.frames()) if (await f.locator(selector).count().catch(() => 0)) return f;
    return null;
}, timeout);

const browser = await chromium.launch();
const context = await browser.newContext();
const errors = [];
const watch = (page) => page.on('pageerror', e => errors.push(String(e.message).slice(0, 160)));

try {
    // ── Fresh profile ──
    let page = await context.newPage();
    watch(page);
    await page.goto(BASE);
    check('desktop shows', !!(await booted(page)));
    check('background loading finishes', !!(await settled(page)));

    const commands = await page.evaluate((names) => Object.fromEntries(names.map(n => [n, !!window.platform.host.getCommand(n)])), [...DEFAULT_COMMANDS, ...NOT_DEFAULT]);
    const missing = DEFAULT_COMMANDS.filter(n => !commands[n]);
    const extra = NOT_DEFAULT.filter(n => commands[n]);
    check('default apps are registered', missing.length === 0, missing.join(', '));
    check('other apps are not registered', extra.length === 0, extra.join(', '));

    const apps = await page.evaluate(() => window.fs.readdirSync('/opt/apps').sort());
    check('/opt/apps holds only the default apps', JSON.stringify(apps) === JSON.stringify(DEFAULT_APPS), apps.join(' '));
    const installed = await page.evaluate(() => JSON.parse(window.fs.readFileSync('/etc/pkg/installed.json', 'utf8')).map(p => p.id).sort());
    check('installed.json lists the default apps', installed.length === 8 && !installed.includes('webrtc'), installed.join(' '));

    // ── A link to an app that isn't installed ──
    await sleep(1500); // let the IndexedDB mirror flush before the tab closes
    await page.close();
    page = await context.newPage();
    watch(page);
    const requests = [];
    page.on('request', r => requests.push(r.url()));
    await page.goto(`${BASE}/#open=ui.webrtc&app=webrtc&arg=`);
    await booted(page);
    const name = '.pkg-card-name:text-is("WebRTC Chat")';
    const pm = await frameWith(page, `.pkg-card ${name}`, 30000);
    check('link to a missing app opens App Manager on it', !!pm);
    check('the link alone installs nothing', !(await page.evaluate(() => window.fs.existsSync('/opt/apps/webrtc'))));
    if (pm) {
        const search = await pm.locator('input').first().inputValue().catch(() => '');
        check('App Manager is filtered to the app', search === 'webrtc', JSON.stringify(search));
        const c = pm.locator('.pkg-card').filter({ has: pm.locator(name) }).first();
        await c.locator('button', { hasText: 'Install' }).first().click({ force: true });
        const opened = await until(() => page.evaluate(() => !!document.querySelector('.window[data-name="ui.webrtc"]')), 30000);
        check('after Install, the link opens the app', !!opened);
    }
    const installedNow = await page.evaluate(() => JSON.parse(window.fs.readFileSync('/etc/pkg/installed.json', 'utf8')).some(p => p.id === 'webrtc'));
    check('the app is recorded as installed', installedNow);

    // ── Next boot: loads from the vfs, no download ──
    await sleep(1500);
    requests.length = 0;
    await page.goto(BASE);
    await booted(page);
    const registered = await until(() => page.evaluate(() => !!window.platform.host.getCommand('ui.webrtc')), 20000);
    check('installed app loads on the next boot', !!registered);
    await sleep(2000);
    const fetched = requests.filter(u => u.includes('/public/mount/opt/apps/webrtc/'));
    check('installed app is not downloaded again', fetched.length === 0, fetched.slice(0, 2).join(', '));

    check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (err) {
    failed++;
    console.log('FAIL  unexpected error —', err.message);
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
