// Sanity check: can Chromium allocate a relay candidate from a local node-turn server (127.0.0.1:3478, wrtc/secret)?
import { chromium } from 'playwright';
const b = await chromium.launch(); const p = await b.newPage(); await p.goto('about:blank');
const r = await p.evaluate(async () => {
  const pc = new RTCPeerConnection({ iceTransportPolicy: 'relay', iceServers: [{ urls: 'turn:127.0.0.1:3478?transport=udp', username: 'wrtc', credential: 'secret' }] });
  pc.createDataChannel('x'); const found = [], errs = [];
  pc.onicecandidateerror = (e) => errs.push(`${e.errorCode} ${e.errorText}`);
  pc.onicecandidate = (e) => { if (e.candidate) found.push(e.candidate.candidate); };
  await pc.setLocalDescription(await pc.createOffer());
  await new Promise(res => { const t = setTimeout(res, 6000); pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }; });
  pc.close(); return { found, errs };
});
console.log(JSON.stringify(r, null, 1)); await b.close();
