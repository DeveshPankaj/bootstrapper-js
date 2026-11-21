// Runs every testing/scripts/security/test-*.mjs (not spike-* / verify-*), collects their
//   RESULT <FINDING-ID> <PASS|FAIL|ERROR> [<phase>] <check> :: <detail>
// lines and writes a table keyed by finding ID to results/<label>.json and results/<label>.md
// (per-script logs in results/<label>/). Phase-2 / info checks are reported separately and never
// count as phase-1 failures.
//
// Usage: node testing/scripts/security/run-all.mjs [label] [--only a,b] [--jobs N] [--timeout ms]
//   BASE_URL (env) = the OS under test, default http://localhost:8080
// Exit code: 0 = every phase-1 check passed, 1 = a phase-1 check failed/errored or a script crashed.
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(name); if (i < 0) return def; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const only = opt('--only', '');
const jobs = Math.max(1, Number(opt('--jobs', '2')) || 2);
const timeoutMs = Number(opt('--timeout', String(12 * 60 * 1000)));
// --root <dir>: the source tree the static checks scan (e.g. the baseline worktree); default this repo.
const root = opt('--root', process.env.SECURITY_REPO_ROOT || '');
const label = (argv.find((a) => !a.startsWith('--')) || 'run').replace(/[^\w.-]/g, '_');
const BASE_URL = (process.env.BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');

let scripts = readdirSync(HERE).filter((f) => /^test-.*\.mjs$/.test(f)).sort();
if (only) { const want = only.split(',').map((s) => s.trim().replace(/\.mjs$/, '')); scripts = scripts.filter((s) => want.includes(s.replace(/\.mjs$/, ''))); }

const OUT = join(HERE, 'results');
const LOGS = join(OUT, label);
mkdirSync(LOGS, { recursive: true });

const RESULT_RE = /^RESULT\s+(\S+)\s+(PASS|FAIL|ERROR)\s+\[(\w+)\]\s+(.*)$/;
const runs = [];

function runOne(script) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [join(HERE, script)], { env: { ...process.env, BASE_URL, ...(root ? { SECURITY_REPO_ROOT: root } : {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      const ms = Date.now() - t0;
      writeFileSync(join(LOGS, script.replace(/\.mjs$/, '.log')), out + (err ? '\n--- stderr ---\n' + err : ''));
      const results = [];
      for (const line of out.split('\n')) {
        const m = line.match(RESULT_RE);
        if (!m) continue;
        const [check, ...rest] = m[4].split(' :: ');
        results.push({ id: m[1], status: m[2], phase: m[3], check: check.trim(), detail: rest.join(' :: ').trim(), script });
      }
      const run = { script, code, timedOut, ms, results, stderrTail: err.split('\n').filter(Boolean).slice(-5).join(' | ').slice(0, 600) };
      runs.push(run);
      const c = (s) => results.filter((r) => r.status === s).length;
      console.log(`[${label}] ${script.padEnd(28)} ${timedOut ? 'TIMEOUT' : 'exit ' + code}  ${Math.round(ms / 1000)}s  pass=${c('PASS')} fail=${c('FAIL')} error=${c('ERROR')}`);
      resolve(run);
    });
  });
}

console.log(`[${label}] BASE_URL=${BASE_URL}  root=${root || '(this repo)'}  scripts=${scripts.length}  jobs=${jobs}`);
const queue = scripts.slice();
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => { while (queue.length) await runOne(queue.shift()); }));
runs.sort((a, b) => a.script.localeCompare(b.script));

