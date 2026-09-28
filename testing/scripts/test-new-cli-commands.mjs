// Tests the new CLI commands (du, df, diff, cut, sed, xargs, tar, zip, unzip,
// curl) added under docs/public/mount/bin/*.run. Since these files aren't yet
// wired into meta.json, this script injects them straight into the running
// vfs (fs.writeFileSync) before exercising them through a real terminal
// session's processCommand(), which is the same code path the terminal UI
// itself uses for typed input.
//
// Run against the dev server on port 8105:
//   npx webpack serve --port 8105 &
//   node testing/scripts/test-new-cli-commands.mjs
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const PORT = 8105;
const BASE = `http://localhost:${PORT}`;
const REPO_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const BIN_DIR = path.join(REPO_ROOT, 'docs/public/mount/bin');

const NEW_COMMANDS = ['du', 'df', 'diff', 'cut', 'sed', 'xargs', 'tar', 'zip', 'unzip', 'curl'];

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ' - ' + detail : ''}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

page.on('pageerror', err => console.log('PAGEERROR:', err.message));
page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });

await page.goto(BASE);
await page.reload({ waitUntil: 'networkidle', timeout: 60000 }).catch(e => console.log('reload1 timeout:', e.message));
await page.waitForTimeout(2000);
await page.reload({ waitUntil: 'networkidle', timeout: 60000 }).catch(e => console.log('reload2 timeout:', e.message));
await page.waitForTimeout(2000);
await page.waitForFunction(() => !!window.platform, { timeout: 30000 }).catch(e => console.log('waitForFunction platform timeout:', e.message));
await page.waitForSelector('.content-area', { timeout: 30000 }).catch(e => console.log('waitForSelector content-area timeout:', e.message));
await page.waitForTimeout(1000);

// Inject the new .run files into the vfs (real bootstrap will happen once
// meta.json is updated by the orchestrating session).
for (const name of NEW_COMMANDS) {
  const src = fs.readFileSync(path.join(BIN_DIR, `${name}.run`), 'utf8');
  await page.evaluate(({ name, src }) => {
    window.platform.host.getFS().writeFileSync(`/bin/${name}.run`, src);
  }, { name, src });
}
console.log('Injected new .run files into vfs:', NEW_COMMANDS.join(', '));

// Open a terminal window.
await page.evaluate(() => window.platform.host.callCommand('ui.terminal'));
await page.waitForTimeout(1000);

let termFrame = null;
for (let i = 0; i < 30 && !termFrame; i++) {
  await page.waitForTimeout(200);
  for (const f of page.frames()) {
    try {
      const has = await f.evaluate(() => !!window.__terminalApp).catch(() => false);
      if (has) { termFrame = f; break; }
    } catch (_) {}
  }
}
console.log('terminal frame found:', !!termFrame);
if (!termFrame) { console.log('ABORT: could not find terminal frame'); await browser.close(); process.exit(1); }

// Let the session's initial async `info` banner (awaited by
// initializeTerminal() before displayPrompt()) fully settle — otherwise its
// still-in-flight terminal.write() calls can land after our first `clear`.
await page.waitForTimeout(1500);

// Run a command via the session's real processCommand() (same path the
// terminal UI uses for typed input) and return the terminal buffer lines
// produced after the call (a simple "before/after" diff of the scrollback).
async function run(cmd) {
  return termFrame.evaluate(async (cmd) => {
    const app = window.__terminalApp;
    const session = app.sessions[0];
    const dump = () => {
      const buf = session.terminal.buffer.active;
      const lines = [];
      for (let i = 0; i < buf.length; i++) lines.push(buf.getLine(i)?.translateToString(true) ?? '');
      return lines.filter(l => l.trim() !== '').join('\n');
    };
    // `clear` first so each command's output starts on a clean screen —
    // processCommand() (unlike typed input) never re-displays the prompt, and
    // this sidesteps xterm's fixed-viewport row reuse (new output landing on
    // a row a previous command's longer output left leftover characters on;
    // a documented, pre-existing cosmetic quirk of this terminal, not
    // something these new commands caused).
    await session.processCommand('clear');
    await new Promise(r => setTimeout(r, 300));
    await session.processCommand(cmd);
    // xterm.js's terminal.write() is asynchronous (parsed off a queue) — the
    // processCommand() promise resolving does NOT mean the buffer has been
    // updated yet. A short settle delay is required before reading it back.
    await new Promise(r => setTimeout(r, 300));
    return dump();
  }, cmd);
}

