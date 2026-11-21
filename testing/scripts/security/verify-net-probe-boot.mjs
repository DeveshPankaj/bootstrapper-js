// Diagnostic for the apps-net verify scripts: boots the OS and opens WebRTC Chat the two
// ways the older tests do (DSL execCommand and platform.host.openWindow), listing frames.
// Run: node testing/scripts/security/verify-net-probe-boot.mjs
import { launchBrowser, bootPage, waitForCommand, sleep } from './verify-net-lib.mjs';
const browser = await launchBrowser();
const p = await bootPage(browser);
console.log('ui.webrtc registered:', await waitForCommand(p, 'ui.webrtc', 30000));
const r1 = await p.evaluate(() => { try { window.platform.host.execCommand("service('001-core.layout','open-window') (command('ui.webrtc'))", window.platform); return 'ok'; } catch (e) { return 'ERR ' + e.message; } });
console.log('execCommand open:', r1);
await sleep(6000);
for (const f of p.frames()) console.log('frame:', f.url().slice(0, 120));
console.log('windows:', await p.evaluate(() => document.querySelectorAll('.window').length));
console.log('errors:', p.__errors.slice(0, 5));
await browser.close();
