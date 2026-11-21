// 1D.5 (audit BOOT-12; decisions.md D10) — terminal command lookup and output:
//  - a command *name* with '/', '\' or '..' never reaches a script through PATH
//    (`cd /bin; ../home/user1/x` used to run /home/user1/x.run);
//  - typed commands run through Host.runFile (not Host.exec = "open"): /bin commands, an
//    explicit script path (./x.run, /abs/y.js) run without a prompt; a script path that an
//    alias expands to (~/.aliases is writable by any app) asks first, naming the file;
//  - xargs: same name rule, runs through runFile;
//  - curl: ESC and other control characters in a response body are shown as ^[ etc., never
//    interpreted by xterm; `curl -o` still saves the raw bytes.
// Plus terminal smoke: ls, cd, pwd, cat, echo, which, edit (opens Notepad), unknown command.
//
// Run: node testing/scripts/security/verify-files-terminal.mjs   (dev server on :8080)
import {
  launch, bootReady, writeVfs, makeReporter, sleep, pollFor, installSpies, resetSpies, getSpies,
  installDialogs, closeAllWindows, vfs,
} from './verify-files-lib.mjs';

const { check, done } = makeReporter();
const DIR = '/home/user1/termtest';
const ESC_BODY = 'before\u001b[2J\u001b[H\u001b]0;pwned-title\u0007hello\u001b[31mred\u009b31mX\u0000end\ttab';

const browser = await launch();
const context = await browser.newContext();
await context.route('http://evil.test/**', (route) => route.fulfill({
  status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain; charset=utf-8' }, body: ESC_BODY,
}));
const page = await bootReady(context);
const dialogs = installDialogs(page);
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.stack || e.message).split('\n').slice(0, 3).join(' ⟵ ')));
const top = (k) => page.evaluate((k) => window.top[k], k);

