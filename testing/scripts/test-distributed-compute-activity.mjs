// Real end-to-end test for distributed-compute's "Worker Activity" feature:
// when this window is acting as a WORKER for another peer's job (not its own),
// the in-flight task must be visible (app UI panel + `activities` CLI command)
// and killable (app UI Kill button + `activities kill <id>` CLI), backed by the
// generic Host.registerActivity registry (src/shared/index.ts) and a real Web
// Worker execution path (lib/worker-task-runtime.js) so the kill genuinely
// interrupts execution rather than only hiding it in the UI.
//
// Also sanity-checks the two-column layout fix in main.html (the old 4-item/
// 3-column grid mismatch that stranded #result-pane below the editor).
import { chromium } from 'playwright';
const PORT = process.env.PORT || 8103, URL = `http://localhost:${PORT}`, SHOT = 'testing/screenshots';
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); if (!ok) failed++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 20000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch (_) {} await sleep(300); } return false; }
async function boot(page) {
  await page.goto(URL); await page.waitForTimeout(3000); await page.reload(); await page.waitForTimeout(3000); await page.reload(); await page.waitForTimeout(9000);
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) { if (await page.evaluate(() => !!window.platform?.host?.getCommand('ui.webrtc') && !!window.platform?.host?.getCommand('ui.distributed-compute') && !!window.platform?.host?.getCommand('ui.terminal')).catch(() => false)) return; await sleep(1000); }
}
async function appFrame(page, urlPart, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { for (const fr of page.frames()) { try { if (fr.url().includes(urlPart) && await fr.evaluate(() => true).catch(() => false)) return fr; } catch (_) {} } await sleep(400); }
  throw new Error('frame not found: ' + urlPart);
}
async function openWindow(page, cmd) {
  for (let i = 0; i < 20; i++) {
    const ok = await page.evaluate((c) => { try { window.platform.host.execCommand(`service('001-core.layout','open-window')(command('${c}'))`, window.platform); return true; } catch (_) { return false; } }, cmd);
    if (ok) return;
    await sleep(500);
  }
}
const typeInTerminal = async (page, text) => { for (const ch of text) await page.keyboard.type(ch, { delay: 8 }); };
const dumpTerminalBuffer = (frame) => frame.evaluate(() => {
  const session = window.__terminalApp.sessions.find(s => s.tabEl.classList.contains('active'));
  const buf = session.terminal.buffer.active;
  const lines = [];
  for (let i = 0; i < buf.length; i++) lines.push(buf.getLine(i).translateToString(true));
  return lines.filter(l => l.trim() !== '');
});

const browser = await chromium.launch();
const pA = await (await browser.newContext()).newPage(), pB = await (await browser.newContext()).newPage();
const errs = []; pA.on('pageerror', e => errs.push('A ' + e.message)); pB.on('pageerror', e => errs.push('B ' + e.message));
await boot(pA);
await openWindow(pA, 'ui.webrtc');
const fA = await appFrame(pA, 'webrtc/main.html');
await fA.locator('#me-name').waitFor({ timeout: 20000 }).catch(() => {});
const inv = await fA.evaluate(async () => (await window.__webrtcApp.createInvite('Alice')).link);
await pB.goto(inv);
await pB.waitForTimeout(3000);
const fB = await appFrame(pB, 'webrtc/main.html', 40000);
await waitFor(() => fB.evaluate(() => window.__webrtcApp && window.__webrtcApp.joins.size === 1));
const ans = await fB.evaluate(async () => { const j = [...window.__webrtcApp.joins.values()][0]; await window.__webrtcApp.generateAnswer(j, 'Bob'); return j.link; });
await fA.evaluate((l) => window.__webrtcApp.handleIncomingCode(l), ans);
await waitFor(() => fA.evaluate(() => window.__webrtcApp.peers.size === 1), 30000);
await fA.evaluate(() => document.querySelectorAll('.modal-head button').forEach(b => b.click()));
await fB.evaluate(() => document.querySelectorAll('.modal-head button').forEach(b => b.click()));

const bobId = await fA.evaluate(() => [...window.__webrtcApp.peers.values()][0].id);
const gid = await fA.evaluate((b) => window.__webrtcApp.createGroup('Compute', [b]).gid, bobId);
await waitFor(() => fB.evaluate(() => window.__webrtcApp.groups.size === 1));

await openWindow(pA, 'ui.distributed-compute');
await openWindow(pB, 'ui.distributed-compute');
const dcA = await appFrame(pA, 'distributed-compute/main.html');
const dcB = await appFrame(pB, 'distributed-compute/main.html');
await waitFor(() => dcA.evaluate(() => window.__distComputeReady === true));
await waitFor(() => dcB.evaluate(() => window.__distComputeReady === true));

