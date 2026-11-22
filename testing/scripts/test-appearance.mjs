// Appearance mode (Settings › Window Manager › Themes): System / Dark / Light / Time.
//   - the default is System, which follows the browser's prefers-color-scheme;
//   - the segmented control switches Settings, Files and the glass window material
//     live, and the choice persists across a reload;
//   - Time is light 07:00–19:00 and dark otherwise;
//   - Settings and Files windows use the glass material, and their text stays
//     readable (dark text in light mode, light text in dark mode).
// Usage: BASE_URL=http://localhost:8090 node testing/scripts/test-appearance.mjs
//        (a static server of docs/: node testing/scripts/perf/static-server.mjs 8090)
import { chromium } from 'playwright';

const BASE = (process.env.BASE_URL || 'http://localhost:8090').replace(/\/$/, '');
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
const settled = (page) => until(() => page.evaluate(() => { const s = document.getElementById('wos-background-spinner'); return s && !s.classList.contains('active'); }), 60000);
const frameWith = (page, sel, timeout = 20000) => until(async () => {
    for (const f of page.frames()) if (await f.locator(sel).count().catch(() => 0)) return f;
    return null;
}, timeout);
const topAppearance = (page) => page.evaluate(() => document.documentElement.getAttribute('data-appearance'));
// Click a segment in Settings even when another window overlaps it on screen.
const pick = (f, label) => f.locator('.vs-segment', { hasText: label }).evaluate(el => el.click());
const frameAppearance = (f) => f.evaluate(() => document.documentElement.getAttribute('data-appearance'));
// Relative luminance of an element's computed text color (0 = black, 1 = white).
const textLuminance = (f, sel) => f.evaluate((s) => {
    const c = getComputedStyle(document.querySelector(s)).color.match(/[\d.]+/g).map(Number);
    return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
}, sel);

const browser = await chromium.launch();
const errors = [];

try {
    // ── Default: System follows the browser ──
    for (const scheme of ['dark', 'light']) {
        const ctx = await browser.newContext({ colorScheme: scheme });
        const p = await ctx.newPage();
        await p.goto(BASE);
        await booted(p);
        const mode = await p.evaluate(() => window.platform.host.callCommand('get-appearance-mode'));
        check(`default mode is System and follows a ${scheme} browser`, mode.mode === 'system' && (await topAppearance(p)) === scheme, JSON.stringify(mode));
        await ctx.close();
    }

    const context = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1400, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(String(e.message).slice(0, 160)));
    await page.goto(BASE);
    await booted(page);
    await settled(page);

    await page.evaluate(() => window.platform.host.openWindow('ui.settings', '06-window-manager'));
    const s = await frameWith(page, '.vs-segmented');
    check('Settings shows the System / Dark / Light / Time control', !!s);
    const segments = s ? (await s.locator('.vs-segment').allTextContents()).map(t => t.replace(/^[a-z_]+/, '').trim()) : [];
    check('the control lists System, Dark, Light, Time', JSON.stringify(segments) === JSON.stringify(['System', 'Dark', 'Light', 'Time']), JSON.stringify(segments));
    check('System is selected by default', s && (await s.locator('.vs-segment.active').textContent()).includes('System'));

    await page.evaluate(() => window.platform.host.openWindow('explorer', '/home/user1'));
    const f = await frameWith(page, '.file-explorer .file-name');
    const glass = await page.evaluate(() => [...document.querySelectorAll('.window')].map(w => w.classList.contains('material-glass')));
    check('Settings and Files windows use the glass material', glass.length >= 2 && glass.every(Boolean), JSON.stringify(glass));

    // ── Light ──
    await pick(s, 'Light');
    await sleep(400);
    check('choosing Light switches the desktop, Settings and Files', (await topAppearance(page)) === 'light' && (await frameAppearance(s)) === 'light' && (await frameAppearance(f)) === 'light');
    check('light mode: Files text is dark', (await textLuminance(f, '.file-name')) < 0.3);
    check('light mode: Settings text is dark', (await textLuminance(s, '.settings-page-title')) < 0.3);

    // ── Dark ──
    await pick(s, 'Dark');
    await sleep(400);
    check('choosing Dark switches everything back', (await topAppearance(page)) === 'dark' && (await frameAppearance(s)) === 'dark' && (await frameAppearance(f)) === 'dark');
    check('dark mode: Files text is light', (await textLuminance(f, '.file-name')) > 0.8);

    // ── App Manager and Terminal follow too ──
    await page.evaluate(() => window.platform.host.openWindow('ui.pkg-manager'));
    await page.evaluate(() => window.platform.host.openWindow('ui.terminal'));
    const pm = await frameWith(page, '.pkg-root');
    const term = await frameWith(page, '.xterm-rows', 30000);
    const glassAll = await page.evaluate(() => [...document.querySelectorAll('.window')].every(w => w.classList.contains('material-glass')));
    check('App Manager and Terminal windows use the glass material', glassAll && !!pm && !!term);
    await pick(s, 'Light');
    await sleep(400);
    const termTheme = await term.evaluate(() => window.__terminalApp.sessions[0].terminal.options.theme.foreground);
    check('light mode reaches App Manager and Terminal', (await frameAppearance(pm)) === 'light' && (await frameAppearance(term)) === 'light' && termTheme === '#1c1c1e', termTheme);
    check('light mode: App Manager text is dark', (await textLuminance(pm, '.pkg-title')) < 0.3);
    await pick(s, 'Dark');
    await sleep(400);
    check('dark mode reaches Terminal', (await term.evaluate(() => window.__terminalApp.sessions[0].terminal.options.theme.foreground)) !== '#1c1c1e');

    // ── Light persists across a reload, even with a dark browser ──
    await pick(s, 'Light');
    await sleep(1500);
    await page.reload();
    await booted(page);
    check('the chosen mode persists across a reload', (await topAppearance(page)) === 'light');
    await page.evaluate(() => window.platform.host.callCommand('set-appearance-mode', 'system'));
    check('back to System follows the (dark) browser', (await topAppearance(page)) === 'dark');
    check('an unknown mode is refused', (await page.evaluate(() => window.platform.host.callCommand('set-appearance-mode', 'purple'))) === false);
    await context.close();

    // ── Time: light 07:00–19:00 ──
    for (const [hour, expected] of [[10, 'light'], [22, 'dark']]) {
        const ctx = await browser.newContext({ colorScheme: 'dark' });
        const p = await ctx.newPage();
        await p.clock.setFixedTime(new Date(2026, 10, 22, hour, 0, 0));
        await p.goto(BASE);
        await booted(p);
        await p.evaluate(() => window.platform.host.callCommand('set-appearance-mode', 'time'));
        check(`Time mode at ${hour}:00 is ${expected}`, (await topAppearance(p)) === expected, await topAppearance(p));
        await ctx.close();
    }

    check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (err) {
    failed++;
    console.log('FAIL  unexpected error —', err.message);
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
