import { chromium } from 'playwright';
const PORT = process.env.PORT || 8103;
const browser = await chromium.launch();
const p = await (await browser.newContext()).newPage();
p.on('console', m => { const t=m.text(); if(/DL|deeplink|webrtc|open-window|not found|rror/.test(t)) console.log('[c]', t.slice(0, 300)); });
p.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 300)));
await p.goto(`http://localhost:${PORT}/#open=ui.webrtc&app=webrtc&arg=` + encodeURIComponent('wrtc0.abc'));
for (let i=0;i<14;i++){ await p.waitForTimeout(1000); console.log(i+1,'s iframes', await p.evaluate(()=>document.querySelectorAll('iframe').length).catch(()=>'-'), 'wins', await p.evaluate(()=>document.querySelectorAll('.window').length).catch(()=>'-')); }
const r = await p.evaluate(async () => {
  const before = document.querySelectorAll('iframe').length;
  let err = null;
  try { await window.platform.host.execCommand("service('001-core.layout','open-window')(command($args[0]), $args[1])", window.platform, 'ui.webrtc', 'wrtc0.abc'); } catch (e) { err = String(e && e.message || e); }
  return { before, after: document.querySelectorAll('iframe').length, err };
});
console.log(JSON.stringify(r));
await browser.close();
