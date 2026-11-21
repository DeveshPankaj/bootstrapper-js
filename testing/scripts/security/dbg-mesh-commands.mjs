// Debug helper (not part of run-all): which webrtc.mesh.* / distributed-compute commands exist after boot.
import { newSession, boot } from './lib/harness.mjs';
const S = await newSession();
try {
  const page = await boot(S.context);
  console.log(JSON.stringify(await page.evaluate(() => {
    const names = ['webrtc.mesh.available', 'webrtc.mesh.myId', 'webrtc.mesh.groups', 'webrtc.mesh.send', 'webrtc.mesh.subscribe', 'ui.webrtc', 'ui.distributed-compute', 'webrtc.api'];
    return Object.fromEntries(names.map((n) => { const c = window.platform.host.getCommand(n); return [n, c ? { owner: c.servicePlatformName, fallback: !!(c.meta && c.meta.fallback) } : null]; }));
  })));
} finally { await S.close(); }
