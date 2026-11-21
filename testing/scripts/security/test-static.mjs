// Static repo checks (no browser). Scans SECURITY_REPO_ROOT (env; run-all --root) or this repo.
//
//   KRN-3  (D9)  no execCommand(…) / `cmd:` / DSL template literal interpolates `${…}` (src/, docs/public/mount/)
//   D15          dead src/platform/exec-engine.ts and message-bus.ts are gone
//   WIN-5, APP-14, APP-10, APP-8, NET-5, APP-5, APP-13
//                the innerHTML sinks the audit lists no longer take file names / titles / peer data raw
//   APP-11       CDN <script src> pinned to an exact version + integrity (1F-owned apps = phase1; others = info)
//   NET-12       Webamp not loaded from an unpinned CDN
//   APP-7 / APP-12 / APP-6   mermaid securityLevel strict; ts-ide preview without allow-same-origin;
//                ai-dom-lens page frame without allow-scripts
//   APP-8        TOTP entries no longer stored in localStorage
//   KRN-6 / WIN-1 (phase2)  no app sandbox with allow-scripts + allow-same-origin
//   APP-15 (phase2)          apps don't reach into top./parent.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { report, done } from './lib/harness.mjs';

const ROOT = process.env.SECURITY_REPO_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const APPS = join(ROOT, 'docs/public/mount/opt/apps');
console.log('scanning', ROOT);

const walk = (dir, re, out = []) => {
  let names = [];
  try { names = readdirSync(dir); } catch (_) { return out; }
  for (const n of names) {
    if (n === 'node_modules' || n === '.git') continue;
    const p = join(dir, n);
    let st; try { st = statSync(p); } catch (_) { continue; }
    if (st.isDirectory()) walk(p, re, out); else if (re.test(n)) out.push(p);
  }
  return out;
};
const read = (p) => { try { return readFileSync(p, 'utf8'); } catch (_) { return null; } };
const rel = (p) => relative(ROOT, p);
const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

