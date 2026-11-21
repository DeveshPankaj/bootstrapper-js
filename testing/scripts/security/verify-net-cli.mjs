// NET-6 (TODO 1E.5): webrtc.api subcommands that change something, called from outside the
// WebRTC window (another app, the terminal's /bin/webrtc.run), need the person's OK in the
// WebRTC window, naming the exact action; read-only subcommands answer as before.
// Run: node testing/scripts/security/verify-net-cli.mjs   (dev server on :8080)
import { launchBrowser, bootPage, openWindow, appFrame, waitFor, waitForCommand, check, finish } from './verify-net-lib.mjs';

const browser = await launchBrowser();
let answer = 'dismiss';
const page = await bootPage(browser, { onDialog: async (d) => { if (answer === 'accept') await d.accept(); else await d.dismiss(); } });
await waitForCommand(page, 'ui.webrtc');
await openWindow(page, 'ui.webrtc');
const f = await appFrame(page, 'webrtc/main.html');
await waitFor(() => f.evaluate(() => !!window.__webrtcApp), 20000);
await waitForCommand(page, 'webrtc.api', 20000);
await page.evaluate(() => { const fs = window.fs; for (const d of ['/home/user1/net6', '/home/user1/net6b']) if (!fs.existsSync(d)) fs.mkdirSync(d); });

// "Another app": code in the top page calling the registered command.
const api = (...args) => page.evaluate((a) => window.platform.host.getCommand('webrtc.api').exec(...a), args);
const dialogs = () => page.__dialogs.length;

// read-only subcommands: no prompt
let n = dialogs();
for (const cmd of [['status'], ['shares'], ['users'], ['groups'], ['chats'], ['messages', 'everyone'], ['mounts'], ['ice'], ['blocked'], ['help']]) {
  const r = await api(...cmd);
  if (!r.ok) check(`read-only "${cmd.join(' ')}" answers`, false, r.out);
}
check('NET-6: read-only subcommands answer without a prompt', dialogs() === n);

// mutating, declined
n = dialogs(); answer = 'dismiss';
const declined = await api('share', 'add', '/home/user1/net6', 'evil', 'rw');
check('NET-6: "share add" from outside asks first', dialogs() === n + 1);
const msg = page.__dialogs[page.__dialogs.length - 1]?.message || '';
check('NET-6: the prompt names the exact action asked for', msg.includes('webrtc share add /home/user1/net6 evil rw') && /WebRTC Chat/.test(msg), msg);
check('NET-6: declining refuses the call', declined.ok === false && /not allowed/.test(declined.out), declined.out);
check('NET-6: nothing was shared', (await f.evaluate(() => window.__webrtcApp.shares.size)) === 0);

const exfil = await api('sendfile', 'everyone', '/home/user1/.local/share/remote-machines/secrets.json');
check('NET-6: "sendfile" from outside asks first and is refused when declined', exfil.ok === false && /not allowed/.test(exfil.out) && /sendfile/.test(page.__dialogs.at(-1)?.message || ''), exfil.out);
const rename = await api('name', 'Mallory');
check('NET-6: "name" from outside is refused when declined', rename.ok === false && (await f.evaluate(() => window.__webrtcApp.settings.name)) !== 'Mallory', rename.out);

// mutating, accepted
answer = 'accept';
const accepted = await api('share', 'add', '/home/user1/net6', 'ok', 'ro');
check('NET-6: accepting runs the call', accepted.ok === true && (await f.evaluate(() => window.__webrtcApp.shares.size)) === 1, accepted.out);

// the terminal's /bin/webrtc.run goes through the same gate
answer = 'dismiss'; n = dialogs();
const out = await page.evaluate(async () => {
  const lines = []; const orig = console.log; console.log = (...a) => { lines.push(a.join(' ')); };
  try { await window.platform.host.execCommand(window.fs.readFileSync('/bin/webrtc.run', 'utf8'), window.platform, '/home/user1', 'share', 'add', 'net6b', 'term', 'rw'); }
  finally { console.log = orig; }
  return lines.join('\n');
});
check('NET-6: /bin/webrtc.run (terminal) is asked too, and declining refuses', dialogs() === n + 1 && /not allowed/.test(out) && (await f.evaluate(() => window.__webrtcApp.shares.size)) === 1, out);

// the app's own UI path is not prompted
n = dialogs();
await f.evaluate(() => window.__webrtcApp.addShare('/home/user1/net6b', 'own', 'ro'));
check('NET-6: the WebRTC window\'s own actions are not prompted', dialogs() === n && (await f.evaluate(() => window.__webrtcApp.shares.size)) === 2);

check('no page errors', !page.__errors.length, page.__errors.join(' | '));
await finish(browser);
