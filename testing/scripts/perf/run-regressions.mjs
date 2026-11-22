// Runs the browser regression scripts against one server (usually a static server of the
// production build, like GitHub Pages): every testing/scripts/security/verify-*.mjs, the
// app tests and the boot-loading test. Prints one line per script and the failures' tails.
// Usage: node testing/scripts/perf/run-regressions.mjs [port=8090] [--jobs 3] [filter]
//        (serve docs/ first: node testing/scripts/perf/static-server.mjs 8090)
import { spawn } from 'node:child_process';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);
const jobsAt = args.indexOf('--jobs');
const jobs = jobsAt >= 0 ? Number(args.splice(jobsAt, 2)[1]) : 3;
const port = /^\d+$/.test(args[0] || '') ? args.shift() : '8090';
const filter = args[0] ? new RegExp(args[0]) : null;
const url = `http://localhost:${port}`;

const security = readdirSync(join(ROOT, 'testing/scripts/security'))
    .filter(n => /^verify-.*\.mjs$/.test(n) && !n.endsWith('-lib.mjs'))
    .map(n => `testing/scripts/security/${n}`);
const scripts = [
    ...security,
    'testing/scripts/test-implicit-function-visualizer.mjs',
    'testing/scripts/test-demo-project-sandboxed.mjs',
    'testing/scripts/test-temp-html-demo.mjs',
    'testing/scripts/test-default-apps.mjs',
    'testing/scripts/test-settings-sections.mjs',
    'testing/scripts/test-appearance.mjs',
    'testing/scripts/test-force-reload-source.mjs',
    'testing/scripts/perf/test-boot-loading.mjs',
].filter(s => !filter || filter.test(s));

const run = (script) => new Promise(resolve => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [script], {
        cwd: ROOT,
        env: { ...process.env, OS_URL: url, BASE_URL: url, PORT: port },
    });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    const timer = setTimeout(() => { out += '\n[timed out after 6 min]'; child.kill('SIGKILL'); }, 6 * 60 * 1000);
    child.on('close', code => {
        clearTimeout(timer);
        resolve({ script, code, ms: Date.now() - t0, out });
    });
});

const queue = [...scripts];
const results = [];
await Promise.all(Array.from({ length: Math.max(1, jobs) }, async () => {
    for (let s; (s = queue.shift());) {
        const r = await run(s);
        results.push(r);
        const passes = (r.out.match(/^\s*(PASS|ok)\b/gm) || []).length;
        const fails = (r.out.match(/^\s*(FAIL|not ok)\b/gm) || []).length;
        console.log(`${r.code === 0 ? 'PASS' : 'FAIL'}  ${s.replace('testing/scripts/', '')}  (${(r.ms / 1000).toFixed(0)}s, ${passes} pass, ${fails} fail, exit ${r.code})`);
    }
}));

const failed = results.filter(r => r.code !== 0);
for (const r of failed) {
    console.log(`\n── ${r.script} (exit ${r.code})`);
    const lines = r.out.trim().split('\n');
    console.log(lines.filter(l => /FAIL|Error|error|timed out/.test(l)).slice(0, 12).join('\n') || lines.slice(-12).join('\n'));
}
mkdirSync(join(ROOT, 'testing/scripts/perf/results'), { recursive: true });
writeFileSync(join(ROOT, 'testing/scripts/perf/results/regressions.json'),
    JSON.stringify(results.map(({ script, code, ms, out }) => ({ script, code, ms, out })), null, 1));
console.log(`\n${results.length - failed.length}/${results.length} scripts passed`);
process.exit(failed.length ? 1 : 0);
