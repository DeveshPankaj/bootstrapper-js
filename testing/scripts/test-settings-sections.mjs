// Settings sidebar: each section appears once, however often Settings is opened;
// retired sections (Theme Builder, Example, old stubs) stay gone even when an older
// vfs still holds their files; Managers no longer repeats the Window Manager theme
// controls; "Save as Theme" in Window Manager writes a theme file (name checked,
// taken names refused); Startup Apps lists only installed apps.
// Usage: BASE_URL=http://localhost:8090 node testing/scripts/test-settings-sections.mjs
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

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e.message).slice(0, 160)));

const settingsFrame = () => until(async () => {
    for (const f of page.frames()) if (await f.locator('.settings-nav-item').count().catch(() => 0)) return f;
    return null;
}, 20000);
const openSettings = async () => {
    await page.evaluate(() => window.platform.host.openWindow('ui.settings'));
    const f = await settingsFrame();
    await sleep(1500); // sections register as their scripts load
    return f;
};
const closeSettings = async (f) => {
    await f.locator('.close-button').first().click({ force: true }).catch(() => {});
    await until(() => page.evaluate(() => !document.querySelector('.window[data-name="ui.settings"]')), 5000);
};
const navLabels = async (f) => (await f.locator('.settings-nav-item span:last-child').allTextContents()).map(t => t.trim());
const show = async (f, label) => {
    await f.locator('.settings-nav-item').filter({ has: f.locator('span:last-child', { hasText: new RegExp(`^${label}$`) }) }).first().click({ force: true });
    await sleep(700);
    return f.evaluate(() => document.querySelector('.settings-content').innerText);
};

try {
    await page.goto(BASE);
    await until(() => page.evaluate(() => document.querySelectorAll('.vfs-desktop-icon').length > 0), 60000);
    await until(() => page.evaluate(() => { const s = document.getElementById('wos-background-spinner'); return s && !s.classList.contains('active'); }), 60000);

    // An older install may still hold retired section files in its vfs.
    await page.evaluate(() => {
        const stale = "platform.getService('settings').registerSection('14-theme-builder', (c) => { c.textContent = 'stale' }, { title: 'Theme Builder' })";
        window.fs.writeFileSync('/etc/settings/14-theme-builder.js', stale);
        window.fs.writeFileSync('/etc/settings/99-example.js', stale.replace(/14-theme-builder/g, '99-example').replace('Theme Builder', 'Example'));
    });

    const rounds = [];
    let f;
    for (let i = 0; i < 3; i++) {
        f = await openSettings();
        rounds.push(await navLabels(f));
        if (i < 2) await closeSettings(f);
    }
    const [first] = rounds;
    check('each section appears once', new Set(first).size === first.length, first.join(', '));
    check('reopening Settings adds no sections', rounds.every(r => JSON.stringify(r) === JSON.stringify(first)), rounds.map(r => r.length).join(' → '));
    check('retired sections are gone (even with old files in the vfs)', !first.includes('Theme Builder') && !first.includes('Example'), first.join(', '));
    check('the usual sections are there', ['Wallpaper', 'Window Manager', 'Managers', 'Apps', 'Startup Apps'].every(l => first.includes(l)));

    const managers = await show(f, 'Managers');
    check('Managers has a page title', /^Managers/.test(managers.trim()), managers.slice(0, 60));
    check('Managers no longer repeats themes / appearance / behavior', !/\bTHEME\b|APPEARANCE|BEHAVIOR/.test(managers), managers.slice(0, 120));
    check('Managers keeps window chrome, dock and desktop icons', /WINDOW CHROME/.test(managers) && /\bDOCK\b/.test(managers) && /DESKTOP ICONS/.test(managers));

    const wm = await show(f, 'Window Manager');
    check('Window Manager has themes, appearance, behavior and Save as Theme', ['THEMES', 'APPEARANCE', 'BEHAVIOR', 'SAVE AS THEME'].every(h => wm.toUpperCase().includes(h)));
    const input = f.locator('input[placeholder^="Theme name"]');
    await input.fill('My Theme 1');
    await f.locator('button', { hasText: 'Save' }).first().click({ force: true });
    await sleep(500);
    const saved = await page.evaluate(() => {
        const fs = window.fs;
        const p = '/etc/wm/themes/my-theme-1.json';
        return { exists: fs.existsSync(p), theme: fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null, current: JSON.parse(fs.readFileSync('/etc/wm/current.json', 'utf8')).name };
    });
    check('Save as Theme writes /etc/wm/themes/<slug>.json', saved.exists && saved.theme.name === 'My Theme 1' && !!saved.theme.appearance, JSON.stringify(saved).slice(0, 120));
    check('the saved theme becomes the active one', saved.current === 'My Theme 1', saved.current);
    check('the saved theme is listed', (await f.locator('text=My Theme 1').count()) > 0);
    await input.fill('Dark');
    await f.locator('button', { hasText: 'Save' }).first().click({ force: true });
    await sleep(400);
    check('a taken theme name is refused', (await f.locator('text=already exists').count()) > 0);
    await input.fill('../../evil');
    await f.locator('button', { hasText: 'Save' }).first().click({ force: true });
    await sleep(400);
    const escaped = await page.evaluate(() => ['/etc/evil.json', '/evil.json', '/etc/wm/evil.json'].filter(p => window.fs.existsSync(p)));
    check('a theme name cannot write outside /etc/wm/themes', escaped.length === 0, escaped.join(', '));

    const startup = await show(f, 'Startup Apps');
    check('Startup Apps lists installed apps only', /Audio Player/.test(startup) && !/Task Manager|Bookmarks/.test(startup), startup.slice(0, 200));

    const apps = await show(f, 'Apps');
    check('Apps page renders', /Default File Explorer/i.test(apps), apps.slice(0, 80));

    check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (err) {
    failed++;
    console.log('FAIL  unexpected error —', err.message);
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