// --- Layout fix sanity checks -------------------------------------------------
const layout = await dcB.evaluate(() => {
  const sideNav = document.getElementById('side-nav');
  const contentCol = document.getElementById('content-col');
  const editorPane = document.getElementById('editor-pane');
  const statusBar = document.getElementById('status-bar');
  const resultPane = document.getElementById('result-pane'); // should no longer exist as a grid item
  const appRect = document.getElementById('app').getBoundingClientRect();
  const editorRect = editorPane.getBoundingClientRect();
  return {
    hasSideNav: !!sideNav, hasContentCol: !!contentCol, hasStatusBar: !!statusBar,
    resultPaneGone: !resultPane,
    editorFillsHeight: editorRect.height > appRect.height * 0.5, // editor should dominate content-col, not be squeezed
    statusBarAtBottom: statusBar ? Math.abs(statusBar.getBoundingClientRect().bottom - contentCol.getBoundingClientRect().bottom) < 2 : false,
  };
});
check('two-column layout: side-nav present', layout.hasSideNav);
check('two-column layout: content-col present', layout.hasContentCol);
check('two-column layout: status bar present', layout.hasStatusBar);
check('old #result-pane grid item is gone (folded into side-nav)', layout.resultPaneGone);
check('editor fills most of the content column height (not squeezed to min-content)', layout.editorFillsHeight);
check('status bar sits at the bottom of the content column', layout.statusBarAtBottom);
await pB.screenshot({ path: `${SHOT}/distributed-compute-two-column-layout.png` });

// --- Worker activity: visible while running, killable via CLI ----------------
// Force dispatch entirely onto Bob (not self) with maxRetries:0 so a kill falls
// straight through to scheduler.js's built-in "always try self as a last
// resort" path deterministically, rather than re-dispatching to Bob again.
await dcA.evaluate(({ bobId, gid }) => {
  window.__testRunResult = undefined;
  window.__distComputeScheduler.run({
    gid, chunkCount: 1,
    taskSource: 'const start = Date.now(); while (Date.now() - start < 6000) {} return 42;',
    buildArgs: () => ({}),
    combineSource: 'return { value: args.results[0] };',
    workers: [{ id: bobId, isSelf: false, name: 'Bob' }],
    timeoutMs: 20000, maxRetries: 0,
  }).then(r => { window.__testRunResult = r; }).catch(e => { window.__testRunResult = { error: String(e && e.message || e) }; });
}, { bobId, gid });

await waitFor(() => dcB.evaluate(() => (window.__distComputeActivities() || []).length > 0), 8000);
let activities = await dcB.evaluate(() => window.__distComputeActivities());
check('Bob sees his own worker-task activity while it is running', activities.length === 1 && activities[0].state === 'running', JSON.stringify(activities));
check('activity is marked killable (Worker-based execution, not the default synchronous runTask)', !!(activities[0] && activities[0].meta && activities[0].meta.killable));
check('activity label identifies the requesting peer (Alice)', !!(activities[0] && activities[0].label.includes('Alice')));

// UI panel reflects it too.
// The panel re-renders on a 500ms poll (see ui/app.js's refreshActivity), so
// give it a tick to catch up with the activity list we just observed.
await waitFor(() => dcB.evaluate(() => {
  const t = document.getElementById('activity-list').textContent;
  return !t.includes('No active worker tasks') && /running/.test(t);
}), 3000);
const panelText = await dcB.evaluate(() => document.getElementById('activity-list').textContent);
check('Worker Activity panel shows a non-empty row while running', !panelText.includes('No active worker tasks') && /running/.test(panelText), panelText);

// CLI: `activities` lists it as a child of distributed-compute.
await openWindow(pB, 'ui.terminal');
const termB = await appFrame(pB, 'terminal/main.html');
// The initial 'info' banner renders asynchronously before the prompt appears
// (see CLAUDE.md's Terminal section) — wait for it to finish rather than a
// fixed delay, or typed input races the banner and gets garbled into it.
await waitFor(() => dumpTerminalBuffer(termB).then(lines => lines.some(l => l.includes('$'))), 8000);
await termB.locator('.terminal-pane').first().click({ force: true });
await pB.waitForTimeout(300);
await typeInTerminal(pB, 'activities');
await pB.keyboard.press('Enter');
await pB.waitForTimeout(500);
let cliLines = (await dumpTerminalBuffer(termB)).join('\n');
check('`activities` CLI lists the task under APP=distributed-compute', /distributed-compute/.test(cliLines), cliLines);
check('`activities` CLI shows STATE=running and KILLABLE=yes', /running/.test(cliLines) && /\byes\b/.test(cliLines), cliLines);

