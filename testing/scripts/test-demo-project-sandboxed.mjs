// The /home/user1/projects/temp.html demo runs in the opaque sandbox (ui.sandboxed-app)
// using the sandbox SDK (window.ipc): renders, counter works, "temp.js" shows the source,
// and an edit to temp.js re-renders live. It has no window.platform / storage.
// Usage: node testing/scripts/test-demo-project-sandboxed.mjs
import { launch, bootOS } from './security/spike-lib.mjs';

const results = [];
const check = (name, ok, detail = '') => {
    results.push(ok);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await launch();
const context = await browser.newContext();
const page = await bootOS(context);
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

await page.evaluate(() => window.platform.host.exec(window.platform, '/home/user1/projects/temp.html'));

const findFrame = async (text, timeout = 45000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        for (const f of page.frames()) {
            const hit = await f.evaluate(t => document.body?.textContent.includes(t), text).catch(() => false);
            if (hit) return f;
        }
        await page.waitForTimeout(500);
    }
    return null;
};

let frame = await findFrame('Live React Playground');
check('demo renders in a window', !!frame);
if (frame) {
    const env = await frame.evaluate(() => {
        let storage = 'accessible';
        try { localStorage.length; } catch (_) { storage = 'blocked'; }
        return { origin: self.origin, platform: typeof window.platform, ipc: typeof window.ipc, storage };
    });
    check('runs in an opaque sandbox (origin null, no platform, no storage)',
        env.origin === 'null' && env.platform === 'undefined' && env.storage === 'blocked', JSON.stringify(env));
    check('has the sandbox SDK (window.ipc)', env.ipc === 'object');

    await frame.click('.counter-btn');
    await frame.click('.counter-btn');
    const counter = await frame.evaluate(() => document.querySelector('.counter-btn')?.innerText);
    check('counter increments', /Clicked 2 times/.test(counter || ''), counter);

    const before = await page.evaluate(() => document.querySelectorAll('.window[data-name="ui.notepad"]').length);
    await frame.click('.edit-link');
    let opened = false;
    for (let i = 0; i < 20 && !opened; i++) {
        await page.waitForTimeout(400);
        opened = await page.evaluate(n => document.querySelectorAll('.window[data-name="ui.notepad"]').length > n, before);
    }
    check('"temp.js" link opens the file in Notepad', opened);

    await page.waitForTimeout(1100); // editor.open is throttled to one request per second
    const outside = await frame.evaluate(() => window.ipc.editor.open('/etc/crontab').then(() => 'opened', e => String(e.message || e)));
    check('editor.open refuses a file outside the page\'s folder', /permission denied/.test(outside), outside);

    await page.evaluate(() => {
        const p = '/home/user1/projects/temp.js';
        const src = window.fs.readFileSync(p, 'utf-8');
        window.fs.writeFileSync(p, src.replace("This is Babel and React's magic!", 'Edited live in the sandbox!'));
    });
    frame = await findFrame('Edited live in the sandbox!', 15000);
    check('editing temp.js re-renders live', !!frame);
}
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed} pass, ${failed} fail`);
process.exit(failed ? 1 : 0);
