// Spike Q3 follow-up — third-party iframes nested INSIDE an opaque-origin app sandbox inherit
// its sandbox flags. Does a YouTube embed (youtube-player app) / a plain site still work there?
// Also: does allow-popups(-to-escape-sandbox) let an app open an UN-sandboxed tab of the OS origin
// itself (a full escape: that tab gets the IndexedDB that holds the whole vfs)?
// Run: node testing/scripts/security/spike-nested-embed.mjs   (dev server on :8080, needs internet)
import { launch, bootOS, addFrame, print } from './spike-lib.mjs';

const browser = await launch(['--autoplay-policy=no-user-gesture-required']);
const context = await browser.newContext();
const page = await bootOS(context);
const YT = 'https://www.youtube.com/embed/M7lc1UVf-VE';

const probeEmbed = async (hostName) => {
  const host = page.frame({ name: hostName });
  await page.waitForTimeout(8000);
  const inner = host.childFrames()[0];
  if (!inner) return { error: 'no nested frame' };
  return inner.evaluate(() => {
    let cookie; try { document.cookie; cookie = 'ALLOWED'; } catch (e) { cookie = 'BLOCKED ' + e.name; }
    let ls; try { localStorage.length; ls = 'ALLOWED'; } catch (e) { ls = 'BLOCKED ' + e.name; }
    return { origin: self.origin, href: location.href.slice(0, 60), cookie, localStorage: ls,
      ytPlayer: !!document.querySelector('.html5-video-player'), ytError: (document.querySelector('.ytp-error')?.innerText || '').slice(0, 80) };
  }).catch((e) => ({ evalError: e.message.slice(0, 120) }));
};

for (const [name, sandbox] of [['yt-sbx', 'allow-scripts allow-forms allow-modals'], ['yt-sbx-popups-only', 'allow-scripts allow-popups'], ['yt-sbx-popups', 'allow-scripts allow-popups allow-popups-to-escape-sandbox'], ['yt-ctrl', null]]) {
  await addFrame(page, { name, sandbox, srcdoc: `<!doctype html><body style="margin:0"><iframe src="${YT}" width="300" height="170" allow="autoplay; encrypted-media; fullscreen"></iframe>
    <a id="ext" href="http://localhost:8080/404.html" target="_blank">ext</a></body>` });
  const embed = await probeEmbed(name);
  // External link from the app frame: popup blocked / sandboxed / escapes?
  let popup = 'no popup';
  const host = page.frame({ name });
  const p = context.waitForEvent('page', { timeout: 4000 }).catch(() => null);
  await host.click('#ext', { force: true }).catch(() => {});
  const pg = await p;
  if (pg) {
    await pg.waitForLoadState('load').catch(() => {});
    popup = await pg.evaluate(() => { let ls; try { localStorage.length; ls = 'storage ok'; } catch (e) { ls = 'storage BLOCKED'; } return `opened ${location.host} origin=${self.origin} ${ls} opener=${window.opener === null ? 'null' : 'set'}`; }).catch((e) => 'ERR ' + e.message.slice(0, 80));
    await pg.close();
  }
  print(`nested YouTube embed in app frame ${name} (sandbox=${sandbox ?? 'none'})`, { ...embed, 'target=_blank link': popup });
}
await browser.close();
