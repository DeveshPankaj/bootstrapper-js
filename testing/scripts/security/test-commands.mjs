// KRN-10 (+ I7) and KRN-12 / BOOT-9 — commands can't be hijacked, deep links can't load arbitrary code.
//
//   KRN-10 an app (vfs script run through execString, like every installed app) re-registering
//          ui.notepad / ui.remote-machines doesn't replace them
//   KRN-10 an app claiming .txt/.svg with title "AAA" doesn't become their default handler
//   BOOT-9 #open=x&app=..          doesn't run /opt/main.js
//   BOOT-9 #open=x&app=<not installed> doesn't run /opt/apps/<id>/main.js
//   KRN-12 (phase2) a same-origin listener acking every deep-link handoff can swallow links
import { BASE_URL, newSession, boot, openWindow, windowNames, step, report, done, sleep, pollFor, sentinels, vfsWrite, closeAllWindows, isBooted } from './lib/harness.mjs';

const S = await newSession();
try {
  const page = await boot(S.context, { dialogPolicy: 'dismiss' });
  const evilApp = (name, extra = '') => `platform.host.registerCommand(${JSON.stringify(name)}, (body, props) => { window.top.__sec_k10_${name.replace(/\W/g, '_')} = 1; try { props.setWindowView(true); } catch (_) {} }, { title: 'Evil ' + ${JSON.stringify(name)}, __secEvil: true ${extra} });`;
  const runAsApp = (src, alias) => page.evaluate(({ src, alias }) => { try { window.platform.host.execString(src, alias); return 'ran'; } catch (e) { return 'threw ' + String(e.message || e).slice(0, 80); } }, { src, alias });

  for (const name of ['ui.notepad', 'ui.remote-machines']) {
    await step('KRN-10', `app-cannot-replace-${name}`, async () => {
      const before = await page.evaluate((n) => { const c = window.platform.host.getCommand(n); return c ? c.servicePlatformName : null; }, name);
      if (!before) return { pass: null, detail: `${name} not registered` };
      const r = await runAsApp(evilApp(name), '/home/user1/sec-evil-app/main.js');
      const meta = await page.evaluate((n) => !!(window.platform.host.getCommand(n)?.meta?.__secEvil), name);
      await openWindow(page, name);
      await sleep(1500);
      const s = await sentinels(page, '__sec_k10');
      await closeAllWindows(page);
      await page.evaluate(() => { for (const k of Object.keys(window)) if (k.startsWith('__sec_k10')) delete window[k]; });
      return { pass: !meta && s.length === 0, detail: `owner before=${before}; script ${r}; replaced=${meta}; sentinels=${JSON.stringify(s)}` };
    });
  }

  await step('KRN-10', 'extension-claim-not-default', async () => {
    await vfsWrite(page, { '/home/user1/sec-k10/readme.txt': 'hello', '/home/user1/sec-k10/pic.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>' });
    await runAsApp(evilApp('sec.aaa', ", fileExtensions: ['.txt', '.svg', '.md']").replace("'Evil ' + \"sec.aaa\"", "'AAA'"), '/home/user1/sec-evil-app2/main.js');
    const opened = {};
    for (const f of ['readme.txt', 'pic.svg']) {
      await closeAllWindows(page);
      await page.evaluate((p) => { try { window.platform.host.exec(window.platform, p); } catch (_) {} }, '/home/user1/sec-k10/' + f);
      await sleep(1500);
      opened[f] = await windowNames(page);
    }
    const s = await sentinels(page, '__sec_k10');
    await closeAllWindows(page);
    const hijacked = Object.values(opened).some((w) => w.includes('sec.aaa'));
    return { pass: !hijacked && s.length === 0, detail: `opened=${JSON.stringify(opened)}; sentinels=${JSON.stringify(s)}` };
  });

  // ── deep links: a fresh tab opened from a link ────────────────────────────
  await vfsWrite(page, {
    '/opt/main.js': 'window.top.__sec_dl_dotdot = 1;',
    '/opt/apps/sec-dl-evil/main.js': 'window.top.__sec_dl_evil = 1;',
  });
  await sleep(2000); // let the IndexedDB mirror flush before another tab boots
  const viaLink = async (hash) => {
    const p = await S.context.newPage();
    p.__dialogPolicy = 'dismiss';
    await p.goto(BASE_URL + '/' + hash, { waitUntil: 'load' });
    const booted = await pollFor(() => isBooted(p), 60000, 500);
    await sleep(7000);
    const s = await sentinels(p, '__sec_dl');
    await p.close().catch(() => {});
    return { booted: !!booted, s };
  };
  await step('BOOT-9', 'deeplink-app-dotdot', async () => {
    const r = await viaLink('#open=sec-nope&app=..');
    return { pass: r.booted ? r.s.length === 0 : null, detail: `booted=${r.booted}; sentinels=${JSON.stringify(r.s)}` };
  });
  await step('BOOT-9', 'deeplink-uninstalled-app', async () => {
    const r = await viaLink('#open=sec-nope2&app=sec-dl-evil');
    return { pass: r.booted ? r.s.length === 0 : null, detail: `booted=${r.booted}; sentinels=${JSON.stringify(r.s)}` };
  });

  // ── KRN-12 (phase 2): a rogue same-origin listener swallows a handoff ─────
  await step('KRN-12', 'deeplink-handoff-not-swallowable', async () => {
    await page.evaluate(() => {
      const bc = new BroadcastChannel('wos-deeplink');
      window.__secAcks = 0;
      bc.onmessage = (e) => { if (e.data && e.data.t === 'open') { window.__secAcks++; bc.postMessage({ t: 'ack', id: e.data.id }); } };
      window.__secBc = bc;
    });
    const p = await S.context.newPage();
    await p.goto(BASE_URL + '/#open=ui.webrtc&arg=sec-handoff', { waitUntil: 'load' });
    const booted = await pollFor(() => isBooted(p), 25000, 500);
    const text = await p.evaluate(() => (document.body && document.body.innerText || '').slice(0, 80)).catch(() => '');
    await p.close().catch(() => {});
    const acks = await page.evaluate(() => window.__secAcks);
    await page.evaluate(() => window.__secBc && window.__secBc.close());
    return { pass: !!booted, detail: `newTabBooted=${!!booted}; rogueAcks=${acks}; newTabText=${JSON.stringify(text)}` };
  }, { phase: 'phase2' });

  await step('KRN-10', 'explorer-owned-by-files-app', async () => {
    const o = await page.evaluate(() => { const c = window.platform.host.getCommand('explorer'); return c ? { owner: c.servicePlatformName, fallback: !!(c.meta && c.meta.fallback) } : null; });
    return { pass: !!o && !o.fallback, detail: JSON.stringify(o) };
  }, { phase: 'info' });
} catch (e) {
  report('KRN-10', null, 'script error: ' + (e && e.stack || e), { check: 'harness' });
} finally {
  await S.close();
}
done('test-commands');
