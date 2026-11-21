// NET-11 (TODO 1E.9): autoMesh is off for new settings (a saved choice is kept), and being
// added to a group by a peer needs the user's acceptance — until then no group traffic
// (messages, app-relay, Distributed Compute tasks) is delivered.
// Run: node testing/scripts/security/verify-net-mesh.mjs   (dev server on :8080)
import { launchBrowser, bootPage, connectPair, openWindow, appFrame, waitFor, check, finish, sleep } from './verify-net-lib.mjs';

const browser = await launchBrowser();
let declineNext = false;
const pA = await bootPage(browser);
const pB = await bootPage(browser, {
  onDialog: async (d) => {
    if (declineNext && /wants to add you to the group/.test(d.message())) { declineNext = false; await d.dismiss(); }
    else await d.accept();
  },
});
const { fA, fB, idB } = await connectPair(pA, pB);

check('NET-11: autoMesh is off for new settings', await fB.evaluate(() => window.__webrtcApp.settings.autoMesh === false));
await fB.evaluate(() => [...document.querySelectorAll('#side-foot button')].find((b) => /Settings/.test(b.textContent)).click());
const meshBox = await fB.evaluate(() => { const l = [...document.querySelectorAll('.modal label.row')].find((x) => /Connect me to everyone/.test(x.textContent)); return l ? l.querySelector('input').checked : null; });
check('NET-11: the Settings checkbox shows it off', meshBox === false, String(meshBox));
await fB.evaluate(() => document.querySelectorAll('.modal-head button').forEach((b) => b.click()));

await fB.evaluate(() => {
  window.__relay = 0; window.__dcTasks = 0;
  window.__webrtcApp.meshSubscribe('verify-net', () => { window.__relay++; });
  window.__webrtcApp.meshSubscribe('distributed-compute', () => { window.__dcTasks++; });
});
const groupTraffic = (g) => fA.evaluate(({ g, b }) => {
  const app = window.__webrtcApp;
  app.groups.get(g).members.add(b);   // an attacker ignores Bob's answer
  app.meshSend(g, 'verify-net', { x: 1 });
  app.meshSend(g, 'distributed-compute', { id: 'z' + g, seq: 0, total: 1, chunk: JSON.stringify({ type: 'dc-task', to: b, taskId: 't-' + g, taskSource: 'return 1', args: {} }) });
  app.sendText('g:' + g, 'hello ' + g);
}, { g, b: idB });

// ── accept ──
const g0 = await fA.evaluate((b) => window.__webrtcApp.createGroup('Friends', [b]).gid, idB);
check('NET-11: an invitation asks Bob first', await waitFor(() => pB.__dialogs.some((d) => /Alice wants to add you to the group "Friends"/.test(d.message)), 10000), JSON.stringify(pB.__dialogs));
check('NET-11: after accepting, Bob is a member', await waitFor(() => fB.evaluate((g) => window.__webrtcApp.groups.has(g), g0), 10000));
await groupTraffic(g0);
check('NET-11: an accepted group\'s traffic is delivered', await waitFor(() => fB.evaluate(() => window.__relay === 1 && window.__dcTasks === 1), 8000));
check('NET-11: an accepted group is visible to mesh apps', await fB.evaluate((g) => window.platform.host.getCommand('webrtc.mesh.groups').exec().some((x) => x.gid === g), g0));

// ── decline ──
declineNext = true;
const nBefore = pB.__dialogs.length;
const g1 = await fA.evaluate((b) => window.__webrtcApp.createGroup('Trap', [b]).gid, idB);
check('NET-11: the second invitation asks again', await waitFor(() => pB.__dialogs.length > nBefore, 10000));
await sleep(500);
check('NET-11: a declined invitation leaves no membership', !(await fB.evaluate((g) => window.__webrtcApp.groups.has(g) || window.__webrtcApp.groupInvites.has(g), g1)));
check('NET-11: the inviter is told (Bob left the group)', await waitFor(() => fA.evaluate(({ g, b }) => !window.__webrtcApp.groups.get(g).members.has(b), { g: g1, b: idB }), 8000));
await groupTraffic(g1);
await sleep(2000);
const counts = await fB.evaluate(() => ({ relay: window.__relay, dc: window.__dcTasks }));
check('NET-11: no app-relay / dc-task delivered for a declined group', counts.relay === 1 && counts.dc === 1, JSON.stringify(counts));
check('NET-11: no conversation for a declined group', !(await fB.evaluate((g) => window.__webrtcApp.convs.has('g:' + g), g1)));
check('NET-11: a declined group is invisible to mesh apps', !(await fB.evaluate((g) => window.platform.host.getCommand('webrtc.mesh.groups').exec().some((x) => x.gid === g), g1)));

// ── no dialog spam right after a decline ──
const nAfterDecline = pB.__dialogs.length;
const g2 = await fA.evaluate((b) => window.__webrtcApp.createGroup('Spam', [b]).gid, idB);
await sleep(2500);
check('NET-11: right after a decline, another invitation from that peer is ignored without a prompt', pB.__dialogs.length === nAfterDecline && !(await fB.evaluate((g) => window.__webrtcApp.groups.has(g), g2)));

// ── a saved autoMesh choice is kept ──
const pC = await bootPage(browser);
await pC.evaluate(() => {
  const fs = window.fs; let cur = '';
  for (const p of '/home/user1/.local/share/webrtc'.split('/').filter(Boolean)) { cur += '/' + p; if (!fs.existsSync(cur)) fs.mkdirSync(cur); }
  fs.writeFileSync('/home/user1/.local/share/webrtc/settings.json', JSON.stringify({ name: 'Carol', autoMesh: true }));
});
await openWindow(pC, 'ui.webrtc');
const fC = await appFrame(pC, 'webrtc/main.html');
check('NET-11: an existing saved autoMesh: true is kept', await waitFor(() => fC.evaluate(() => window.__webrtcApp && window.__webrtcApp.settings.autoMesh === true), 15000));

check('no page errors', !pA.__errors.length && !pB.__errors.length && !pC.__errors.length, [...pA.__errors, ...pB.__errors, ...pC.__errors].join(' | '));
await finish(browser);
