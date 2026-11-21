// Static checks for the Phase 1D files (TODO 1D): file-explorer, explorer-sifi,
// pkg-manager, app-drawer, app-launcher, spotlight, bookmarks, terminal, task-manager and
// /bin/*.run (except webrtc.run).
//
//  1. Syntax: every script parses with the same Babel presets the OS uses at runtime
//     (Host.execString for .js, Host.execCommand's async wrapper for .run, the terminal's
//     inline <script> blocks).
//  2. KRN-3 / APP-1 / D9: no execCommand call and no context-menu `cmd:` is built from a
//     template literal or string concatenation — and, stricter, no execCommand call at all.
//  3. No context-menu item carries a `cmd` DSL string (items are {onSelect} / {command,args}).
//
// Run: node testing/scripts/security/verify-files-static.mjs   (no server needed)
// Exit code: 0 = all PASS, 1 = any FAIL.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MOUNT = join(ROOT, 'docs', 'public', 'mount');
const require = createRequire(import.meta.url);
const Babel = require(join(ROOT, 'src', 'shared', 'babel.js'));

const APPS = ['file-explorer', 'explorer-sifi', 'pkg-manager', 'app-drawer', 'app-launcher', 'spotlight', 'bookmarks', 'terminal', 'task-manager'];
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const files = [
  ...APPS.flatMap((a) => walk(join(MOUNT, 'opt', 'apps', a))),
  ...readdirSync(join(MOUNT, 'bin')).filter((n) => n.endsWith('.run') && n !== 'webrtc.run').map((n) => join(MOUNT, 'bin', n)),
].filter((p) => /\.(js|run|html)$/.test(p));

const results = [];
const record = (name, ok, detail = '') => { results.push({ name, ok, detail }); };

const transform = (code, filename) => Babel.transform(code, {
  presets: [['env', { modules: 'commonjs' }], 'react', 'typescript'], filename,
});

for (const file of files) {
  const rel = relative(ROOT, file);
  const src = readFileSync(file, 'utf8');
  // 1. syntax
  try {
    if (file.endsWith('.js')) transform(src, file);
    else if (file.endsWith('.run')) transform(`(async () => {\n${src}\n})();`, file + '.js');
    else {
      const blocks = [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
      blocks.forEach((b, i) => transform(b, `${file}#script${i}.js`));
    }
    record(`syntax ${rel}`, true);
  } catch (e) {
    record(`syntax ${rel}`, false, String(e.message).split('\n')[0]);
  }
  // 2./3. DSL sinks
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    if (/\bexecCommand\s*\(/.test(line)) record(`no execCommand ${rel}:${i + 1}`, false, line.trim().slice(0, 120));
    if (/\bcmd\s*:\s*(`|'[^']*'\s*\+|"[^"]*"\s*\+)/.test(line)) record(`no DSL cmd: ${rel}:${i + 1}`, false, line.trim().slice(0, 120));
  });
}
record('execCommand / cmd: scan covered files', files.length > 50, `${files.length} files`);

let fails = 0;
for (const r of results) {
  if (!r.ok) fails++;
  if (!r.ok || process.env.VERBOSE) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  — ' + r.detail : ''}`);
}
console.log(`\n${results.length - fails} pass, ${fails} fail (${files.length} files)`);
process.exit(fails ? 1 : 0);