// Set up test fixtures directly on the vfs (bypassing the terminal, so test
// setup failures don't get confused with command failures).
await page.evaluate(() => {
  const fs = window.platform.host.getFS();
  const mk = (p) => { try { fs.mkdirSync(p); } catch (_) {} };
  mk('/tmp/cli-test');
  mk('/tmp/cli-test/du-dir');
  mk('/tmp/cli-test/du-dir/sub');
  fs.writeFileSync('/tmp/cli-test/du-dir/a.txt', 'x'.repeat(1000));
  fs.writeFileSync('/tmp/cli-test/du-dir/sub/b.txt', 'y'.repeat(2000));

  fs.writeFileSync('/tmp/cli-test/diff-a.txt', 'line1\nline2\nline3\n');
  fs.writeFileSync('/tmp/cli-test/diff-b.txt', 'line1\nCHANGED\nline3\nline4\n');

  fs.writeFileSync('/tmp/cli-test/data.csv', 'a,b,c\n1,2,3\n4,5,6\n');

  fs.writeFileSync('/tmp/cli-test/sed-in.txt', 'foo bar foo\nbaz foo\n');

  fs.writeFileSync('/tmp/cli-test/tokens.txt', 'alpha\nbeta\ngamma\n');

  mk('/tmp/cli-test/tar-src');
  mk('/tmp/cli-test/tar-src/nested');
  fs.writeFileSync('/tmp/cli-test/tar-src/root.txt', 'root file contents');
  fs.writeFileSync('/tmp/cli-test/tar-src/nested/inner.txt', 'nested file contents');

  // A "binary" file with the full byte range, to stress zip round-tripping.
  const bytes = Buffer.alloc(256);
  for (let i = 0; i < 256; i++) bytes[i] = i;
  fs.writeFileSync('/tmp/cli-test/binary.bin', bytes);
});

// ---- du ----
{
  const outBytes = await run('du /tmp/cli-test/du-dir');
  // Tabs render as expanded whitespace in the terminal buffer, so match on
  // whitespace rather than a literal '\t'.
  const okBytes = /(^|\n)3000\s+\/tmp\/cli-test\/du-dir\s*$/.test(outBytes.replace(/\r/g, ''));
  const outHuman = await run('du -h /tmp/cli-test/du-dir');
  const okHuman = /2\.9K\s+\/tmp\/cli-test\/du-dir\s*$/.test(outHuman.replace(/\r/g, ''));
  record('du', okBytes && okHuman, `bytes:${outBytes.trim().split('\n').slice(-1)} | human:${outHuman.trim().split('\n').slice(-1)}`);
}

// ---- df ----
{
  const out = await run('df');
  const ok = /Filesystem/.test(out) && /vfs/.test(out) && /%/.test(out);
  record('df', ok, out.trim().split('\n').join(' | '));
}

// ---- diff ----
{
  const out = await run('diff /tmp/cli-test/diff-a.txt /tmp/cli-test/diff-b.txt');
  const ok = out.includes('-line2') && out.includes('+CHANGED') && out.includes('+line4');
  record('diff', ok, out.trim());
}

// ---- cut ----
{
  const out = await run('cut -d, -f1,3 /tmp/cli-test/data.csv');
  const norm = out.replace(/\r/g, '').trim();
  const ok = norm === 'a,c\n1,3\n4,6';
  record('cut', ok, JSON.stringify(norm));
}

// ---- sed ----
{
  const out = await run("sed 's/foo/XXX/g' /tmp/cli-test/sed-in.txt");
  const norm = out.replace(/\r/g, '').trim();
  const ok = norm === 'XXX bar XXX\nbaz XXX';
  const original = await page.evaluate(() => window.platform.host.getFS().readFileSync('/tmp/cli-test/sed-in.txt', 'utf8'));
  const unmodified = original === 'foo bar foo\nbaz foo\n';
  record('sed', ok && unmodified, JSON.stringify(norm) + ` (file unmodified: ${unmodified})`);
}

// ---- xargs ----
{
  const out = await run('xargs -a /tmp/cli-test/tokens.txt echo');
  const norm = out.replace(/\r/g, '').trim();
  const ok = norm.split('\n').filter(Boolean).join(',') === 'alpha,beta,gamma';
  record('xargs', ok, JSON.stringify(norm));
}

// ---- tar ----
{
  const c = await run('tar -c /tmp/cli-test/archive.tar /tmp/cli-test/tar-src');
  const t = await run('tar -t /tmp/cli-test/archive.tar');
  const x = await run('tar -x /tmp/cli-test/archive.tar /tmp/cli-test/tar-extract');
  const check = await page.evaluate(() => {
    const fs = window.platform.host.getFS();
    try {
      const root = fs.readFileSync('/tmp/cli-test/tar-extract/tar-src/root.txt', 'utf8');
      const inner = fs.readFileSync('/tmp/cli-test/tar-extract/tar-src/nested/inner.txt', 'utf8');
      return { root, inner };
    } catch (e) { return { error: e.message }; }
  });
  const ok = t.includes('root.txt') && t.includes('inner.txt') && check.root === 'root file contents' && check.inner === 'nested file contents';
  record('tar', ok, `create:${c.trim()} | list:${t.trim().split('\n').join(';')} | extract:${x.trim()} | check:${JSON.stringify(check)}`);
}

