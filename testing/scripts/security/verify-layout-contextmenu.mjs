// verify-layout-contextmenu.mjs — TODO 1C.3 (audit KRN-3, WIN-2): the layout's
// desktop context menu and desktop actions are structured — a file name never
// becomes code — while user-authored /etc/contextmenu.json DSL keeps working
// and receives values only as $args.
//
//   node testing/scripts/security/verify-layout-contextmenu.mjs
import { readFileSync } from 'node:fs';
import { launch, bootOS, writeVfs } from './spike-lib.mjs';

const results = [];
const check = (id, ok, detail = '') => {
  results.push({ id, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${detail ? '  — ' + detail : ''}`);
};

// ── Static: no execCommand string built with ${…} in the layout's files (D9)
const OWNED = ['src/core/window-manager.ts', 'src/core/layout/index.tsx', 'src/core/layout/contextmenu.tsx', 'src/core/layout/commands.tsx',
  'src/system/desktop-manager.ts', 'src/system/layout-manager.ts', 'src/system/window-manager.ts'];
const offenders = [];
for (const f of OWNED) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (/execCommand\s*\(\s*`/.test(line) || (/execCommand\s*\(/.test(line) && /\$\{/.test(line))) offenders.push(`${f}:${i + 1}`);
    if (/cmd:\s*`[^`]*\$\{/.test(line)) offenders.push(`${f}:${i + 1} (templated cmd)`);
  });
}
check('static: no interpolated execCommand / cmd strings in layout files', offenders.length === 0, offenders.join(', ') || 'none');

const EVIL = "x'),(top.__pwnedCtx=1),('.txt";
const browser = await launch();
try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await bootOS(context);
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  const windows = () => page.evaluate(() => window.platform.host.callCommand('process.list').map((p) => ({ pid: p.pid, name: p.name, title: p.title })));
  const closeAll = () => page.evaluate(() => window.platform.host.callCommand('process.list').forEach((p) => window.platform.host.callCommand('process.kill', p.pid)));
  const menuButtons = () => page.evaluate(() => {
    const m = document.querySelector('.contextmenu');
    return m && getComputedStyle(m).display !== 'none' ? [...m.querySelectorAll('button')].map((b) => b.textContent.trim()) : null;
  });
  const clickMenu = async (text) => {
    await page.locator('.contextmenu button', { hasText: text }).first().click({ force: true });
    await page.waitForTimeout(1200);
  };
  const rightClickIcon = async (label) => {
    await page.locator('.vfs-desktop-icon', { hasText: label }).first().click({ button: 'right', force: true });
    await page.waitForTimeout(400);
  };

  // Plant files on the desktop (/home/user1) and remount the desktop so it re-reads the folder.
  await writeVfs(page, { [`/home/user1/${EVIL}`]: 'hello', '/home/user1/del-me.txt': 'bye' });
  await page.evaluate(() => window.platform.host.callCommand('open-vfs-desktop', 'none'));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.platform.host.callCommand('open-vfs-desktop', 'default'));
  await page.waitForTimeout(1500);
  check('desktop shows the planted files', (await page.locator('.vfs-desktop-icon', { hasText: "x')," }).count()) === 1);

  // ── Edit on a hostile file name: opens Notepad on that exact path, runs nothing
  await rightClickIcon("x'),");
  const fileMenu = await menuButtons();
  check('file menu has Edit/Open/Delete + Open with', !!fileMenu && ['Edit', 'Open', 'Delete', 'Browser'].every((t) => fileMenu.includes(t)), JSON.stringify(fileMenu));
  await clickMenu('Edit');
  let wins = await windows();
  const pwned1 = await page.evaluate(() => window.top.__pwnedCtx);
  check('Edit opens Notepad on the hostile path', wins.some((w) => w.name === 'ui.notepad' && String(w.title).includes(EVIL)), JSON.stringify(wins));
  check('hostile name did not execute (Edit)', pwned1 === undefined, `top.__pwnedCtx=${pwned1}`);
  await closeAll();
  await page.waitForTimeout(400);

  // ── "Open with" child (rendered by the layout, not the item template)
  await rightClickIcon("x'),");
  const childCount = await page.locator('.contextmenu button.ctx-child-btn').count();
  check('Open with group children rendered', childCount > 0, `${childCount} children`);
  const childTitle = await page.locator('.contextmenu button.ctx-child-btn').first().textContent();
  await page.locator('.contextmenu button.ctx-child-btn').first().click({ force: true });
  await page.waitForTimeout(1500);
  wins = await windows();
  const pwned2 = await page.evaluate(() => window.top.__pwnedCtx);
  check('Open with child opens a window', wins.length === 1, `${childTitle.trim()} → ${JSON.stringify(wins)}`);
  check('hostile name did not execute (Open with)', pwned2 === undefined, `top.__pwnedCtx=${pwned2}`);
  await closeAll();
  await page.waitForTimeout(400);

  // ── Delete
  await rightClickIcon('del-me.txt');
  await clickMenu('Delete');
  const gone = await page.evaluate(() => !window.fs.existsSync('/home/user1/del-me.txt'));
  check('Delete removes the file', gone);

  // ── Desktop background: user-authored /etc/contextmenu.json DSL still runs
  const bg = { x: 1100, y: 450 };
  await page.mouse.click(bg.x, bg.y, { button: 'right' });
  await page.waitForTimeout(400);
  const deskMenu = await menuButtons();
  check('desktop menu loads /etc/contextmenu.json', !!deskMenu && deskMenu.includes('Explorer') && deskMenu.includes('App Manager'), JSON.stringify(deskMenu));
  await clickMenu('Explorer');
  wins = await windows();
  check('desktop menu DSL entry opens Explorer', wins.some((w) => w.name === 'explorer' || w.name === 'ui.file-explorer'), JSON.stringify(wins));
  await closeAll();
  await page.waitForTimeout(400);

  // ── Invalid config → structured fallback entries
  const savedMenu = await page.evaluate(() => window.fs.readFileSync('/etc/contextmenu.json', 'utf8'));
  await writeVfs(page, { '/etc/contextmenu.json': '{"not":"an array"}' });
  await page.mouse.click(bg.x, bg.y, { button: 'right' });
  await page.waitForTimeout(400);
  const fallbackMenu = await menuButtons();
  check('invalid config → fallback menu', JSON.stringify(fallbackMenu) === JSON.stringify(['Explorer', 'Settings', 'Terminal']), JSON.stringify(fallbackMenu));
  await clickMenu('Terminal');
  wins = await windows();
  check('fallback entry opens Terminal', wins.some((w) => w.name === 'ui.terminal'), JSON.stringify(wins));
  await closeAll();
  await writeVfs(page, { '/etc/contextmenu.json': savedMenu });
  await page.waitForTimeout(400);

  // ── show-context-menu service: `cmd` gets values only as $args; onSelect / command+args work
  await page.evaluate(() => {
    const show = window.platform.host.getService('001-core.layout', 'show-context-menu');
    show(900, 300, [
      { id: 'a', type: 'action', title: 'ArgsProbe', cmd: 'top.__ctxArgs = $args', args: ["a'),(top.__pwnedCtx=2),('", 'c'] },
    ]);
  });
  await page.waitForTimeout(300);
  await clickMenu('ArgsProbe');
  const ctxArgs = await page.evaluate(() => window.top.__ctxArgs);
  const pwned3 = await page.evaluate(() => window.top.__pwnedCtx);
  check('cmd entries receive args as $args values', JSON.stringify(ctxArgs) === JSON.stringify(["a'),(top.__pwnedCtx=2),('", 'c']) && pwned3 === undefined, JSON.stringify(ctxArgs));
  await page.evaluate(() => {
    const show = window.platform.host.getService('001-core.layout', 'show-context-menu');
    show(900, 300, [
      { id: 'f', type: 'action', title: 'FnProbe', onSelect: () => { window.top.__ctxFn = 'ran'; } },
      { id: 'g', type: 'group', title: 'Group', children: [{ id: 'g1', type: 'action', title: 'StructProbe', command: 'process.list', args: [] }] },
    ]);
  });
  await page.waitForTimeout(300);
  await clickMenu('FnProbe');
  check('onSelect entries run', (await page.evaluate(() => window.top.__ctxFn)) === 'ran');
  await page.evaluate(() => {
    window.__origList = window.platform.host.getCommand('process.list');
    window.__structCalls = 0;
    const show = window.platform.host.getService('001-core.layout', 'show-context-menu');
    window.platform.host.registerCommand('verify.ctx-probe', (...a) => { window.__structCalls += 1; window.__structArgs = a; });
    show(900, 300, [{ id: 'g', type: 'group', title: 'Group', children: [{ id: 'g1', type: 'action', title: 'StructProbe', command: 'verify.ctx-probe', args: ['p/q r', 7] }] }]);
  });
  await page.waitForTimeout(300);
  await clickMenu('StructProbe');
  const struct = await page.evaluate(() => ({ calls: window.__structCalls, args: window.__structArgs }));
  check('group child with command+args calls the command with values', struct.calls === 1 && JSON.stringify(struct.args) === JSON.stringify(['p/q r', 7]), JSON.stringify(struct));

  check('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.screenshot({ path: 'testing/screenshots/verify-layout-contextmenu.png' });
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} pass, ${failed.length} fail`);
process.exit(failed.length ? 1 : 0);