// Skips a JS string/template literal starting at i (src[i] is the quote); returns the index after it
// and, for templates, the `${…}` expressions inside.
function skipLiteral(src, i) {
  const q = src[i]; const exprs = [];
  i++;
  while (i < src.length && src[i] !== q) {
    if (src[i] === '\\') { i += 2; continue; }
    if (q === '`' && src[i] === '$' && src[i + 1] === '{') {
      let j = i + 2, d = 1;
      while (j < src.length && d) {
        if (src[j] === '`' || src[j] === '"' || src[j] === "'") { const r = skipLiteral(src, j); exprs.push(...r.exprs); j = r.end; continue; }
        if (src[j] === '{') d++; else if (src[j] === '}') d--;
        j++;
      }
      exprs.push(src.slice(i + 2, j - 1));
      i = j; continue;
    }
    if (q !== '`' && src[i] === '\n') break;
    i++;
  }
  return { end: i + 1, exprs };
}
// From `start` (just after `=` or `(`), the text of one expression/argument list up to `;` / the
// closing paren at depth 0. Returns { text, code } where code = non-literal code + template exprs.
function extract(src, start, { untilParen = false } = {}) {
  while (start < src.length && /\s/.test(src[start])) start++; // `x.innerHTML =\n  '<b>' + …`
  let i = start, depth = untilParen ? 1 : 0, code = '';
  const exprs = [];
  while (i < src.length && i - start < 4000) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { const r = skipLiteral(src, i); exprs.push(...r.exprs); code += ' "" '; i = r.end; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    if (c === ')' || c === ']' || c === '}') { depth--; if (untilParen && depth === 0) { i++; break; } if (depth < 0) break; }
    if (!untilParen && depth === 0 && (c === ';' || (c === '\n' && !/[+(,=?:]\s*$/.test(code) && !/^\s*[+.?:]/.test(src.slice(i + 1, i + 80))))) break;
    code += c; i++;
  }
  return { text: src.slice(start, i), code: code + ' ' + exprs.map((e) => '(' + e + ')').join(' '), exprs };
}
const ESCAPE_CALL = /\b(esc\w*|escape\w*|sanitize\w*|DOMPurify\.sanitize|purify\w*|textToHtml|htmlEscape|encodeHTML)\s*\(/;
const stripEscapes = (code) => { let s = code, prev; do { prev = s; s = s.replace(/\b(esc\w*|escape\w*|sanitize\w*|DOMPurify\.sanitize|purify\w*|textToHtml|htmlEscape|encodeHTML)\s*\((?:[^()]|\([^()]*\))*\)/g, ' SAFE '); } while (s !== prev); return s; };
const usesName = (code, name) => new RegExp(`(^|[^\\w$.])${name.replace(/\./g, '\\.').replace(/\$/g, '\\$')}(?![\\w$])`).test(code);

// ── KRN-3 / D9: DSL built from strings ──────────────────────────────────────
{
  const files = [...walk(join(ROOT, 'src'), /\.(ts|tsx|js)$/), ...walk(join(ROOT, 'docs/public/mount'), /\.(js|html|run|mjs)$/)]
    .filter((f) => !/\.test\.|\.min\.js$|\/vendor\//.test(f));
  const offenders = [];
  for (const f of files) {
    const src = read(f); if (!src || !/execCommand|cmd\s*:|service\(|command\(/.test(src)) continue;
    for (const m of src.matchAll(/execCommand\s*\(/g)) {
      const { exprs, code } = extract(src, m.index + m[0].length, { untilParen: true });
      const firstArg = code.split(',')[0];
      const concat = /""\s*\+\s*[\w$(]|[\w$)\]]\s*\+\s*""/.test(firstArg);
      if (exprs.length && /`/.test(src.slice(m.index, m.index + 400).split(',')[0]) || concat) offenders.push(`${rel(f)}:${lineOf(src, m.index)} execCommand`);
    }
    for (const m of src.matchAll(/\bcmd\s*:\s*`/g)) {
      const r = skipLiteral(src, m.index + m[0].length - 1);
      if (r.exprs.length) offenders.push(`${rel(f)}:${lineOf(src, m.index)} cmd-template`);
    }
    for (const m of src.matchAll(/`/g)) {
      const prev = src[m.index - 1];
      if (prev === '\\') continue;
      const r = skipLiteral(src, m.index);
      const body = src.slice(m.index, r.end);
      if (r.exprs.length && /\bservice\s*\(/.test(body) && /\bcommand\s*\(/.test(body) && body.length < 600) {
        const tag = `${rel(f)}:${lineOf(src, m.index)} dsl-template`;
        if (!offenders.some((o) => o.startsWith(`${rel(f)}:${lineOf(src, m.index)} `))) offenders.push(tag);
      }
    }
  }
  const uniq = [...new Set(offenders)];
  // /etc/settings and /etc/widgets scripts aren't in any phase-1 owner's file list (TODO 1A–1F) —
  // reported as their own check so the gap is visible.
  const etc = uniq.filter((o) => /^docs\/public\/mount\/etc\//.test(o));
  const owned = uniq.filter((o) => !etc.includes(o));
  report('KRN-3', owned.length === 0, `${owned.length} interpolated DSL sites: ${owned.slice(0, 25).join(', ')}`, { check: 'static-no-interpolated-dsl' });
  report('KRN-3', etc.length === 0, `${etc.length} interpolated DSL sites in /etc/settings + /etc/widgets scripts (not assigned in TODO 1A–1F): ${etc.slice(0, 15).join(', ')}`, { check: 'static-no-interpolated-dsl-etc-scripts' });
}

// ── D15: dead exec-engine / message-bus ─────────────────────────────────────
{
  const left = ['src/platform/exec-engine.ts', 'src/platform/message-bus.ts'].filter((p) => existsSync(join(ROOT, p)));
  report('D15', left.length === 0, left.length ? 'still present: ' + left.join(', ') : 'removed', { check: 'static-dead-exec-engine-removed' });
}

// ── innerHTML sinks the audit lists ─────────────────────────────────────────
function innerHtmlUses(file, names, { allDynamic = false } = {}) {
  const src = read(file); if (src === null) return { missing: true, hits: [] };
  const hits = [];
  for (const m of src.matchAll(/\.(innerHTML|outerHTML)\s*\+?=(?!=)|insertAdjacentHTML\s*\(/g)) {
    const isCall = m[0].includes('insertAdjacentHTML');
    const { code, text } = extract(src, m.index + m[0].length, { untilParen: isCall });
    const c = stripEscapes(code);
    const bad = allDynamic ? /[\w$)\]]/.test(c.replace(/""|SAFE|\s|[+(),]/g, '')) : names.filter((n) => usesName(c, n));
    if (allDynamic ? bad : bad.length) hits.push(`${rel(file)}:${lineOf(src, m.index)}${allDynamic ? '' : ' [' + bad.join(',') + ']'} ${text.trim().slice(0, 70).replace(/\s+/g, ' ')}`);
  }
  return { missing: false, hits };
}
const SINKS = [
  ['WIN-5', 'src/core/window-manager.ts', ['title', 'meta', 'icon', 'props.icon', 'props.title', 'newTitle', 'command.name', 'command.meta']],
  ['APP-14', 'docs/public/mount/opt/apps/dock/gnome.html', ['label', 'title', 'w.title', 'w.name', 'name', 'icon']],
  ['APP-14', 'docs/public/mount/opt/apps/dock/macos.html', ['w.title', 'w.name', 'label', 'title', 'w.icon']],
  ['APP-14', 'docs/public/mount/opt/apps/audio-player/player.html', ['name', 'title', 'track.name']],
  ['APP-14', 'docs/public/mount/opt/apps/fs-inspector/main.html', ['name', 'entry.name']],
  ['APP-10', 'docs/public/mount/opt/apps/trainboard/main.html', ['run', 'runId', 'metric', 'r.run', 'row.run']],
  ['APP-10', 'docs/public/mount/opt/apps/trainboard/board.html', ['metric', 'run', 'runId']],
  ['APP-8', 'docs/public/mount/opt/apps/totp-auth/main.html', ['e.name', 'e.issuer', 'name', 'issuer', 'entry.name']],
  ['NET-5', 'docs/public/mount/opt/apps/distributed-compute/ui/app.js', ['w.name', 'w.id', 'name']],
];
for (const [id, file, names] of SINKS) {
  const r = innerHtmlUses(join(ROOT, file), names);
  report(id, r.missing ? null : r.hits.length === 0, r.missing ? 'file missing: ' + file : `${r.hits.length} raw sinks in ${file}${r.hits.length ? ': ' + r.hits.slice(0, 5).join(' | ') : ''}`, { check: 'static-innerhtml-' + file.split('/').slice(-2).join('/') });
}
{ // APP-5: marked output must be sanitised
  const f = join(ROOT, 'docs/public/mount/opt/apps/notebook/notebook.html');
  const src = read(f) || '';
  const bad = [];
  for (const m of src.matchAll(/\.innerHTML\s*=(?!=)/g)) {
    const { text } = extract(src, m.index + m[0].length);
    if (/marked\s*\.\s*parse|marked\s*\(/.test(text) && !ESCAPE_CALL.test(text)) bad.push(`${lineOf(src, m.index)} ${text.trim().slice(0, 60)}`);
  }
  report('APP-5', src ? bad.length === 0 : null, `${bad.length} unsanitised marked → innerHTML: ${bad.join(' | ')}`, { check: 'static-notebook-markdown-sanitised' });
}
{ // APP-13: dashboard picker — no inline handlers built from paths
  const f = join(ROOT, 'docs/public/mount/opt/apps/dashboard/dashboard.html');
  const src = read(f) || '';
  const bad = [];
  for (const m of src.matchAll(/`/g)) {
    if (src[m.index - 1] === '\\') continue;
    const r = skipLiteral(src, m.index);
    const body = src.slice(m.index, r.end);
    for (const h of body.matchAll(/\bon[a-z]+\s*=\s*\\?"[^"]*\$\{|\bon[a-z]+\s*=\s*\\?'[^']*\$\{/g)) bad.push(`${lineOf(src, m.index)} ${h[0].slice(0, 50)}`);
  }
  report('APP-13', src ? bad.length === 0 : null, `${new Set(bad).size} inline handlers with interpolation: ${[...new Set(bad)].slice(0, 6).join(' | ')}`, { check: 'static-dashboard-no-inline-handlers' });
}

// ── APP-11 / NET-12: CDN code pinned + SRI ──────────────────────────────────
{
  const OTHER_OWNERS = new Set(['file-explorer', 'explorer-sifi', 'pkg-manager', 'app-drawer', 'app-launcher', 'spotlight', 'bookmarks', 'terminal', 'task-manager',
    'webrtc', 'remote-machines', 'distributed-compute', 'distributed-kv', 'wamp-client', 'youtube-player', 'speed-test', 'vscode-online']);
  const exact = (u) => /@\d+\.\d+\.\d+([-+][\w.]+)?(\/|$)/.test(u) || /\/\d+\.\d+\.\d+\//.test(u) || /[?&]v=\d+\.\d+\.\d+/.test(u);
  const viewers = [], others = [];
  const htmls = [...walk(APPS, /\.html?$/), join(ROOT, 'docs/public/index.html'), join(ROOT, 'docs/404.html'), ...walk(join(ROOT, 'docs/public/mount/home'), /\.html?$/)];
  for (const f of htmls) {
    const src = read(f); if (!src) continue;
    for (const m of src.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']((?:https?:)?\/\/[^"']+)["'][^>]*>/gi)) {
      const url = m[1], tag = m[0];
      const problems = [];
      if (!exact(url)) problems.push('unpinned');
      if (!/\bintegrity\s*=/.test(tag)) problems.push('no-SRI');
      if (!problems.length) continue;
      const app = rel(f).startsWith('docs/public/mount/opt/apps/') ? rel(f).split('/')[5] : rel(f);
      (OTHER_OWNERS.has(app) || !rel(f).startsWith('docs/public/mount/opt/apps/') ? others : viewers).push(`${rel(f)}:${lineOf(src, m.index)} ${problems.join('+')} ${url.slice(0, 70)}`);
    }
  }
  report('APP-11', viewers.length === 0, `${viewers.length} CDN <script src> in 1F-owned apps without exact version+SRI: ${viewers.slice(0, 12).join(' | ')}`, { check: 'static-cdn-pinned-sri-viewer-apps' });
  report('APP-11', others.length === 0, `${others.length} in other apps / pages: ${others.slice(0, 12).join(' | ')}`, { phase: 'info', check: 'static-cdn-pinned-sri-other-apps' });
  const wamp = [join(APPS, 'wamp-client/WAMP.html'), join(APPS, 'wamp-client/main.js')].map((f) => [f, read(f) || '']);
  const unpinned = wamp.flatMap(([f, s]) => [...s.matchAll(/https?:\/\/(unpkg\.com|cdn\.jsdelivr\.net\/npm)\/webamp[^"'`\s)]*/g)].filter((m) => !exact(m[0])).map((m) => `${rel(f)}:${lineOf(s, m.index)} ${m[0]}`));
  report('NET-12', unpinned.length === 0, unpinned.length ? 'unpinned webamp: ' + unpinned.join(' | ') : 'no unpinned webamp URL', { check: 'static-webamp-pinned' });
}

// ── APP-7 / APP-12 / APP-6 ──────────────────────────────────────────────────
{
  const mm = read(join(APPS, 'mermaid-viewer/main.js')) || '';
  const levels = [...mm.matchAll(/securityLevel\s*:\s*['"](\w+)['"]/g)].map((m) => m[1]);
  report('APP-7', levels.length > 0 && levels.every((l) => l === 'strict' || l === 'sandbox'), `securityLevel values: ${JSON.stringify(levels)}`, { check: 'static-mermaid-security-level' });
  const ts = read(join(APPS, 'ts-ide/main.html')) || '';
  const pre = (ts.match(/<iframe[^>]*id=["']iframe-preview["'][^>]*>/) || [''])[0];
  const tsJs = [...ts.matchAll(/setAttribute\(\s*['"]sandbox['"]\s*,\s*['"]([^'"]*)['"]/g)].map((m) => m[1]);
  const sbs = [...((pre.match(/sandbox=["']([^"']*)["']/) || [])[1] !== undefined ? [(pre.match(/sandbox=["']([^"']*)["']/))[1]] : []), ...tsJs];
  report('APP-12', sbs.length > 0 && sbs.every((s) => !/allow-same-origin/.test(s)), `ts-ide preview sandbox values: ${JSON.stringify(sbs)}`, { check: 'static-ts-ide-preview-no-same-origin' });
  const lens = read(join(APPS, 'ai-dom-lens/main.html')) || '';
  const tag = (lens.match(/<iframe[^>]*id=["']pageFrame["'][^>]*>/) || [''])[0];
  const attr = (tag.match(/sandbox=["']([^"']*)["']/) || [])[1];
  const viaJs = [...lens.matchAll(/pageFrame[\s\S]{0,200}?setAttribute\(\s*['"]sandbox['"]\s*,\s*['"]([^'"]*)['"]/g)].map((m) => m[1]);
  const vals = [...(attr !== undefined ? [attr] : []), ...viaJs];
  report('APP-6', vals.length > 0 && vals.every((v) => !/allow-scripts/.test(v)), `pageFrame sandbox values: ${JSON.stringify(vals)} (tag: ${tag.slice(0, 90)})`, { check: 'static-ai-dom-lens-page-frame-no-scripts' });
}

// ── APP-8: TOTP secrets out of localStorage ─────────────────────────────────
{
  const t = read(join(APPS, 'totp-auth/main.html')) || '';
  const writes = [...t.matchAll(/localStorage\s*(\.\s*setItem|\[)/g)].map((m) => lineOf(t, m.index));
  report('APP-8', t ? writes.length === 0 : null, writes.length ? `localStorage writes at lines ${writes.join(',')}` : 'no localStorage writes', { check: 'static-totp-no-localstorage' });
}

// ── phase 2: no allow-scripts + allow-same-origin app sandboxes; apps don't touch top/parent ──
{
  const files = [...walk(join(ROOT, 'src'), /\.(ts|tsx)$/), ...walk(APPS, /\.(js|html)$/)].filter((f) => !/\.test\./.test(f));
  const hits = [];
  for (const f of files) {
    const src = read(f); if (!src) continue;
    // D13: cross-origin http(s) embeds (Browser app for foreign URLs, YouTube, fast.com, code-server)
    // legitimately keep allow-same-origin — their origin differs from the OS.
    if (/opt\/apps\/(youtube-player|speed-test|vscode-online)\//.test(f)) continue;
    for (const m of src.matchAll(/['"`]([^'"`\n]*allow-same-origin[^'"`\n]*)['"`]/g)) {
      if (!/allow-scripts/.test(m[1])) continue;
      if (/src\/core\/iframe\/index\.tsx$/.test(f) && (/EXTERNAL_SANDBOX\s*=/.test(src.slice(m.index - 40, m.index)) || /cross[- ]?origin|CROSS_ORIGIN|foreign|EXTERNAL_SANDBOX|external/i.test(src.slice(Math.max(0, m.index - 600), m.index)))) continue;
      // Dashboard "Web View" widget: the same D13 embed sandbox, chosen only when the URL's
      // origin differs from the OS (`u.origin === location.origin ? <opaque> : <embed>`).
      if (/opt\/apps\/dashboard\/dashboard\.html$/.test(f) && /u\.origin\s*===\s*location\.origin\s*\?/.test(src.slice(Math.max(0, m.index - 200), m.index))) continue;
      hits.push(`${rel(f)}:${lineOf(src, m.index)}`);
    }
  }
  report('KRN-6', hits.length === 0, `${hits.length} sandbox strings with allow-scripts+allow-same-origin: ${hits.slice(0, 15).join(', ')}`, { phase: 'phase2', check: 'static-no-same-origin-app-sandboxes' });
  const topRefs = [];
  for (const f of walk(APPS, /\.(js|html)$/)) {
    const src = read(f); if (!src) continue;
    const n = (src.match(/\b(window\.)?(top|parent)\s*\.\s*(document|platform|fs|__\w+|frames|postMessage|open|location)/g) || []).length;
    if (n) topRefs.push(`${rel(f).replace('docs/public/mount/opt/apps/', '')}(${n})`);
  }
  report('APP-15', topRefs.length === 0, `${topRefs.length} app files reference top./parent.: ${topRefs.slice(0, 20).join(', ')}`, { phase: 'phase2', check: 'static-apps-no-top-parent' });
}

done('test-static');