// ---- zip / unzip ----
{
  const c = await run('zip /tmp/cli-test/archive.zip /tmp/cli-test/tar-src /tmp/cli-test/binary.bin');
  const x = await run('unzip /tmp/cli-test/archive.zip -d /tmp/cli-test/zip-extract');
  const check = await page.evaluate(() => {
    const fs = window.platform.host.getFS();
    try {
      const root = fs.readFileSync('/tmp/cli-test/zip-extract/tar-src/root.txt', 'utf8');
      const inner = fs.readFileSync('/tmp/cli-test/zip-extract/tar-src/nested/inner.txt', 'utf8');
      const origBin = fs.readFileSync('/tmp/cli-test/binary.bin');
      const extractedBin = fs.readFileSync('/tmp/cli-test/zip-extract/binary.bin');
      const binMatch = Buffer.from(origBin).equals(Buffer.from(extractedBin));
      return { root, inner, binMatch, binLen: extractedBin.length };
    } catch (e) { return { error: e.message }; }
  });
  const ok = check.root === 'root file contents' && check.inner === 'nested file contents' && check.binMatch === true && check.binLen === 256;
  record('zip/unzip', ok, `create:${c.trim()} | extract:${x.trim()} | check:${JSON.stringify(check)}`);
}

// Verify the produced .zip is a real, spec-compliant ZIP (magic bytes + EOCD).
{
  const zipCheck = await page.evaluate(() => {
    const fs = window.platform.host.getFS();
    const raw = fs.readFileSync('/tmp/cli-test/archive.zip');
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    const localSig = buf.readUInt32LE(0) === 0x04034b50;
    let eocdFound = false;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 4096); i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) { eocdFound = true; break; }
    }
    return { localSig, eocdFound, size: buf.length };
  });
  record('zip format validity', zipCheck.localSig && zipCheck.eocdFound, JSON.stringify(zipCheck));
}

// Export the vfs-produced zip to a real file and validate it with the
// system's real `unzip`/`zipinfo` (not just our own parser) — this is the
// strongest evidence the format is genuinely standard-compliant.
{
  const b64 = await page.evaluate(() => {
    const fs = window.platform.host.getFS();
    const raw = fs.readFileSync('/tmp/cli-test/archive.zip');
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    return buf.toString('base64');
  });
  const outPath = path.join(REPO_ROOT, 'testing/screenshots/roundtrip-check.zip');
  fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
  const { execSync } = await import('child_process');
  let sysUnzipOk = false, sysDetail = '';
  try {
    const testOut = execSync(`unzip -t "${outPath}"`, { encoding: 'utf8' });
    sysUnzipOk = /No errors detected/.test(testOut);
    sysDetail = testOut.trim().split('\n').slice(-2).join(' / ');
  } catch (e) {
    sysDetail = 'unzip -t failed: ' + (e.stdout || e.message);
  }
  record('zip readable by system unzip -t', sysUnzipOk, sysDetail);
}

// ---- curl ----
{
  const outBody = await run(`curl ${BASE}/public/mount/meta.json`);
  const okBody = outBody.includes('"path"') && outBody.includes('force_reload');
  record('curl (print body)', okBody, outBody.trim().slice(0, 120));

  const outSave = await run(`curl -o /tmp/cli-test/meta-copy.json ${BASE}/public/mount/meta.json`);
  const saved = await page.evaluate(() => {
    try { return window.platform.host.getFS().readFileSync('/tmp/cli-test/meta-copy.json', 'utf8'); }
    catch (e) { return null; }
  });
  const okSave = saved != null && saved.includes('force_reload');
  record('curl (-o save)', okSave, outSave.trim() + (saved ? ` | saved ${saved.length} bytes` : ' | save failed'));

  const outErr = await run('curl http://this-domain-should-not-resolve.invalid/');
  const okErr = /curl:/.test(outErr) && !/Uncaught|TypeError: Cannot/.test(outErr);
  record('curl (network error handled)', okErr, outErr.trim());
}

console.log('\n=== SUMMARY ===');
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`);
const failCount = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failCount}/${results.length} passed`);

await browser.close();
process.exit(failCount ? 1 : 0);
