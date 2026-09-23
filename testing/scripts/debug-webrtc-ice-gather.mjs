// Which ICE candidate types does this browser/network gather for a given server list?
import { chromium } from 'playwright';
const servers = {
  'google stun': [{ urls: 'stun:stun.l.google.com:19302' }],
  'cloudflare stun': [{ urls: 'stun:stun.cloudflare.com:3478' }],
  'none': [],
};
const b = await chromium.launch(); const p = await b.newPage();
await p.goto('about:blank');
for (const [name, ice] of Object.entries(servers)) {
  const r = await p.evaluate(async (ice) => {
    const pc = new RTCPeerConnection({ iceServers: ice }); pc.createDataChannel('x');
    const found = [], errs = []; const t0 = Date.now();
    pc.onicecandidateerror = (e) => errs.push(`${e.errorCode} ${e.url || ''} ${e.errorText || ''}`);
    pc.onicecandidate = (e) => { if (e.candidate) found.push(`${e.candidate.type}:${e.candidate.address || e.candidate.candidate.split(' ')[4]}`); };
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise(res => { const t = setTimeout(res, 8000); pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }; });
    pc.close(); return { ms: Date.now() - t0, found, errs };
  }, ice);
  console.log(name.padEnd(16), JSON.stringify(r));
}
await b.close();
