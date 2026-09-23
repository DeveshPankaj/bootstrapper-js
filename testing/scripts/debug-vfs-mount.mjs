import { chromium } from 'playwright';
const PORT = process.env.PORT || 8103;
const b = await chromium.launch(); const p = await b.newPage();
p.on('pageerror', e => console.log('pageerror', e.message));
await p.goto(`http://localhost:${PORT}/`); await p.waitForTimeout(3000); await p.reload(); await p.waitForTimeout(3000); await p.reload(); await p.waitForTimeout(9000);
const r = await p.evaluate(async () => {
  const fs = window.platform.host.getFS();
  const out = {};
  out.hasMount = typeof fs.mount === 'function';
  out.hasCreateBackend = typeof fs.createBackend === 'function';
  try {
    const inner = await fs.createBackend('InMemory', {});
    fs.mount('/mnt/webrtc-test', inner);
    fs.mkdirSync('/mnt/webrtc-test/sub');
    fs.writeFileSync('/mnt/webrtc-test/hello.txt', 'hi there');
    out.listMnt = fs.readdirSync('/mnt');
    out.listMountRoot = fs.readdirSync('/mnt/webrtc-test');
    out.listSub = fs.readdirSync('/mnt/webrtc-test/sub');
    out.readBack = fs.readFileSync('/mnt/webrtc-test/hello.txt', 'utf8');
    const st = fs.statSync('/mnt/webrtc-test');
    out.statMountIsDir = st.isDirectory();
    const st2 = fs.statSync('/mnt/webrtc-test/hello.txt');
    out.fileSize = st2.size;
    out.fileMtime = String(st2.mtime);
    fs.unlinkSync('/mnt/webrtc-test/hello.txt');
    out.afterUnlink = fs.readdirSync('/mnt/webrtc-test');
    fs.umount('/mnt/webrtc-test');
    out.afterUmountListMnt = fs.readdirSync('/mnt');
    try { fs.readdirSync('/mnt/webrtc-test'); out.afterUmountReaddirOk = true; } catch (e) { out.afterUmountErr = e.message; }
  } catch (e) { out.error = e.stack || e.message; }
  return out;
});
console.log(JSON.stringify(r, null, 1));
await b.close();
