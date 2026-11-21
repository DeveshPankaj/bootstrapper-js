// Checks that the CDN libraries given SRI hashes at integration still load:
// xterm + fit addon in Remote Machines, CodeMirror 5 in Distributed Compute.
// Usage: node testing/scripts/security/verify-integration-sri.mjs
import { launch, bootOS } from './spike-lib.mjs';

const browser = await launch();
const context = await browser.newContext();
context.on('page', pg => pg.on('dialog', d => d.dismiss().catch(() => {})));
const page = await bootOS(context);
const blocked = [];
page.on('console', m => { if (/integrity|SRI|Failed to find a valid digest/i.test(m.text())) blocked.push(m.text()); });

const probe = async (command, expr) => {
    await page.evaluate(c => window.platform.host.openWindow(c), command);
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        for (const f of page.frames()) {
            const ok = await f.evaluate(expr).catch(() => false);
            if (ok) return true;
        }
        await page.waitForTimeout(500);
    }
    return false;
};

const results = [
    ['Remote Machines: xterm + FitAddon loaded', await probe('ui.remote-machines', () => typeof window.Terminal === 'function' && typeof window.FitAddon === 'object')],
    ['Distributed Compute: CodeMirror loaded', await probe('ui.distributed-compute', () => typeof window.CodeMirror === 'function')],
    ['no SRI violations in the console', blocked.length === 0],
];
for (const [name, ok] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
if (blocked.length) console.log(blocked.join('\n'));
await browser.close();
process.exit(results.every(r => r[1]) ? 0 : 1);