// Kill it via the CLI.
const activityId = activities[0].id;
await typeInTerminal(pB, `activities kill ${activityId}`);
await pB.keyboard.press('Enter');
await pB.waitForTimeout(500);
cliLines = (await dumpTerminalBuffer(termB)).join('\n');
check('`activities kill <id>` reports success', cliLines.includes(`Killed ${activityId}`));

await waitFor(() => dcB.evaluate(() => (window.__distComputeActivities() || []).every(a => a.state !== 'running')), 3000);
const afterKill = await dcB.evaluate(() => window.__distComputeActivities());
check('activity state moved to killed (not still running) shortly after CLI kill', afterKill.length === 0 || afterKill.every(a => a.state === 'killed'));

// Despite the kill, Alice's scheduler.run must still resolve — scheduler.js's
// existing "always try self as a last resort" fallback picks up the chunk.
check('scheduler.run still resolves successfully after its worker was killed (fell back to self)',
  await waitFor(() => dcA.evaluate(() => window.__testRunResult !== undefined), 20000));
const runResult = await dcA.evaluate(() => window.__testRunResult);
check('fallback result is numerically correct', runResult && runResult.combined && runResult.combined.value === 42, JSON.stringify(runResult));

// --- Worker activity: killable via the app's own UI button --------------------
await dcA.evaluate(({ bobId, gid }) => {
  window.__testRunResult2 = undefined;
  window.__distComputeScheduler.run({
    gid, chunkCount: 1,
    taskSource: 'const start = Date.now(); while (Date.now() - start < 6000) {} return 7;',
    buildArgs: () => ({}),
    combineSource: 'return { value: args.results[0] };',
    workers: [{ id: bobId, isSelf: false, name: 'Bob' }],
    timeoutMs: 20000, maxRetries: 0,
  }).then(r => { window.__testRunResult2 = r; }).catch(e => { window.__testRunResult2 = { error: String(e && e.message || e) }; });
}, { bobId, gid });

await waitFor(() => dcB.evaluate(() => (window.__distComputeActivities() || []).some(a => a.state === 'running')), 8000);
await waitFor(() => dcB.evaluate(() => !!document.querySelector('.activity-kill-btn')), 3000);
const killClicked = await dcB.evaluate(() => {
  const btn = document.querySelector('.activity-kill-btn');
  if (!btn) return false;
  btn.click();
  return true;
});
check('app UI has a clickable Kill button for the running activity', killClicked);
check('activity is no longer running shortly after clicking Kill in the app UI',
  await waitFor(() => dcB.evaluate(() => (window.__distComputeActivities() || []).every(a => a.state !== 'running')), 3000));
check('scheduler.run still resolves after a UI-triggered kill (fell back to self)',
  await waitFor(() => dcA.evaluate(() => window.__testRunResult2 !== undefined), 20000));
const runResult2 = await dcA.evaluate(() => window.__testRunResult2);
check('UI-kill fallback result is numerically correct', runResult2 && runResult2.combined && runResult2.combined.value === 7, JSON.stringify(runResult2));

// --- A normal (non-killed) worker task still completes and reports state correctly ---
await dcA.evaluate(({ bobId, gid }) => {
  window.__testRunResult3 = undefined;
  window.__distComputeScheduler.run({
    gid, chunkCount: 1,
    taskSource: 'return args.chunk ? args.chunk.length : 3;',
    buildArgs: () => ({ chunk: [1, 2, 3] }),
    combineSource: 'return { value: args.results[0] };',
    workers: [{ id: bobId, isSelf: false, name: 'Bob' }],
    timeoutMs: 8000, maxRetries: 0,
  }).then(r => { window.__testRunResult3 = r; }).catch(e => { window.__testRunResult3 = { error: String(e && e.message || e) }; });
}, { bobId, gid });
check('a normal (fast, non-killed) worker task still completes successfully',
  await waitFor(() => dcA.evaluate(() => window.__testRunResult3 !== undefined), 10000));
const runResult3 = await dcA.evaluate(() => window.__testRunResult3);
check('fast task result is correct', runResult3 && runResult3.combined && runResult3.combined.value === 3, JSON.stringify(runResult3));
await waitFor(() => dcB.evaluate(() => (window.__distComputeActivities() || []).length === 0 || window.__distComputeActivities().every(a => a.state === 'done')), 6000);

check('no page errors', errs.length === 0, errs.slice(0, 5).join(' || '));
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
await browser.close(); process.exit(failed ? 1 : 0);
