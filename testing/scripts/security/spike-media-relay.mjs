// Spike Q3 follow-up — getUserMedia is denied in an opaque-origin sandbox ("Invalid security
// origin") and MediaStreamTrack can't be postMessage'd, so: can the trusted parent capture the
// mic and relay it into the sandbox over a loopback RTCPeerConnection (SDP/ICE over a
// MessageChannel)? If yes, a kernel "media broker" can grant mic/camera per app.
// Run: node testing/scripts/security/spike-media-relay.mjs   (dev server on :8080)
import { launch, bootOS, addFrame, print } from './spike-lib.mjs';

const browser = await launch(['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']);
const context = await browser.newContext();
const page = await bootOS(context);

const SRCDOC = `<!doctype html><html><head><script>
  window.__r = {};
  window.addEventListener('message', (e) => {
    if (!e.data || e.data.type !== 'media-port' || !e.ports[0]) return;
    const port = e.ports[0];
    const pc = new RTCPeerConnection();
    pc.onicecandidate = (ev) => ev.candidate && port.postMessage({ ice: ev.candidate.toJSON() });
    pc.ontrack = (ev) => {
      const t = ev.track;
      window.__r.ontrack = t.kind + ' readyState=' + t.readyState;
      // Prove the received track is usable: it can be re-sent on another PeerConnection
      // (what the WebRTC app would do to put a brokered mic track on its calls).
      try { const pc2 = new RTCPeerConnection(); pc2.addTrack(t, new MediaStream([t])); window.__r.reAddToAnotherPc = 'ok senders=' + pc2.getSenders().length; pc2.close(); }
      catch (err) { window.__r.reAddToAnotherPc = 'ERR ' + err.message; }
    };
    port.onmessage = async (m) => {
      if (m.data.offer) {
        await pc.setRemoteDescription(m.data.offer);
        const ans = await pc.createAnswer(); await pc.setLocalDescription(ans);
        port.postMessage({ answer: { type: ans.type, sdp: ans.sdp } });
      } else if (m.data.ice) { await pc.addIceCandidate(m.data.ice); }
    };
  });
</script></head><body>relay</body></html>`;

const frame = await addFrame(page, { name: 'relay-sbx', sandbox: 'allow-scripts', srcdoc: SRCDOC });
const parent = await page.evaluate(async () => {
  const f = document.querySelector('iframe[name="relay-sbx"]');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ch = new MessageChannel();
  const pc = new RTCPeerConnection();
  stream.getTracks().forEach((t) => pc.addTrack(t, stream));
  pc.onicecandidate = (ev) => ev.candidate && ch.port1.postMessage({ ice: ev.candidate.toJSON() });
  ch.port1.onmessage = async (m) => {
    if (m.data.answer) await pc.setRemoteDescription(m.data.answer);
    else if (m.data.ice) await pc.addIceCandidate(m.data.ice);
  };
  f.contentWindow.postMessage({ type: 'media-port' }, '*', [ch.port2]);
  const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
  ch.port1.postMessage({ offer: { type: offer.type, sdp: offer.sdp } });
  await new Promise((r) => setTimeout(r, 4000));
  return { parentConnectionState: pc.connectionState };
});
const inside = await frame.evaluate(() => window.__r);
print('Q3 media relay parent → sandbox over loopback RTCPeerConnection', { ...parent, ...inside });
await browser.close();
