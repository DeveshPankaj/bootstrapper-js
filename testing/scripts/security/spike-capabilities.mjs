// Spike Q3 — which platform capabilities still work inside an opaque-origin sandboxed
// iframe (no allow-same-origin): Workers, WASM, WebGL, WebRTC, getUserMedia, clipboard,
// fullscreen, modals, downloads, eval, MessageChannel + transferables.
// A same-origin, non-sandboxed control frame separates "sandbox blocks it" from
// "headless Chromium can't do it anyway".
// Run: node testing/scripts/security/spike-capabilities.mjs   (dev server on :8080)
import { launch, bootOS, addFrame, print, PROBE_HELPERS } from './spike-lib.mjs';

const browser = await launch(['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--enable-unsafe-swiftshader']);
const context = await browser.newContext({ acceptDownloads: true });
const page = await bootOS(context);

const dialogs = [], downloads = [], consoleMsgs = [];
page.on('dialog', async (d) => { dialogs.push(`${d.type()}:${d.message()}`); await d.accept(); });
page.on('download', (d) => downloads.push(d.suggestedFilename()));
page.on('console', (m) => { if (/sandbox|allow-|disallowed|Ignored call|Permissions policy|permission/i.test(m.text())) consoleMsgs.push(m.text().slice(0, 220)); });

const ALLOW = 'microphone; camera; clipboard-write; clipboard-read; fullscreen; display-capture';
const SRCDOC = `<!doctype html><html><head><script>${PROBE_HELPERS}
  window.__r = {};
  window.addEventListener('message', (e) => {
    if (!e.data || e.data.type !== 'spike-port' || !e.ports[0]) return;
    const port = e.ports[0];
    port.onmessage = (ev) => {
      const buf = ev.data.buf;
      const back = new ArrayBuffer(16);
      port.postMessage({ gotBytes: buf.byteLength, first: new Uint8Array(buf)[0], back }, [back]);
      window.__r.backAfterTransfer = back.byteLength;
    };
    port.postMessage({ ready: true });
  });
</script></head><body>
<button id="fs" onclick="document.documentElement.requestFullscreen().then(() => { __r.fullscreen = 'ALLOWED: fullscreenElement=' + !!document.fullscreenElement; document.exitFullscreen().catch(()=>{}) }).catch(e => __r.fullscreen = 'BLOCKED: ' + e.name + ': ' + e.message.slice(0,120))">fs</button>
<button id="clip" onclick="navigator.clipboard.writeText('spike').then(() => __r.clipboard = 'ALLOWED').catch(e => __r.clipboard = 'BLOCKED: ' + e.name + ': ' + e.message.slice(0,120))">clip</button>
<a id="dl" download="spike-download.txt">dl</a>
<script>document.getElementById('dl').href = URL.createObjectURL(new Blob(['spike'], { type: 'text/plain' }));</script>
</body></html>`;

async function probe(frame) {
  return frame.evaluate(async (allow) => {
    const p = window.__probe, ap = window.__aprobe, out = { origin: self.origin };
    out.worker = await ap(() => new Promise((res, rej) => {
      const w = new Worker(URL.createObjectURL(new Blob([
        "let idb; try { indexedDB.open('w'); idb = 'idb ALLOWED' } catch (e) { idb = 'idb BLOCKED ' + e.name } postMessage(self.origin + ' / ' + idb)"])));
      w.onmessage = (e) => res('worker origin=' + e.data); w.onerror = (e) => rej(new Error(e.message || 'worker error'));
      setTimeout(() => rej(new Error('timeout')), 5000);
    }));
    out.moduleWorker = await ap(() => new Promise((res, rej) => {
      const w = new Worker(URL.createObjectURL(new Blob(["postMessage('module worker ok')"], { type: 'text/javascript' })), { type: 'module' });
      w.onmessage = (e) => res(e.data); w.onerror = (e) => rej(new Error(e.message || 'worker error'));
      setTimeout(() => rej(new Error('timeout')), 5000);
    }));
    out.wasm = await ap(async () => {
      const bytes = new Uint8Array([0,97,115,109,1,0,0,0, 1,7,1,96,2,127,127,1,127, 3,2,1,0, 7,7,1,3,97,100,100,0,0, 10,9,1,7,0,32,0,32,1,106,11]);
      const { instance } = await WebAssembly.instantiate(bytes);
      return 'add(2,3)=' + instance.exports.add(2, 3);
    });
    out.webgl = p(() => { const gl = document.createElement('canvas').getContext('webgl'); return gl ? gl.getParameter(gl.VERSION) : 'null context'; });
    out.webgl2 = p(() => { const gl = document.createElement('canvas').getContext('webgl2'); return gl ? gl.getParameter(gl.VERSION) : 'null context'; });
    out.rtcDataChannel = await ap(async () => {
      const a = new RTCPeerConnection(), b = new RTCPeerConnection();
      a.onicecandidate = (e) => e.candidate && b.addIceCandidate(e.candidate);
      b.onicecandidate = (e) => e.candidate && a.addIceCandidate(e.candidate);
      const got = new Promise((res) => { b.ondatachannel = (ev) => { ev.channel.onmessage = (m) => res(m.data); }; });
      const ch = a.createDataChannel('t');
      ch.onopen = () => ch.send('hello-dc');
      const offer = await a.createOffer(); await a.setLocalDescription(offer); await b.setRemoteDescription(offer);
      const ans = await b.createAnswer(); await b.setLocalDescription(ans); await a.setRemoteDescription(ans);
      const r = await Promise.race([got, new Promise((res) => setTimeout(() => res('TIMEOUT'), 8000))]);
      a.close(); b.close();
      if (r === 'TIMEOUT') throw new Error('datachannel timeout');
      return 'received ' + r;
    });
    out['permissionsPolicy mic/cam'] = p(() => {
      const fp = document.featurePolicy || document.permissionsPolicy;
      return fp ? `microphone=${fp.allowsFeature('microphone')} camera=${fp.allowsFeature('camera')}` : 'no featurePolicy API';
    });
    out.getUserMedia = await ap(async () => {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      const kinds = s.getTracks().map((t) => t.kind).join(','); s.getTracks().forEach((t) => t.stop());
      return 'tracks=' + kinds;
    });
    out['permissions.query(mic)'] = await ap(async () => (await navigator.permissions.query({ name: 'microphone' })).state);
    out.getDisplayMedia = await ap(async () => typeof navigator.mediaDevices.getDisplayMedia);
    out.eval = p(() => eval('1 + 1'));
    out['new Function'] = p(() => new Function('return 2')());
    out.fullscreenEnabled = p(() => document.fullscreenEnabled);
    return out;
  }, ALLOW);
}

