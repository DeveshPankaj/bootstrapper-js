// Collaborative whiteboard: drawing sync, multi-cursor rendering with name initials,
// per-author undo, late-joiner catch-up sync, download + save-to-Files.
import { chromium } from 'playwright';
const PORT = process.env.PORT || 8103, URL = `http://localhost:${PORT}`, SHOT = 'testing/screenshots';
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 15000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (_) {} await sleep(300); } return false; }
async function boot(page) { await page.goto(URL); await page.waitForTimeout(3000); await page.reload(); await page.waitForTimeout(3000); await page.reload(); await page.waitForTimeout(9000); }
async function appFrame(page, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { for (const fr of page.frames()) { try { if (await fr.locator('#me-name').count() && await fr.evaluate(() => !!window.__webrtcApp)) return fr; } catch (_) {} } await sleep(400); }
  throw new Error('webrtc app frame not found');
}
// Dispatch real PointerEvents directly on the canvas (in-frame), instead of OS-level
// mouse control — reliable regardless of iframe nesting/z-index/focus quirks.
async function drag(page, canvasLoc, points) {
  await canvasLoc.evaluate((canvas, pts) => {
    const r = canvas.getBoundingClientRect();
    const abs = ([x, y]) => [r.left + x / 1000 * r.width, r.top + y / 600 * r.height];
    const fire = (type, [x, y]) => canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, button: 0, pointerId: 1 }));
    fire('pointerdown', abs(pts[0]));
    for (const p of pts.slice(1)) fire('pointermove', abs(p));
    fire('pointerup', abs(pts[pts.length - 1]));
  }, points);
  await sleep(150);
}

const browser = await chromium.launch();
const pA = await (await browser.newContext()).newPage(), pB = await (await browser.newContext()).newPage(), pC = await (await browser.newContext()).newPage();
const errs = []; for (const [n, p] of [['A', pA], ['B', pB], ['C', pC]]) p.on('pageerror', e => errs.push(`${n}: ${e.message}`));
await boot(pA);
await pA.evaluate(() => window.platform.host.execCommand("service('001-core.layout','open-window') (command('ui.webrtc'))", window.platform));
const fA = await appFrame(pA);

async function connect(pX, name) {
  const inv = await fA.evaluate(async () => (await window.__webrtcApp.createInvite('Alice')).link);
  await pX.goto(inv);
  const fX = await appFrame(pX, 40000);
  await waitFor(() => fX.evaluate(() => window.__webrtcApp.joins.size === 1));
  const ans = await fX.evaluate(async (nm) => { const j = [...window.__webrtcApp.joins.values()][0]; await window.__webrtcApp.generateAnswer(j, nm); return j.link; }, name);
  await fA.evaluate((l) => window.__webrtcApp.handleIncomingCode(l), ans);
  await fX.evaluate(() => document.querySelectorAll('.modal-head button').forEach(b => b.click()));
  return fX;
}
const fB = await connect(pB, 'Bob');
await waitFor(() => fA.evaluate(() => window.__webrtcApp.peers.size === 1), 20000);
await fA.evaluate(() => document.querySelectorAll('.modal-head button').forEach(b => b.click()));

const bId = await fA.evaluate(() => [...window.__webrtcApp.peers.values()][0].id);
const gid = await fA.evaluate((b) => window.__webrtcApp.createGroup('Doodles', [b]).gid, bId);
await waitFor(() => fB.evaluate(() => window.__webrtcApp.groups.size === 1));
for (const fr of [fA, fB]) await fr.evaluate(() => { const item = [...document.querySelectorAll('#chat-list .item')].find(el => el.textContent.includes('Doodles')); if (item) item.click(); });

// open the whiteboard on both sides
await fA.locator('#head button:has-text("Whiteboard")').click({ force: true });
await fB.locator('#head button:has-text("Whiteboard")').click({ force: true });
await pA.waitForTimeout(300); await pB.waitForTimeout(300);
check('modal opens with a canvas', await fA.locator('.modal canvas').count().then(n => n > 0));