try {
  await installSpies(page);
  await vfs.rm(page, DIR);
  await writeVfs(page, {
    [`${DIR}/evilcmd.run`]: 'top.__pwnedTerm = (top.__pwnedTerm || 0) + 1;',
    [`${DIR}/myscript.run`]: 'top.__ranUser = $args; const t = platform.getService("terminal"); t && t.write("user script ran\\n");',
    [`${DIR}/hello.js`]: 'window.top.__ranJs = (window.top.__ranJs || 0) + 1;',
    [`${DIR}/aliased.run`]: 'top.__ranAliased = (top.__ranAliased || 0) + 1;',
    [`${DIR}/list.txt`]: 'alpha beta\ngamma',
    [`${DIR}/note.txt`]: 'note-content',
  });

  await page.evaluate(() => window.platform.host.openWindow('ui.terminal'));
  const termFrame = await pollFor(async () => {
    for (const f of page.frames()) { try { if (await f.evaluate(() => !!(window.__terminalApp && window.__terminalApp.sessions[0] && !window.__terminalApp.sessions[0].busy))) return f; } catch (_) {} }
    return null;
  }, { timeout: 40000, interval: 500 });
  check('terminal: opens', !!termFrame);
  // Runs a command line in session 0, returning everything written to the terminal meanwhile.
  const term = (cmd) => termFrame.evaluate(async (cmd) => {
    const s = window.__terminalApp.sessions[0];
    const out = [];
    const orig = s.terminal.write;
    s.terminal.write = function (d) { out.push(typeof d === 'string' ? d : new TextDecoder().decode(d)); return orig.call(this, d); };
    try { await s.processCommand(cmd); } catch (e) { out.push('[threw] ' + e.message); } finally { s.terminal.write = orig; }
    return out.join('');
  }, cmd);
  const lookup = (name) => termFrame.evaluate((n) => window.__terminalApp.sessions[0].findCommandFile(n), name);

  // ── PATH lookup refuses path-like names ───────────────────────────────────────────────────
  check('findCommandFile("ls") → /bin/ls.run', (await lookup('ls')) === '/bin/ls.run');
  const refused = [];
  for (const n of ['../home/user1/termtest/evilcmd', '..', '..\\home\\user1\\termtest\\evilcmd', 'a/b', '/home/user1/termtest/evilcmd']) {
    if ((await lookup(n)) !== '') refused.push(n);
  }
  check('findCommandFile refuses names with / \\ or ..', refused.length === 0, refused.join(', '));
  await term('cd /bin');
  let out = await term('../home/user1/termtest/evilcmd');
  check('cd /bin; ../home/user1/termtest/evilcmd → "Command not found", nothing ran', /Command not found/.test(out) && (await top('__pwnedTerm')) === undefined, JSON.stringify(out));
  await term(`cd ${DIR}`);
  out = await term('xargs -a list.txt ../termtest/evilcmd');
  check('xargs with a path-like command name → not found, nothing ran', /command not found/.test(out) && (await top('__pwnedTerm')) === undefined, JSON.stringify(out));

  // ── typed commands run via runFile ────────────────────────────────────────────────────────
  await resetSpies(page);
  dialogs.clear();
  out = await term('./myscript.run one two');
  check('explicit path ./myscript.run: runs with [pwd, ...args], no prompt', JSON.stringify(await top('__ranUser')) === JSON.stringify([DIR, 'one', 'two']) && dialogs.log.length === 0 && out.includes('user script ran'), JSON.stringify(out));
  const spies = await getSpies(page);
  check('explicit path: through Host.runFile(confirm:false), not Host.exec', spies.runFile.some((c) => c[1] === `${DIR}/myscript.run` && c[3] && c[3].confirm === false) && !spies.exec.length, JSON.stringify(spies.runFile.map((c) => c.slice(1))));
  await term(`${DIR}/hello.js`);
  check('absolute path to a .js script: runs (execString)', (await top('__ranJs')) === 1);
  out = await term('./note.txt');
  check('path to a non-script (./note.txt): "Command not found", not opened', /Command not found/.test(out));
  out = await term('/bin/echo.run via-path');
  check('/bin/echo.run by path: runs', out.includes('via-path'), JSON.stringify(out));

  // aliases: a name alias runs; a script-path alias asks first
  await page.evaluate((d) => window.fs.writeFileSync('/home/user1/.aliases', `alias ll=ls\nalias sneaky=${d}/aliased.run\n`), DIR);
  await termFrame.evaluate(() => window.__terminalApp.sessions[0].loadAliases());
  dialogs.clear();
  out = await term('ll');
  check('alias to a command (ll = ls): runs without a prompt', out.includes('note.txt') && dialogs.log.length === 0, JSON.stringify(out.slice(0, 120)));
  dialogs.answer({ accept: false });
  await term('sneaky');
  const aconf = dialogs.log.find((d) => d.type === 'confirm');
  check('alias expanding to a script path: confirm() names the file; declined → not run', !!aconf && aconf.message.includes(`${DIR}/aliased.run`) && (await top('__ranAliased')) === undefined, aconf && aconf.message);
  dialogs.answer({ accept: true });
  await term('sneaky');
  check('alias expanding to a script path: accepted → runs', (await top('__ranAliased')) === 1);
  await page.evaluate(() => window.fs.unlinkSync('/home/user1/.aliases'));

  // xargs runs /bin commands per token through runFile
  out = await term('xargs -a list.txt echo item');
  check('xargs -a list.txt echo item: one run per token', ['item alpha', 'item beta', 'item gamma'].every((s) => out.includes(s)), JSON.stringify(out));

  // ── curl: terminal escapes neutralised ────────────────────────────────────────────────────
  out = await term('curl http://evil.test/esc');
  check('curl: no raw ESC / BEL / C1 / NUL reaches the terminal', !/[\u001b\u0007\u009b\u0000]/.test(out), JSON.stringify(out));
  check('curl: control characters shown visibly (^[[2J, ^[]0;pwned-title^G, \\x9b, ^@)', out.includes('^[[2J^[[H^[]0;pwned-title^Ghello^[[31mred\\x9b31mX^@end\ttab'), JSON.stringify(out));
  const screen = await termFrame.evaluate(() => {
    const b = window.__terminalApp.sessions[0].terminal.buffer.active;
    const lines = [];
    for (let i = 0; i < b.length; i++) lines.push(b.getLine(i).translateToString(true));
    return lines.join('\n');
  });
  check('curl: screen not cleared, earlier output still on screen', screen.includes('Command not found') && screen.includes('^[[2J'));
  out = await term('curl -o raw.txt http://evil.test/esc');
  check('curl -o: saves the raw bytes unchanged', (await vfs.read(page, `${DIR}/raw.txt`)) === ESC_BODY, JSON.stringify(out));

  // ── smoke ─────────────────────────────────────────────────────────────────────────────────
  out = await term('pwd');
  check('smoke: pwd', out.includes(DIR), JSON.stringify(out));
  out = await term('ls');
  check('smoke: ls', out.includes('myscript.run') && out.includes('list.txt'), JSON.stringify(out.slice(0, 160)));
  out = await term('cat note.txt');
  check('smoke: cat', out.includes('note-content'), JSON.stringify(out));
  out = await term('echo hi there');
  check('smoke: echo', out.includes('hi there'), JSON.stringify(out));
  out = await term('which ls');
  check('smoke: which', out.includes('/bin/ls.run'), JSON.stringify(out));
  await term('cd ..');
  out = await term('pwd');
  check('smoke: cd ..', out.includes('/home/user1') && !out.includes('termtest'), JSON.stringify(out));
  await term('cd termtest');
  await resetSpies(page);
  await term('edit note.txt');
  await sleep(500);
  check('smoke: edit note.txt opens Notepad on the file', (await getSpies(page)).openWindow.some((c) => c[0] === 'ui.notepad' && c[1] === `${DIR}/note.txt`), JSON.stringify((await getSpies(page)).openWindow));
  out = await term('nosuchcmd');
  check('smoke: unknown command', /Command not found: nosuchcmd/.test(out));

  check('nothing ran from a refused lookup', (await top('__pwnedTerm')) === undefined);
  check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
} catch (e) {
  check('test run completed', false, e.stack || e.message);
  await page.screenshot({ path: new URL('../../screenshots/verify-files-terminal-fail.png', import.meta.url).pathname }).catch(() => {});
} finally {
  await vfs.rm(page, DIR).catch(() => {});
  await closeAllWindows(page).catch(() => {});
  await browser.close();
}
process.exit(done() ? 1 : 0);
