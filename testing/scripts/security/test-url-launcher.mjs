// KRN-2 (= BOOT-1) — the `?app=` / `?apps=` URL launcher (src/remote.ts) must never turn URL
// text into code, and may pass arguments only to commands that opted in with `deepLink: true`.
//
//   ?app=<name breaking out of command('…')>         → payload must not run
//   ?apps=<base64 [{app:<breakout>}]>                → payload must not run
//   ?app=ui.iframe&args=<base64 [attacker URL]>      → the attacker page must never be fetched
// (info) ?app=ui.notepad still opens Notepad — the launcher itself keeps working.
import { BASE_URL, newSession, boot, waitBooted, startAttacker, step, report, done, sleep, sentinels, windowNames } from './lib/harness.mjs';

const b64 = (v) => Buffer.from(JSON.stringify(v), 'utf8').toString('base64');
const attacker = await startAttacker({ '/krn2-evil.html': { body: '<!doctype html><title>krn2</title><script>try{top.__sec_krn2_frame=1}catch(e){}</script>evil' } });

const S = await newSession();
try {
  const page = await boot(S.context);
  const visit = async (query) => {
    await page.goto(BASE_URL + '/' + query, { waitUntil: 'load' });
    const booted = await waitBooted(page, 90000);
    await sleep(7000); // the launcher fires ~4 s after the remote bundle loads
    return booted;
  };

  await step('KRN-2', 'app-param-breakout', async () => {
    const q = '?app=' + encodeURIComponent("explorer'),(platform.window.top.__sec_krn2_app=1),(self.__sec_krn2_self=1),('");
    const booted = await visit(q);
    const set = await sentinels(page, '__sec_krn2');
    return { pass: booted ? set.length === 0 : null, detail: `booted=${booted}; sentinels=${JSON.stringify(set)}` };
  });

  await step('KRN-2', 'apps-param-breakout', async () => {
    const q = '?apps=' + encodeURIComponent(b64([{ app: "explorer'),(platform.window.top.__sec_krn2_apps=1),('" }, { app: "x')+(self.__sec_krn2_apps2=1)+('" }]));
    const booted = await visit(q);
    const set = await sentinels(page, '__sec_krn2');
    return { pass: booted ? set.length === 0 : null, detail: `booted=${booted}; sentinels=${JSON.stringify(set)}` };
  });

  await step('KRN-2', 'args-without-deeplink-optin', async () => {
    const before = attacker.hitCount('/krn2-evil.html');
    const q = '?app=ui.iframe&args=' + encodeURIComponent(b64([attacker.url('/krn2-evil.html')]));
    const booted = await visit(q);
    await sleep(2000);
    const hits = attacker.hitCount('/krn2-evil.html') - before;
    const frames = page.frames().filter((f) => f.url().startsWith(attacker.origin)).length;
    const set = await sentinels(page, '__sec_krn2');
    return { pass: booted ? hits === 0 && frames === 0 && set.length === 0 : null, detail: `booted=${booted}; attackerFetches=${hits}; attackerFrames=${frames}; windows=${JSON.stringify(await windowNames(page))}` };
  });

  await step('KRN-2', 'launcher-still-opens-valid-name', async () => {
    const booted = await visit('?app=ui.notepad');
    const w = await windowNames(page);
    return { pass: booted ? w.includes('ui.notepad') : null, detail: `windows=${JSON.stringify(w)}` };
  }, { phase: 'info' });
} catch (e) {
  report('KRN-2', null, 'script error: ' + (e && e.stack || e), { check: 'harness' });
} finally {
  await S.close();
  await attacker.close();
}
done('test-url-launcher');