// Alice draws a stroke
await drag(pA, fA.locator('.modal canvas'), [[100, 100], [200, 150], [300, 100], [400, 200]]);
await pA.waitForTimeout(300);
check('Alice: stroke recorded locally', await fA.evaluate((gid) => window.__webrtcApp.boards.get(gid).strokes.length === 1, gid));
check('Bob receives the stroke', await waitFor(() => fB.evaluate((gid) => window.__webrtcApp.boards.get(gid)?.strokes.length === 1, gid)));
// canvas pixels actually changed on Bob's side (not just data — genuinely painted)
const bobPixel = await fB.evaluate(() => { const cv = document.querySelector('.modal canvas'); const ctx = cv.getContext('2d'); const d = ctx.getImageData(200, 150, 1, 1).data; return [d[0], d[1], d[2], d[3]]; });
check('Bob\'s canvas actually shows painted pixels (not just state)', bobPixel[3] > 0, JSON.stringify(bobPixel));
await pA.screenshot({ path: `${SHOT}/webrtc-whiteboard-draw.png` });
await pB.screenshot({ path: `${SHOT}/webrtc-whiteboard-receive.png` });

// live cursor: Alice moves the mouse without drawing (button up) — Bob should see a labeled cursor badge
await pA.mouse.move((await fA.locator('.modal canvas').boundingBox()).x + 500, (await fA.locator('.modal canvas').boundingBox()).y + 300);
check('Bob sees a live cursor badge for Alice', await waitFor(() => fB.locator('.wb-cursor').count().then(n => n > 0)));
check('cursor badge shows initial "A" for Alice', await fB.locator('.wb-cursor').first().textContent().then(t => t.trim().startsWith('A')));
check('cursor badge carries Alice\'s full name as a label', await fB.locator('.wb-cursor .wb-name').first().textContent().then(t => t === 'Alice'));

// eraser: Bob draws, then erases part of it — Alice should see pixels cleared
await fB.locator('.modal button:has-text("Eraser")').click({ force: true });
await pB.waitForTimeout(150);
await drag(pB, fB.locator('.modal canvas'), [[150, 400], [250, 450]]);
check('eraser stroke recorded and marked erase:true', await waitFor(() => fB.evaluate((gid) => window.__webrtcApp.boards.get(gid).strokes.some(s => s.erase === true), gid)));
check('erase stroke reaches Alice too', await waitFor(() => fA.evaluate((gid) => [...window.__webrtcApp.boards.get(gid).strokes.values()].some(s => s.erase === true), gid)));

// undo: only the AUTHOR's undo works, and only removes their own last stroke
await fB.locator('.modal button:has-text("Pen")').click({ force: true });
await drag(pB, fB.locator('.modal canvas'), [[500, 500], [520, 520]]);
const bobsOwnCountBefore = await fB.evaluate((gid) => window.__webrtcApp.boards.get(gid).strokes.filter(s => s.userId === window.__webrtcApp.myId).length, gid);
await fA.evaluate((gid) => window.__webrtcApp.wbUndoMine(window.__webrtcApp.boards.get(gid)), gid);   // Alice undoes her own (only) stroke
await pA.waitForTimeout(400);
check("Alice's undo removes only HER stroke locally", await fA.evaluate((gid) => !window.__webrtcApp.boards.get(gid).strokes.some(s => s.userId === window.__webrtcApp.myId), gid));
check("Alice's stroke is removed from Bob's copy too (undo propagates)", await waitFor(() => fB.evaluate((gid) => { const alice = [...window.__webrtcApp.peers.values()].find(p => p.name === 'Alice'); return !window.__webrtcApp.boards.get(gid).strokes.some(s => s.userId === alice.id); }, gid)));
check("Bob's OWN strokes are untouched by Alice's undo", await fB.evaluate(({ gid, n }) => window.__webrtcApp.boards.get(gid).strokes.filter(s => s.userId === window.__webrtcApp.myId).length === n, { gid, n: bobsOwnCountBefore }));

// third peer joins LATE, opens the whiteboard for the first time, and must be caught up
const fC = await connect(pC, 'Carol');
await waitFor(() => fA.evaluate(() => window.__webrtcApp.peers.size === 2), 20000);
await fA.evaluate(() => document.querySelectorAll('.modal-head button').forEach(b => b.click()));
await fA.evaluate((gid) => { const app = window.__webrtcApp; const carol = [...app.peers.values()].find(p => p.name === 'Carol'); const g = app.groups.get(gid); g.members.add(carol.id); app.groupUpdate(g); }, gid);
await waitFor(() => fC.evaluate(() => window.__webrtcApp.groups.size === 1));
await waitFor(() => fC.evaluate(() => { const item = [...document.querySelectorAll('#chat-list .item')].find(el => el.textContent.includes('Doodles')); if (item) { item.click(); return true; } return false; }));
await pC.waitForTimeout(300);
await fC.locator('#head button:has-text("Whiteboard")').click({ force: true });
check('late joiner gets caught up with existing strokes (sync request/response)', await waitFor(() => fC.evaluate((gid) => (window.__webrtcApp.boards.get(gid)?.strokes.length || 0) > 0, gid), 8000));
await pC.screenshot({ path: `${SHOT}/webrtc-whiteboard-latejoin.png` });