// ── aggregate by finding ID (and phase) ────────────────────────────────────
const all = runs.flatMap((r) => r.results);
const worst = (list) => list.some((r) => r.status === 'FAIL') ? 'FAIL' : list.some((r) => r.status === 'ERROR') ? 'ERROR' : 'PASS';
const idKey = (id) => { const m = id.match(/^([A-Z]+)-?(\d+)?/); return m ? `${m[1]}-${String(m[2] || 0).padStart(4, '0')}` : id; };
const byPhase = {};
for (const r of all) {
  const ph = (byPhase[r.phase] ||= {});
  (ph[r.id] ||= []).push(r);
}
const table = {};
for (const [phase, ids] of Object.entries(byPhase)) {
  table[phase] = Object.keys(ids).sort((a, b) => idKey(a).localeCompare(idKey(b))).map((id) => {
    const list = ids[id];
    return { id, status: worst(list), pass: list.filter((r) => r.status === 'PASS').length, total: list.length,
      failing: list.filter((r) => r.status !== 'PASS').map((r) => `${r.status} ${r.check}`), scripts: [...new Set(list.map((r) => r.script))] };
  });
}
const crashed = runs.filter((r) => r.timedOut || r.code !== 0 || r.results.length === 0);
const phase1Bad = (table.phase1 || []).filter((r) => r.status !== 'PASS');

const summary = {
  label, baseUrl: BASE_URL, root: root || null, finishedAt: new Date().toISOString(),
  totals: Object.fromEntries(Object.entries(table).map(([ph, rows]) => [ph, {
    findings: rows.length, pass: rows.filter((r) => r.status === 'PASS').length, fail: rows.filter((r) => r.status === 'FAIL').length, error: rows.filter((r) => r.status === 'ERROR').length,
    checks: rows.reduce((n, r) => n + r.total, 0), checksPassed: rows.reduce((n, r) => n + r.pass, 0) }])),
  scripts: runs.map((r) => ({ script: r.script, exit: r.code, timedOut: r.timedOut, seconds: Math.round(r.ms / 1000), checks: r.results.length, stderrTail: r.stderrTail })),
  table,
  checks: all,
};
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, `${label}.json`), JSON.stringify(summary, null, 2));

// ── markdown ────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const md = [];
md.push(`# Security suite — ${label}`, '', `- BASE_URL: \`${BASE_URL}\``, `- static checks scanned: \`${root || 'this repo'}\``, `- finished: ${summary.finishedAt}`);
for (const [ph, t] of Object.entries(summary.totals)) md.push(`- **${ph}**: ${t.pass}/${t.findings} findings pass (${t.fail} fail, ${t.error} error); ${t.checksPassed}/${t.checks} checks`);
if (crashed.length) md.push(`- scripts that crashed/timed out/reported nothing: ${crashed.map((r) => r.script).join(', ')}`);
for (const ph of ['phase1', 'phase2', 'info', ...Object.keys(table).filter((p) => !['phase1', 'phase2', 'info'].includes(p))]) {
  if (!table[ph]) continue;
  md.push('', `## ${ph}`, '', '| Finding | Result | Checks passed | Not passing | Script |', '|---|---|---|---|---|');
  for (const r of table[ph]) md.push(`| ${r.id} | ${r.status} | ${r.pass}/${r.total} | ${esc(r.failing.join('; ').slice(0, 300))} | ${r.scripts.join(', ')} |`);
}
md.push('', '## Scripts', '', '| Script | Exit | Seconds | Checks |', '|---|---|---|---|');
for (const s of summary.scripts) md.push(`| ${s.script} | ${s.timedOut ? 'timeout' : s.exit} | ${s.seconds} | ${s.checks} |`);
md.push('', '## All checks', '', '| Finding | Phase | Result | Check | Detail |', '|---|---|---|---|---|');
for (const c of all.slice().sort((a, b) => idKey(a.id).localeCompare(idKey(b.id)))) md.push(`| ${c.id} | ${c.phase} | ${c.status} | ${esc(c.check)} | ${esc(c.detail.slice(0, 240))} |`);
writeFileSync(join(OUT, `${label}.md`), md.join('\n') + '\n');

// ── console table ───────────────────────────────────────────────────────────
for (const ph of Object.keys(table)) {
  console.log(`\n${ph}`);
  for (const r of table[ph]) console.log(`  ${r.id.padEnd(10)} ${r.status.padEnd(6)} ${String(r.pass + '/' + r.total).padEnd(6)} ${r.failing.slice(0, 3).join('; ').slice(0, 110)}`);
}
console.log(`\nwrote results/${label}.json, results/${label}.md`);
process.exit(phase1Bad.length || crashed.length ? 1 : 0);
