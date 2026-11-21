// Implicit Function Visualizer: installs from the built-in registry through App Manager
// (sha256-verified, no prompt), opens in the opaque sandbox, plots F(x, y) = c and
// F(x, y, z) = c, probes, reports bad input, and keeps each mode's settings.
// Usage: node testing/scripts/test-implicit-function-visualizer.mjs   (dev server on :8080)
import { launch, bootReady, findFrame, pollFor, closeAllWindows, installDialogs, sleep } from './security/verify-files-lib.mjs';

const APP = 'Implicit Function Visualizer';
const ID = 'implicit-function-visualizer';
let failed = 0;
const check = (name, ok, detail = '') => {
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await bootReady(context);
const dialogs = installDialogs(page);
const errors = [];
page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text().slice(0, 200)); });
page.on('pageerror', e => errors.push(String(e.message).slice(0, 200)));

try {
    // 1. Install through App Manager, exactly as a user would.
    await page.evaluate(n => window.platform.host.openWindow('ui.pkg-manager', n), APP);
    const pm = await findFrame(page, `.pkg-card .pkg-card-name:text-is(${JSON.stringify(APP)})`, { timeout: 20000 });
    check('App Manager lists the app from the registry', !!pm);
    const card = pm.locator('.pkg-card').filter({ has: pm.locator(`.pkg-card-name:text-is(${JSON.stringify(APP)})`) }).first();
    await card.locator('button', { hasText: 'Install' }).first().click({ force: true });
    await pollFor(async () => !(await card.locator('button', { hasText: /Installing/ }).count()), { timeout: 20000 });
    await sleep(500);
    const installed = await page.evaluate(id => {
        const list = JSON.parse(window.fs.readFileSync('/etc/pkg/installed.json', 'utf8') || '[]');
        return { recorded: list.some(p => p.id === id), files: ['main.js', 'main.html'].every(f => window.fs.existsSync(`/opt/apps/${id}/${f}`)) };
    }, ID);
    check('installs with verified hashes and no prompt', installed.recorded && installed.files && dialogs.log.length === 0, JSON.stringify({ ...installed, dialogs: dialogs.log }));
    check('registers its command', await page.evaluate(() => !!window.platform.host.getCommand('ui.implicit-function-visualizer')));

    // 2. Open it.
    await closeAllWindows(page);
    await page.evaluate(() => window.platform.host.openWindow('ui.implicit-function-visualizer'));
    const f = await findFrame(page, '#mode2d', { timeout: 20000 });
    check('opens a window with the app', !!f);
    const title = await page.evaluate(() => [...document.querySelectorAll('.window')].pop()?.querySelector('.window-header')?.textContent || '');
    check('window title', title.includes(APP), title.trim().slice(0, 60));

    const status = () => f.evaluate(() => ({ text: document.getElementById('status').textContent, error: document.getElementById('status').classList.contains('error'), info: document.getElementById('surfaceInfo').textContent }));
    const waitPlotted = () => pollFor(async () => { const s = await status(); return s.text !== 'Computing…' && s.text !== 'Ready' ? s : null; }, { timeout: 30000 });

    const env = await f.evaluate(() => {
        let storage = 'accessible';
        try { localStorage.length; } catch (_) { storage = 'blocked'; }
        return { origin: self.origin, platform: typeof window.platform, storage };
    });
    check('runs in the opaque sandbox (no platform, no storage)', env.origin === 'null' && env.platform === 'undefined' && env.storage === 'blocked', JSON.stringify(env));

    // 3. Two variables.
    let s = await waitPlotted();
    check('2 variables: default x^2 + y^2 = 25 plots a surface', s && !s.error && /triangles/.test(s.info), JSON.stringify(s));

    const probe = await f.evaluate(async () => {
        const c = document.querySelector('#canvasHost canvas');
        const r = c.getBoundingClientRect();
        // Sweep a few points until one lands on the XY plane inside the domain.
        for (const [fx, fy] of [[0.5, 0.6], [0.5, 0.7], [0.45, 0.65], [0.55, 0.55], [0.5, 0.5]]) {
            c.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + r.width * fx, clientY: r.top + r.height * fy, bubbles: true }));
            await new Promise(res => setTimeout(res, 50));
            const p = document.getElementById('probe');
            if (!p.hidden) return p.textContent;
        }
        return '';
    });
    check('2 variables: hover probe reads F(x, y)', /F\(x, y\):/.test(probe), probe.replace(/\n/g, ' | '));

    await f.click('#examples button:text-is("Lemniscate")', { force: true });
    s = await waitPlotted();
    check('2 variables: an example plots', s && !s.error && /triangles/.test(s.info), JSON.stringify(s));

    await f.fill('#equation', 'x + q = 1');
    await f.click('#plot', { force: true });
    s = await waitPlotted();
    check('unknown symbol is reported, not evaluated', s && s.error && /Unknown symbol: q/.test(s.text), s?.text);

    await f.fill('#equation', 'x + z = 1');
    await f.click('#plot', { force: true });
    s = await waitPlotted();
    check('z with 2 variables points at the 3-variable mode', s && s.error && /3 variables/.test(s.text), s?.text);

    await f.fill('#equation', 'y = sin(x)');
    await f.click('#plot', { force: true });
    s = await waitPlotted();
    check('2 variables: y = sin(x) plots', s && !s.error, s?.text);

    // 4. Three variables.
    await f.click('#mode3d', { force: true });
    s = await waitPlotted();
    const ui3d = await f.evaluate(() => ({
        equation: document.getElementById('equation').value,
        zVisible: getComputedStyle(document.getElementById('zmin')).display !== 'none' && document.getElementById('zmin').offsetParent !== null,
        firstExample: document.querySelector('#examples button')?.textContent,
    }));
    check('3 variables: default sphere plots an isosurface', s && !s.error && /vertices/.test(s.info), JSON.stringify(s));
    check('3 variables: z domain and 3D examples shown', ui3d.zVisible && ui3d.firstExample === 'Sphere' && ui3d.equation === 'x^2 + y^2 + z^2 = 25', JSON.stringify(ui3d));

    await f.check('#showSlice', { force: true });
    await sleep(300);
    s = await status();
    check('3 variables: slice plane builds without error', !s.error, s.text);

    await f.selectOption('#colorMode', 'gradient');
    s = await waitPlotted();
    check('3 variables: gradient coloring plots', s && !s.error && /vertices/.test(s.info), JSON.stringify(s));

    await f.fill('#level', '100');
    await f.dispatchEvent('#level', 'change');
    s = await waitPlotted();
    check('3 variables: a level outside the range says no surface', s && s.error && /No surface/.test(s.text), s?.text);

    // 5. Back to two variables: its settings are kept.
    await f.click('#mode2d', { force: true });
    s = await waitPlotted();
    const back = await f.evaluate(() => document.getElementById('equation').value);
    check('switching back restores the 2-variable equation', back === 'y = sin(x)' && s && !s.error, back);

    // 6. Rotation. Real mouse drags on the canvas; after each step, read the camera's
    //    viewing direction. Passing over a pole flips the direction's horizontal part.
    const box = await (await f.frameElement()).boundingBox();
    const rect = await f.evaluate(() => { const r = document.querySelector('#canvasHost canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    const cx = box.x + rect.x + rect.w / 2, cy = box.y + rect.y + rect.h * 0.3;
    const view = () => f.evaluate(() => {
        const { camera, controls } = window.__implicitViz;
        const d = camera.position.clone().sub(controls.target).normalize();
        return { x: d.x, y: d.y, z: d.z, upz: camera.up.z };
    });
    const dragDown = async (pixels, steps = 24) => {
        await f.click('#resetCamera', { force: true });
        await sleep(400);
        const start = await view();
        const h = Math.hypot(start.x, start.y);
        const samples = [];
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        for (let i = 1; i <= steps; i++) {
            await page.mouse.move(cx, cy + pixels * i / steps);
            await sleep(40);
            samples.push(await view());
        }
        await page.mouse.up();
        await sleep(500);
        samples.push(await view());
        const side = samples.map(s => (s.x * start.x + s.y * start.y) / h); // + = start side, − = over the pole
        return { start, samples, minSide: Math.min(...side), maxZ: Math.max(...samples.map(s => Math.abs(s.z))), minUpZ: Math.min(...samples.map(s => s.upz)) };
    };

    const free = await dragDown(rect.h * 0.5);
    check('free rotation (default) passes over the z pole', free.maxZ > 0.95 && free.minSide < -0.2,
        `max |dir·z| ${free.maxZ.toFixed(3)}, most-opposite side ${free.minSide.toFixed(3)}`);
    await f.click('#resetCamera', { force: true });
    await sleep(400);
    const reset = await view();
    check('reset camera restores z up after free rotation', Math.abs(reset.upz - 1) < 1e-6, `up.z ${reset.upz}`);

    await f.selectOption('#rotationMode', 'turntable');
    const turn = await dragDown(rect.h * 0.5);
    check('turntable keeps the z axis up and stops at the pole', turn.minSide > -0.02 && turn.minUpZ > 0.999,
        `most-opposite side ${turn.minSide.toFixed(3)}, min up.z ${turn.minUpZ.toFixed(3)}`);
    await f.selectOption('#rotationMode', 'free');

    check('no console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (err) {
    failed++;
    console.log('FAIL  unexpected error —', err.message);
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
