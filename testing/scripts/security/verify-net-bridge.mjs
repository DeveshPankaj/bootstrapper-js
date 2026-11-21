// NET-7 quick part (TODO 1E.6): Remote Machines must not send a sign-in or the bridge token to
// a bridge address the person hasn't approved (settings.json is an ordinary, writable VFS file).
// Two fake bridges (plain Node http + a hand-rolled WebSocket handshake) record every socket and
// the first message (the SSH login) that reaches them.
// Run: node testing/scripts/security/verify-net-bridge.mjs   (dev server on :8080; uses ports 7191/7192)
import http from 'node:http';
import crypto from 'node:crypto';
import { launchBrowser, bootPage, openWindow, appFrame, waitFor, waitForCommand, check, finish, sleep } from './verify-net-lib.mjs';

function fakeBridge(port) {
  const seen = { upgrades: 0, logins: [] };
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.url.startsWith('/health')) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ bridge: 'workspace-ssh', version: '9.9.9', originAllowed: true })); return; }
    res.statusCode = 404; res.end();
  });
  server.on('upgrade', (req, socket) => {
    seen.upgrades++;
    const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    let buf = Buffer.alloc(0);
    socket.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (buf.length < 2) return;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      if (buf.length < off + 4 + len) return;
      const mask = buf.subarray(off, off + 4), data = Buffer.from(buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
      seen.logins.push(data.toString('utf8'));
      socket.end();
    });
    socket.on('error', () => {});
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, seen })));
}

const A = await fakeBridge(7191), B = await fakeBridge(7192);
const browser = await launchBrowser();
let answer = 'dismiss';
const page = await bootPage(browser, { onDialog: async (d) => { if (answer === 'accept') await d.accept(); else await d.dismiss(); } });

// An attacker (any app or peer able to write VFS files) points the bridge at its own server.
await page.evaluate(() => {
  const fs = window.fs, dir = '/home/user1/.local/share/remote-machines'; let cur = '';
  for (const p of dir.split('/').filter(Boolean)) { cur += '/' + p; if (!fs.existsSync(cur)) fs.mkdirSync(cur); }
  fs.writeFileSync(dir + '/settings.json', JSON.stringify({ bridgeUrl: 'http://127.0.0.1:7191' }));
  fs.writeFileSync(dir + '/connections.json', JSON.stringify([{ id: 'c1', name: 'box', host: '10.9.9.9', port: 22, username: 'root', auth: 'password', root: '/', remember: false }]));
});
await waitForCommand(page, 'ui.remote-machines');
await openWindow(page, 'ui.remote-machines');
const f = await appFrame(page, 'remote-machines/main.html');
await waitFor(() => f.evaluate(() => !!window.__remoteMachines), 20000);
// The sign-in for this machine is in memory (as if typed); the bridge token is remembered.
await f.evaluate(async () => { await keepSecret('c1', { password: 'hunter2' }, false); await keepSecret('bridge', { token: 'TOKEN-123' }, true); });

const connect = () => f.evaluate(async () => { const rm = window.__remoteMachines; const c = rm.conns.find((x) => x.id === 'c1'); const st = rm.stateOf(c); st.session.close(); st.session.status = 'offline'; await st.session.connect(); return { status: st.session.status, error: st.session.error }; });

let n = page.__dialogs.length;
const r1 = await connect();
check('NET-7: connecting through an unapproved bridge asks first', page.__dialogs.length === n + 1 && page.__dialogs.at(-1).message.includes('http://127.0.0.1:7191'), page.__dialogs.at(-1)?.message);
await sleep(800);
check('NET-7: declined → no socket is opened, nothing sent', A.seen.upgrades === 0 && A.seen.logins.length === 0, JSON.stringify(A.seen));
check('NET-7: declined → the session says why', r1.status === 'error' && /wasn't approved/.test(r1.error), JSON.stringify(r1));

answer = 'accept';
await connect();
check('NET-7: approved → the login reaches the bridge', await waitFor(() => A.seen.logins.length === 1, 8000), JSON.stringify(A.seen));
const login = JSON.parse(A.seen.logins[0] || '{}');
check('NET-7: (and it carries the sign-in + token — so the gate is what kept them back)', login.type === 'ssh' && login.password === 'hunter2' && login.bridgeToken === 'TOKEN-123', A.seen.logins[0]);
const sealed = await page.evaluate(() => JSON.parse(window.fs.readFileSync('/home/user1/.local/share/remote-machines/secrets.json', 'utf8')));
check('NET-7: the approval is stored sealed (no plaintext origin in secrets.json)', !!sealed['bridge-approved'] && !JSON.stringify(sealed).includes('7191'), Object.keys(sealed).join(','));

// The address changes again (e.g. settings.json rewritten) → asked again, naming the old one.
answer = 'dismiss'; n = page.__dialogs.length;
await f.evaluate(() => { window.__remoteMachines.settings.bridgeUrl = 'http://127.0.0.1:7192'; });
await connect();
check('NET-7: a changed bridge origin is asked about, naming the approved one', page.__dialogs.length === n + 1 && /127\.0\.0\.1:7192/.test(page.__dialogs.at(-1).message) && /7191/.test(page.__dialogs.at(-1).message), page.__dialogs.at(-1)?.message);
await sleep(800);
check('NET-7: declined → nothing reaches the new bridge', B.seen.upgrades === 0, JSON.stringify(B.seen));

// Saving the address in Bridge settings is an explicit choice: approved without a prompt,
// and the token is sealed with that origin.
await f.evaluate(() => document.getElementById('bridge').click());
await waitFor(() => f.evaluate(() => !!document.querySelector('.modal input[type=url]')), 5000);
await f.evaluate(() => { const i = document.querySelector('.modal input[type=url]'); i.value = 'http://127.0.0.1:7192'; i.dispatchEvent(new Event('input')); });
await f.evaluate(() => [...document.querySelectorAll('.modal button')].find((b) => b.textContent.trim() === 'Save').click());
await sleep(800);
n = page.__dialogs.length;
await connect();
check('NET-7: an address saved in Bridge settings connects without a prompt', page.__dialogs.length === n && await waitFor(() => B.seen.logins.length === 1, 8000), JSON.stringify({ dialogs: page.__dialogs.length - n, seen: B.seen }));
check('NET-7: the re-saved token goes to the bridge it was saved for', JSON.parse(B.seen.logins[0] || '{}').bridgeToken === 'TOKEN-123', B.seen.logins[0]);

await f.evaluate(() => { for (const st of window.__remoteMachines.live.values()) st.session.close(); });
check('no page errors', !page.__errors.length, page.__errors.join(' | '));
A.server.close(); B.server.close();
await finish(browser);
