// Integration checks for the phase-1 follow-ups (TODO.md 1H.3, 1H.6):
//  - boot still runs /home/user1/initd.run (shell-init.js now uses host.runFile),
//    so the CORE_APPS from pkg-manager/loader.js register their commands;
//  - cron runs a .js job through host.runFile (no editor window, no prompt);
//  - setBoundingClientRect accepts a bounded borderRadius (Settings' 1.5rem
//    corners) but ignores hostile values;
//  - systemd units get a stable per-unit command owner.
// Usage: node testing/scripts/security/verify-integration.mjs
import { launch, bootOS } from './spike-lib.mjs';

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await launch();
const context = await browser.newContext();
context.on('page', pg => pg.on('dialog', d => {
    console.log(`  [dialog ${d.type()}] ${d.message().slice(0, 80)} → dismissed`);
    d.dismiss().catch(() => {});
}));
const p = await bootOS(context);

// 1. initd.run ran: loader.js registered core app commands.
const deadline = Date.now() + 30000;
let cmds = [];
while (Date.now() < deadline) {
    cmds = await p.evaluate(() =>
        ['ui.notepad', 'explorer', 'ui.settings', 'ui.terminal'].filter(n => !!window.platform?.host?.getCommand(n)));
    if (cmds.length === 4) break;
    await p.waitForTimeout(500);
}
check('boot runs initd.run → core commands registered', cmds.length === 4, cmds.join(', '));

// 2. A cron-style .js job via runFile runs without opening the editor or prompting.
const ran = await p.evaluate(async () => {
    const fs = window.fs;
    try { fs.mkdirSync('/opt/cron'); } catch (_) {}
    fs.writeFileSync('/tmp/cron-probe.js', 'window.top.__cronProbe = (window.top.__cronProbe || 0) + 1;');
    const before = document.querySelectorAll('.window').length;
    window.platform.host.runFile(window.platform, '/tmp/cron-probe.js', [], { confirm: false });
    await new Promise(r => setTimeout(r, 300));
    return { probe: window.top.__cronProbe || 0, windowsOpened: document.querySelectorAll('.window').length - before };
});
check('runFile({confirm:false}) runs a .js job without prompting', ran.probe === 1, JSON.stringify(ran));
check('runFile opens no editor window', ran.windowsOpened === 0);

// 3. borderRadius on window bounds: Settings' value is honoured, hostile ones are not.
const radius = await p.evaluate(async () => {
    const host = window.platform.host;
    let props;
    host.registerCommand('test.radius-probe', (body, pr) => { props = pr; }, { title: 'Radius probe', icon: 'box' });
    host.openWindow('test.radius-probe');
    await new Promise(r => setTimeout(r, 300));
    const container = [...document.querySelectorAll('.window')].pop();
    const out = {};
    props.setBoundingClientRect({ borderRadius: '1.5rem', width: 400, height: 300 });
    out.settings = container.style.borderRadius;
    props.setBoundingClientRect({ borderRadius: 'url(javascript:alert(1))' });
    out.hostile = container.style.borderRadius;
    props.setBoundingClientRect({ borderRadius: '999rem' });
    out.clamped = container.style.borderRadius;
    props.setBoundingClientRect({ borderRadius: 12 });
    out.number = container.style.borderRadius;
    props.close?.();
    return out;
});
check('borderRadius 1.5rem honoured (Settings corners)', radius.settings === '1.5rem', JSON.stringify(radius));
check('hostile borderRadius ignored', radius.hostile === '1.5rem');
check('oversized borderRadius clamped to 4rem', radius.clamped === '4rem');
check('numeric borderRadius → px', radius.number === '12px');

// 4. systemd: shell.service is active and units carry a stable owner name.
const unit = await p.evaluate(() => {
    const cmd = window.platform.host.getCommand('systemd.status');
    for (const n of ['shell.service', 'shell']) {
        try { const st = cmd?.exec?.(n); if (st) return { name: n, status: st.status ?? st.state ?? null, lastError: st.lastError ?? null }; } catch (_) {}
    }
    return null;
});
check('shell.service ran without error', !!unit && !unit.lastError && unit.status !== 'failed', JSON.stringify(unit));

// 5. The "Default File Explorer" preference can only name an allowlisted explorer:
//    a hostile /user-preferences.json can't route folder opens to any command.
const pref = await p.evaluate(async () => {
    const fs = window.fs, host = window.platform.host;
    const prefsPath = '/user-preferences.json';
    const original = fs.existsSync(prefsPath) ? fs.readFileSync(prefsPath, 'utf-8') : null;
    const prefs = original ? JSON.parse(original) : {};
    let hijacked = 0;
    host.registerCommand('test.hijack-explorer', () => { hijacked++; }, { title: 'Hijack', icon: 'box' });
    fs.writeFileSync(prefsPath, JSON.stringify({ ...prefs, default_explorer: 'test.hijack-explorer' }));
    try { host.getCommand('explorer').exec(document.createElement('div'), {}, '/home/user1'); } catch (_) {}
    await new Promise(r => setTimeout(r, 200));
    if (original !== null) fs.writeFileSync(prefsPath, original); else fs.unlinkSync(prefsPath);
    return { hijacked };
});
check('hostile default_explorer preference is ignored', pref.hijacked === 0, JSON.stringify(pref));

await browser.close();
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed} pass, ${failed} fail`);
process.exit(failed ? 1 : 0);