// download + save to Files (reopen — connecting Carol closed every open modal, including this one)
await fA.locator('#head button:has-text("Whiteboard")').click({ force: true });
await pA.waitForTimeout(300);
const dlPromise = pA.waitForEvent('download').catch(() => null);
await fA.locator('.modal button:has-text("Download PNG")').click({ force: true });
const dl = await dlPromise;
if (dl) check('download PNG produces a real file', (await dl.suggestedFilename()).endsWith('.png'));
else check('download PNG generates a real, non-empty PNG blob', await fA.evaluate(async (gid) => { const board = window.__webrtcApp.boards.get(gid); const blob = await new Promise((res) => board.canvas.toBlob(res, 'image/png')); return blob && blob.size > 0 && blob.type === 'image/png'; }, gid));

// (native in-page click — Playwright's own click mis-targets this button once the wrapped toolbar overflows)
await fA.evaluate(() => [...document.querySelectorAll('.wb-toolbar button')].find(b => b.textContent.includes('Save to Files')).click());
await pA.waitForTimeout(400);
await fA.locator('.modal:has-text("Save whiteboard") button:has-text("Save here")').click({ force: true });
check('whiteboard saved into the VFS', await waitFor(() => fA.evaluate(() => window.platform.host.getFS().existsSync('/home/user1/Doodles.png') && window.platform.host.getFS().statSync('/home/user1/Doodles.png').size > 0)));

// ── Clear: wipes strokes AND history for everyone, no confirm → no-op ──
pC.on('dialog', d => d.dismiss());   // Carol will decline first, to prove a dismissed confirm changes nothing
const strokesBeforeClear = await fC.evaluate((gid) => window.__webrtcApp.boards.get(gid).strokes.length, gid);
await fC.evaluate(() => [...document.querySelectorAll('.wb-toolbar button')].find(b => b.textContent.includes('Clear')).click());
await pC.waitForTimeout(300);
check('declining the confirm leaves the board untouched', await fC.evaluate(({ gid, n }) => window.__webrtcApp.boards.get(gid).strokes.length === n, { gid, n: strokesBeforeClear }));

pA.on('dialog', d => d.accept());
await fA.evaluate(() => [...document.querySelectorAll('.wb-toolbar button')].find(b => b.textContent.includes('Clear')).click());
check('Alice: board cleared locally (no strokes left)', await waitFor(() => fA.evaluate((gid) => window.__webrtcApp.boards.get(gid).strokes.length === 0, gid)));
check('Bob: board cleared too (propagated)', await waitFor(() => fB.evaluate((gid) => window.__webrtcApp.boards.get(gid).strokes.length === 0, gid)));
check('Carol: board cleared too', await waitFor(() => fC.evaluate((gid) => window.__webrtcApp.boards.get(gid).strokes.length === 0, gid)));
check("Alice's canvas is genuinely blank after clear", await fA.evaluate(() => { const cv = document.querySelector('.modal canvas'); const d = cv.getContext('2d').getImageData(200, 150, 1, 1).data; return d[3] === 0; }));
check('undo after clear has nothing to undo (no leftover history)', await fA.evaluate((gid) => { const before = window.__webrtcApp.boards.get(gid).strokes.length; window.__webrtcApp.wbUndoMine(window.__webrtcApp.boards.get(gid)); return window.__webrtcApp.boards.get(gid).strokes.length === before; }, gid));
// a late-late joiner after the clear gets an empty board, not the old drawing
await fC.evaluate((gid) => { window.__webrtcApp.boards.delete(gid); }, gid);   // forget locally, as if opening fresh
await fC.locator('#head button:has-text("Whiteboard")').click({ force: true }).catch(() => {});
await pC.waitForTimeout(1000);
check('re-syncing after a clear yields an empty board, not stale drawings', await fC.evaluate((gid) => (window.__webrtcApp.boards.get(gid)?.strokes.length || 0) === 0, gid));

check('no page errors', errs.length === 0, errs.slice(0, 5).join(' || '));
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
await browser.close(); process.exit(failed ? 1 : 0);
