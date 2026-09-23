// Debug: fresh browser opening an invite link — does the app open, and after how many loads?
import { chromium } from 'playwright';
const PORT = process.env.PORT || 8103;
const browser = await chromium.launch();
const ctxA = await browser.newContext(); const pA = await ctxA.newPage();
await pA.goto(`http://localhost:${PORT}/#open=ui.webrtc&app=webrtc&arg=` + encodeURIComponent('wrtc0.abc'));
pA.on('console', m => { const t = m.text(); if (/deeplink|webrtc|Error|error/i.test(t)) console.log('[console]', t.slice(0, 200)); });
for (let i = 0; i < 6; i++) {
  await pA.waitForTimeout(3000);
  const st = await pA.evaluate(() => ({ hash: location.hash.slice(0, 30), sw: !!navigator.serviceWorker.controller, cmd: !!(window.platform && window.platform.host.getCommand('ui.webrtc')), frames: 0 })).catch(e => e.message);
  let app = 0; for (const f of pA.frames()) { try { if (await f.locator('#me-name').count()) app++; } catch (_) {} }
  const wins = await pA.evaluate(() => document.querySelectorAll('.window').length).catch(() => -1); console.log('windows', wins);
  console.log(i * 3 + 3 + 's', JSON.stringify(st), 'webrtc frames:', app);
}
await browser.close();
