// Verifies 1B.5 (audit KRN-5) end to end through the real AppSDK → ProxyFS port of
// sandboxAppIframe apps (src/core/window-manager.ts → src/platform/{namespace,proxy-fs}.ts):
//   - targets are normalised (/tmp/../etc/crontab is refused), kernel-owned paths never writable
//   - per-app /tmp/<id>; other apps' ~/.local/share/<id> not readable
//   - the consumers keep working: snake-game reads/writes its own data dir, the shared
//     TrainBoard log stays writable, AI DOM Lens still lists Vector Store's projects
// The unit cases live in src/platform/namespace.test.ts (npx vitest run).
//
// Run: node testing/scripts/security/verify-host-namespace.mjs   (OS dev server on :8080)
// Exit code: 0 = all checks pass, 1 = a check failed.
import { launch, bootOS } from './spike-lib.mjs';

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const DATA = '/home/user1/.local/share';

const browser = await launch();
const context = await browser.newContext();
try {
  const page = await bootOS(context);
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.evaluate((DATA) => {
    const fs = window.fs;
    const put = (p, c) => { const d = p.slice(0, p.lastIndexOf('/')); if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(p, c); };
    put(`${DATA}/snake-game/highscore.txt`, '42');
    put(`${DATA}/remote-machines/connections.json`, '{"password":"SECRET"}');
    put(`${DATA}/ui.vector-store/kb-verify.json`, JSON.stringify({ slug: 'kb-verify', name: 'KB Verify', rows: [] }));
    put('/home/user1/ns-public.txt', 'public');
    try { fs.unlinkSync('/etc/ns-verify.txt'); } catch (_) {}
  }, DATA);

  const appFrame = async (pagePath) => {
    for (let i = 0; i < 60; i++) {
      const f = page.frames().find((fr) => fr.url().includes(pagePath));
      if (f && await f.evaluate(() => !!window.AppSDK).catch(() => false)) return f;
      await page.waitForTimeout(250);
    }
    return null;
  };

  // snake-game: its page reads its own (alias-named) data dir through the real app code.
  await page.evaluate(() => platform.host.openWindow('ui.snake-game'));
  const snake = await appFrame('/opt/apps/snake-game/main.html');
  check('snake-game opens with the AppSDK bridge', !!snake);
  if (snake) {
    let best = '';
    for (let i = 0; i < 20 && !best.includes('42'); i++) { best = await snake.evaluate(() => document.getElementById('best')?.textContent || ''); await page.waitForTimeout(250); }
    check('snake-game reads its own ~/.local/share/snake-game (high score shown)', best.includes('42'), best);

    const r = await snake.evaluate(async (DATA) => {
      const t = async (fn) => { try { const v = await fn(); return 'OK ' + JSON.stringify(v).slice(0, 40); } catch (e) { return 'DENIED ' + String(e.message).slice(0, 90); } };
      return {
        ownWrite: await t(() => AppSDK.writeText(`${DATA}/snake-game/highscore.txt`, '43')),
        ownAliasWrite: await t(() => AppSDK.writeText(`${DATA}/ui.snake-game/state.json`, '{}')),
        trainboard: await t(() => AppSDK.writeText(`${DATA}/trainboard/verify.jsonl`, '{}\n')),
        ownTmp: await t(() => AppSDK.writeText('/tmp/ui.snake-game/x.txt', 'x')),
        sharedTmp: await t(() => AppSDK.writeText('/tmp/ns-verify.txt', 'x')),
        traversal: await t(() => AppSDK.writeText('/tmp/../etc/ns-verify.txt', 'pwn')),
        traversal2: await t(() => AppSDK.writeText('/tmp/ui.snake-game/../../etc/ns-verify.txt', 'pwn')),
        appDir: await t(() => AppSDK.writeText('/opt/apps/snake-game/main.html', 'x')),
        varLog: await t(() => AppSDK.writeText('/var/log/ns-verify.txt', 'x')),
        foreignRead: await t(() => AppSDK.readText(`${DATA}/remote-machines/connections.json`)),
        foreignRead2: await t(() => AppSDK.readText(`${DATA}/ui.snake-game/../remote-machines/connections.json`)),
        dataRootList: await t(() => AppSDK.list(DATA)),
        publicRead: await t(() => AppSDK.readText('/home/user1/ns-public.txt')),
        appDirRead: await t(() => AppSDK.exists('/opt/apps/snake-game/main.html')),
      };
    }, DATA);
    console.log('   ', JSON.stringify(r));
    const ok = (k) => r[k]?.startsWith('OK');
    const denied = (k) => r[k]?.startsWith('DENIED');
    check('writes: own data dir (both names), TrainBoard log, own /tmp/<id>', ok('ownWrite') && ok('ownAliasWrite') && ok('trainboard') && ok('ownTmp'), JSON.stringify({ ownWrite: r.ownWrite, ownAliasWrite: r.ownAliasWrite, trainboard: r.trainboard, ownTmp: r.ownTmp }));
    check('writes refused: shared /tmp, /var/log, own appDir (/opt)', denied('sharedTmp') && denied('varLog') && denied('appDir'), JSON.stringify({ sharedTmp: r.sharedTmp, varLog: r.varLog, appDir: r.appDir }));
    check('traversal /tmp/../etc refused, nothing written', denied('traversal') && denied('traversal2') && !(await page.evaluate(() => window.fs.existsSync('/etc/ns-verify.txt'))), JSON.stringify({ traversal: r.traversal, traversal2: r.traversal2 }));
    check("reads refused: another app's private data (also via ..), the data root", denied('foreignRead') && denied('foreignRead2') && denied('dataRootList') && !String(r.foreignRead).includes('SECRET'), JSON.stringify({ foreignRead: r.foreignRead, foreignRead2: r.foreignRead2, dataRootList: r.dataRootList }));
    check('reads allowed: user files, own app files', ok('publicRead') && ok('appDirRead'), JSON.stringify({ publicRead: r.publicRead, appDirRead: r.appDirRead }));
    check('own write landed where it was checked', (await page.evaluate((DATA) => window.fs.readFileSync(`${DATA}/snake-game/highscore.txt`, 'utf8'), DATA)) === '43');
  }

  // TrainBoard reads the shared log the other apps write.
  await page.evaluate(() => platform.host.openWindow('ui.trainboard'));
  const tb = await appFrame('/opt/apps/trainboard/main.html');
  const tbRead = tb ? await tb.evaluate(async (DATA) => { try { return 'OK ' + (await AppSDK.readText(`${DATA}/trainboard/verify.jsonl`)).length; } catch (e) { return 'DENIED ' + e.message; } }, DATA) : 'no frame';
  check('TrainBoard reads the shared log', tbRead.startsWith('OK'), tbRead);

  // AI DOM Lens keeps its read-only view of Vector Store's projects (explicit cross-app grant).
  // It isn't bootstrapped by meta.json (installed from the registry), so install its static copy.
  await page.evaluate(async () => {
    const fs = window.fs;
    if (!fs.existsSync('/opt/apps/ai-dom-lens')) fs.mkdirSync('/opt/apps/ai-dom-lens', { recursive: true });
    for (const f of ['main.js', 'main.html']) fs.writeFileSync(`/opt/apps/ai-dom-lens/${f}`, await (await fetch(`/public/mount/opt/apps/ai-dom-lens/${f}`)).text());
    platform._appDir = '/opt/apps/ai-dom-lens';
    try { platform.host.runFile(platform, '/opt/apps/ai-dom-lens/main.js', [], { confirm: false }); } finally { delete platform._appDir; }
  });
  await page.evaluate(() => platform.host.openWindow('ui.ai-dom-lens'));
  const lens = await appFrame('/opt/apps/ai-dom-lens/main.html');
  if (lens) {
    let opts = [];
    for (let i = 0; i < 40 && !opts.includes('KB Verify (0v)'); i++) {
      opts = await lens.evaluate(() => [...(document.getElementById('vsSel')?.options || [])].map((o) => o.textContent)).catch(() => []);
      if (!opts.includes('KB Verify (0v)')) { await lens.evaluate(() => typeof loadVsProjects === 'function' && loadVsProjects()).catch(() => {}); await page.waitForTimeout(500); }
    }
    check("AI DOM Lens still lists Vector Store's projects", opts.includes('KB Verify (0v)'), JSON.stringify(opts));
    const w = await lens.evaluate(async (DATA) => { try { await AppSDK.writeText(`${DATA}/ui.vector-store/kb-verify.json`, 'x'); return 'OK'; } catch (e) { return 'DENIED'; } }, DATA);
    check("AI DOM Lens can't write Vector Store's data", w === 'DENIED', w);
  } else check('AI DOM Lens opens with the AppSDK bridge', false);
} finally {
  await context.close();
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
