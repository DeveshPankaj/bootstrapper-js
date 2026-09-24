import { chromium } from 'playwright';
const PORT = process.env.PORT || 8103, URL = `http://localhost:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const ctx = await b.newContext();
await ctx.grantPermissions(['microphone'], { origin: URL });
const p = await ctx.newPage();
p.on('pageerror', e => console.log('pageerror', e.message));
await p.goto(URL); await p.waitForTimeout(3000); await p.reload(); await p.waitForTimeout(3000); await p.reload(); await p.waitForTimeout(9000);
await p.evaluate(() => window.platform.host.execCommand("service('001-core.layout','open-window') (command('ui.webrtc'))", window.platform));
await p.waitForTimeout(2500);
let f = null;
for (let i = 0; i < 10 && !f; i++) { for (const fr of p.frames()) { try { if (await fr.locator('#me-name').count()) f = fr; } catch (_) {} } if (!f) await p.waitForTimeout(500); }
console.log('found webrtc frame:', !!f, f ? f.url() : null);
const result = await f.evaluate(async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return { ok: true, tracks: stream.getAudioTracks().map(t => ({ label: t.label, kind: t.kind, enabled: t.enabled })) };
  } catch (e) { return { ok: false, name: e.name, message: e.message }; }
});
console.log('getUserMedia result:', JSON.stringify(result, null, 1));
await b.close();