async function gestures(frame, name) {
  // Real clicks (user activation) for fullscreen / clipboard / download.
  await frame.click('#fs', { force: true }).catch(() => {});
  await frame.waitForTimeout(500);
  await frame.click('#clip', { force: true }).catch(() => {});
  await frame.waitForTimeout(500);
  const before = downloads.length;
  await frame.click('#dl', { force: true }).catch(() => {});
  await frame.waitForTimeout(1500);
  const r = await frame.evaluate(() => window.__r);
  return { ...r, download: downloads.length > before ? 'ALLOWED: ' + downloads[downloads.length - 1] : 'BLOCKED: no download event' };
}

async function modals(frame) {
  const before = dialogs.length;
  const confirmResult = await frame.evaluate(() => { alert('spike-alert'); return confirm('spike-confirm'); });
  await frame.waitForTimeout(300);
  return { confirmReturned: String(confirmResult), dialogsSeen: dialogs.slice(before).join(' | ') || 'none' };
}

async function portTransfer(name) {
  return page.evaluate(async (name) => {
    const f = document.querySelector(`iframe[name="${name}"]`);
    const ch = new MessageChannel();
    const msgs = [];
    const done = new Promise((res) => {
      ch.port1.onmessage = (e) => {
        msgs.push(e.data);
        if (e.data.ready) {
          const buf = new ArrayBuffer(1024); new Uint8Array(buf)[0] = 42;
          ch.port1.postMessage({ buf }, [buf]);
          msgs.push({ parentBufAfterTransfer: buf.byteLength });
        } else if (e.data.gotBytes !== undefined) res();
      };
      setTimeout(res, 4000);
    });
    f.contentWindow.postMessage({ type: 'spike-port' }, '*', [ch.port2]);
    await done;
    const reply = msgs.find((m) => m.gotBytes !== undefined);
    return {
      sandboxGotBytes: reply ? reply.gotBytes : 'no reply', firstByte: reply ? reply.first : '-',
      parentBufAfterTransfer: msgs.find((m) => m.parentBufAfterTransfer !== undefined)?.parentBufAfterTransfer,
      parentReceivedBackBytes: reply && reply.back ? reply.back.byteLength : '-',
    };
  }, name);
}

const variants = [
  ['cap-sbx', 'allow-scripts allow-modals allow-downloads allow-forms', ALLOW],
  ['cap-sbx-star', 'allow-scripts allow-modals allow-downloads allow-forms', 'microphone *; camera *; clipboard-write *; fullscreen *'],
  ['cap-sbx-bare', 'allow-scripts', ALLOW],
  ['cap-ctrl-sameorigin', null, ALLOW],
];
for (const [name, sandbox, allow] of variants) {
  const f = await addFrame(page, { name, sandbox, allow, allowfullscreen: true, srcdoc: SRCDOC });
  const out = { sandbox: sandbox ?? '(none: same-origin control)', allow, ...(await probe(f)), ...(await gestures(f, name)), ...(await modals(f)), ...(await portTransfer(name)) };
  print(`Q3 ${name}`, out);
}
console.log('\n=== relevant console messages');
for (const m of [...new Set(consoleMsgs)]) console.log('  ' + m);
await browser.close();
