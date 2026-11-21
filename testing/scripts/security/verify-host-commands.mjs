// Verifies 1B.6 (audit KRN-10, decisions.md D9): the command registry records an owner — the
// registering module, or the script/page for code run by execString / framed by ui.iframe —
// and a different owner can't replace a name unless the registration it replaces is marked
// `fallback: true` (remote.ts's 'explorer', the compiled Markdown viewer).
//
// Run: node testing/scripts/security/verify-host-commands.mjs   (OS dev server on :8080)
// Exit code: 0 = all checks pass, 1 = a check failed.
import { launch, bootOS } from './spike-lib.mjs';

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const D = '/home/user1/cmd-verify';

const browser = await launch();
const context = await browser.newContext();
try {
  const page = await bootOS(context);
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.waitForTimeout(2500);

  const owners = await page.evaluate(() => {
    let all = []; platform.host.commands$.subscribe((c) => { all = c; }).unsubscribe();
    const of = (n) => platform.host.getCommand(n)?.servicePlatformName;
    return {
      explorer: of('explorer'),
      explorerFallback: all.filter((c) => c.name === 'explorer').map((c) => `${c.servicePlatformName}${c.meta?.fallback ? ' (fallback)' : ''}`),
      notepad: of('ui.notepad'), markdown: of('ui.markdown'), notify: of('notify'), rm: of('ui.remote-machines'),
    };
  });
  console.log('   owners:', JSON.stringify(owners));
  check('owners recorded per module / script', owners.notepad === '005-ui.notepad' && owners.notify === 'root' && owners.rm === '/(sw)/opt/apps/remote-machines/main.js', JSON.stringify(owners));
  check("file-explorer/main.js replaced remote.ts's 'explorer' fallback", owners.explorer === '/(sw)/opt/apps/file-explorer/main.js' && owners.explorerFallback.includes('root (fallback)'), JSON.stringify(owners.explorerFallback));

  // A script (any app's main.js) tries to take over system and app commands.
  await page.evaluate((D) => {
    const fs = window.fs;
    if (!fs.existsSync(D)) fs.mkdirSync(D, { recursive: true });
    const take = (names) => names.map((n) => `window.top.__took = window.top.__took || {}; window.top.__took[${JSON.stringify(n)}] = platform.host.registerCommand(${JSON.stringify(n)}, () => 'hijacked', { title: 'AAA', icon: 'x' });`).join('\n');
    fs.writeFileSync(`${D}/evil.js`, take(['ui.notepad', 'ui.remote-machines', 'notify', 'ui.iframe', 'ui.settings', 'zz.mine']));
    fs.writeFileSync(`${D}/other.js`, take(['zz.mine']));
  }, D);
  await page.evaluate((D) => platform.host.runFile(platform, `${D}/evil.js`, [], { confirm: false }), D);
  const after = await page.evaluate(() => {
    const of = (n) => { const c = platform.host.getCommand(n); return { owner: c?.servicePlatformName, hijacked: c?.meta?.title === 'AAA' }; };
    return { notepad: of('ui.notepad'), rm: of('ui.remote-machines'), notify: of('notify'), iframe: of('ui.iframe'), settings: of('ui.settings'), mine: of('zz.mine') };
  });
  console.log('   after takeover attempt:', JSON.stringify(after));
  check('another owner cannot replace system/app commands', ['notepad', 'rm', 'notify', 'iframe', 'settings'].every((k) => !after[k].hijacked), JSON.stringify(after));
  check('a script may register new names (owned by the script)', after.mine.hijacked && after.mine.owner === `/(sw)${D}/evil.js`, JSON.stringify(after.mine));
  // remove() of a refused registration must not remove the original
  const removed = await page.evaluate(() => { window.top.__took['ui.notepad'].remove(); return platform.host.getCommand('ui.notepad')?.servicePlatformName; });
  check("remove() of a refused registration leaves the owner's command", removed === '005-ui.notepad', removed);
  // the same script re-running may re-register its own names; another script may not
  await page.evaluate((D) => platform.host.runFile(platform, `${D}/evil.js`, [], { confirm: false }), D);
  const sameOwner = await page.evaluate(() => { let n = 0; let all = []; platform.host.commands$.subscribe((c) => { all = c; }).unsubscribe(); all.forEach((c) => { if (c.name === 'zz.mine') n++; }); return n; });
  await page.evaluate((D) => platform.host.runFile(platform, `${D}/other.js`, [], { confirm: false }), D);
  const otherOwner = await page.evaluate(() => platform.host.getCommand('zz.mine')?.servicePlatformName);
  check('the same owner may re-register; another script may not take it', sameOwner === 2 && otherOwner === `/(sw)${D}/evil.js`, `registrations=${sameOwner} owner=${otherOwner}`);

  // The Markdown app from the registry replaces the compiled viewer (fallback) and becomes the .md default.
  await page.evaluate(() => {
    platform._appDir = '/opt/apps/markdown-reader';
    try { platform.host.runFile(platform, '/opt/apps/markdown-reader/main.js', [], { confirm: false }); } finally { delete platform._appDir; }
  });
  const md = await page.evaluate(() => platform.host.getCommand('ui.markdown')?.servicePlatformName);
  check('markdown-reader replaces the compiled ui.markdown (fallback)', md === '/(sw)/opt/apps/markdown-reader/main.js', md);

  // First-party pages own what they register (not the shared iframe module).
  await page.evaluate(() => platform.host.openWindow('ui.terminal'));
  let pageOwner = null;
  for (let i = 0; i < 30 && !pageOwner; i++) {
    pageOwner = await page.evaluate(() => {
      const inner = document.querySelector('.window[data-name="ui.terminal"] iframe')?.contentDocument?.querySelector('iframe');
      const p = inner?.contentWindow?.platform;
      if (!p) return null;
      p.host.registerCommand('zz.from-page', () => 1);
      return platform.host.getCommand('zz.from-page')?.servicePlatformName;
    }).catch(() => null);
    if (!pageOwner) await page.waitForTimeout(300);
  }
  check('a first-party page owns its registrations', pageOwner === '/(sw)/opt/apps/terminal/main.html', pageOwner);

  // Task Manager data: process.list still resolves the platform of script-registered apps.
  await page.evaluate(() => platform.host.openWindow('ui.snake-game'));
  await page.waitForTimeout(1500);
  const proc = await page.evaluate(() => (platform.host.callCommand('process.list') || []).find((p) => p.name === 'ui.snake-game'));
  check('process.list resolves services for script-owned apps', !!proc && Array.isArray(proc.services) && proc.services.length > 0, JSON.stringify(proc && proc.services));
} finally {
  await context.close();
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
