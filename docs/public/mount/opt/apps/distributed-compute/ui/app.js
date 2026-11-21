// ui/app.js — wires together the mesh client, scheduler, code editor and
// progress/log UI. This is the only file that knows about DOM ids in
// main.html; everything else (mesh-client, scheduler, task-runtime, tiny-nn,
// the examples) is plain, DOM-free logic that testing/scripts/*.mjs also
// exercises directly/mocked, independent of this UI layer.
import { MeshClient } from '../lib/mesh-client.js';
import { Scheduler } from '../lib/scheduler.js';
import { runTask } from '../lib/task-runtime.js';
import { createSandboxRunner } from '../lib/worker-task-runtime.js';
import * as TinyNN from '../lib/tiny-nn.js';
import { MAP_REDUCE_EXAMPLE } from '../examples/map-reduce-demo.js';
import { NEURAL_NET_EXAMPLE, NN_COMBINE_SOURCE } from '../examples/neural-net-training.js';
import { createEditor } from './editor.js';
import { drawLossChart } from './chart.js';

const EXAMPLES = [MAP_REDUCE_EXAMPLE, NEURAL_NET_EXAMPLE];

const el = (id) => document.getElementById(id);
const exampleSelect = el('example-select');
const groupSelect = el('group-select');
const runBtn = el('run-btn');
const toggleNavBtn = el('toggle-nav-btn');
const sideNav = el('side-nav');
const meshBanner = el('mesh-banner');
const statusRunState = el('status-run-state');
const rosterList = el('roster-list');
const activityList = el('activity-list');
const progressList = el('progress-list');
const resultValue = el('result-value');
const lossCanvas = el('loss-canvas');
const logEl = el('log');
const acceptList = el('accept-list');

const platformHost = window.platform ? window.platform.host : null;
const mesh = new MeshClient(platformHost);

// Other peers' tasks run in worker-task-runtime.js's sandbox: a hidden opaque-origin
// frame with no network or storage, one killable Worker per task. It inlines
// tiny-nn.js's source text into that Worker (the sandbox can't reach the vfs).
const fs = (() => { try { return platformHost && platformHost.getFS ? platformHost.getFS() : null; } catch (_) { return null; } })();
let nnSource = '';
try {
  if (fs) nnSource = fs.readFileSync('/opt/apps/distributed-compute/lib/tiny-nn.js', 'utf8');
} catch (_) { /* falls back to no nn helpers available inside the worker */ }
const sandbox = createSandboxRunner({ nnSource });

// ---- "Run tasks for others": per-group opt-in (audit NET-1) -------------------
// Off by default. A task is code written by another peer; it only runs here for a
// group the user ticked, and then only inside the sandbox. Persisted in this app's
// own data dir, bound to the group's id + creator + name (a new group that reuses
// an old id isn't trusted automatically).
const DATA_DIR = '/home/user1/.local/share/distributed-compute';
const SETTINGS_FILE = DATA_DIR + '/settings.json';
const MAX_ACCEPT_ENTRIES = 50;
let acceptEntries = [];   // [{ gid, creator, name, at }]
function loadAcceptSettings() {
  try {
    const raw = fs ? (fs.existsSync(SETTINGS_FILE) ? fs.readFileSync(SETTINGS_FILE, 'utf8') : null) : localStorage.getItem('distributed-compute.settings');
    const parsed = raw ? JSON.parse(raw) : null;
    const list = parsed && Array.isArray(parsed.acceptTasks) ? parsed.acceptTasks : [];
    acceptEntries = list.filter((e) => e && typeof e.gid === 'string' && /^[0-9a-f]{12}$/.test(e.gid))
      .map((e) => ({ gid: e.gid, creator: typeof e.creator === 'string' ? e.creator : '', name: typeof e.name === 'string' ? e.name : '', at: Number(e.at) || 0 }))
      .slice(0, MAX_ACCEPT_ENTRIES);
  } catch (_) { acceptEntries = []; }
}
function saveAcceptSettings() {
  const text = JSON.stringify({ acceptTasks: acceptEntries }, null, 2);
  try {
    if (fs) {
      let cur = '';
      for (const part of DATA_DIR.split('/').filter(Boolean)) { cur += '/' + part; try { fs.mkdirSync(cur); } catch (e) { if (e && e.code !== 'EEXIST') throw e; } }
      fs.writeFileSync(SETTINGS_FILE, text);
    } else localStorage.setItem('distributed-compute.settings', text);
  } catch (e) { log('could not save the task settings: ' + (e && e.message ? e.message : String(e)), true); }
}
const groupById = (gid) => (mesh.isAvailable() ? mesh.groups() : []).find((g) => g.gid === gid) || null;
function acceptsTasksFrom(gid) {
  const g = groupById(gid);
  if (!g) return false;
  return acceptEntries.some((e) => e.gid === g.gid && e.creator === (g.creator || '') && e.name === (g.name || ''));
}
function setAcceptTasks(gid, on) {
  const g = groupById(gid);
  acceptEntries = acceptEntries.filter((e) => e.gid !== gid);
  if (on && g) acceptEntries.unshift({ gid: g.gid, creator: g.creator || '', name: g.name || '', at: Date.now() });
  acceptEntries = acceptEntries.slice(0, MAX_ACCEPT_ENTRIES);
  saveAcceptSettings();
  renderAcceptList(true);
  return acceptsTasksFrom(gid);
}
const refusedNoted = new Map();   // "gid|peer" -> last time a refusal was logged
function noteRefused(gid, fromPeerId, fromName, reason) {
  const key = gid + '|' + fromPeerId, now = Date.now();
  if (now - (refusedNoted.get(key) || 0) < 60000) return;
  refusedNoted.set(key, now);
  const g = groupById(gid);
  log(`refused a task from ${fromName || fromPeerId} in "${g ? g.name : gid}" (${reason}) — tick the group under "Run tasks for others" to help with its jobs`);
}
loadAcceptSettings();

const scheduler = new Scheduler(mesh, {
  myId: (mesh.myIdentity() || {}).id || 'self',
  host: platformHost,
  runInWorker: (source, args, opts) => sandbox.run(source, args, opts),
  acceptTask: (gid) => acceptsTasksFrom(gid),
  onRefused: noteRefused,
});
scheduler.startResponder(); // receives results for our own jobs; other peers' tasks only for opted-in groups

let editor = null;
let running = false;
let chunkRows = new Map(); // chunkIndex -> row element
let latestActivities = []; // last value from platformHost.activities$, for updateStatusRunState()

function log(line, isErr) {
  const div = document.createElement('div');
  if (isErr) div.className = 'err';
  div.textContent = `[${new Date().toLocaleTimeString()}] ${line}`;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}

function workerLabel(workers, id) {
  const w = workers.find((x) => x.id === id);
  return w ? (w.isSelf ? `${w.name || 'You'} (you)` : (w.name || id)) : id;
}

// Peer display names are chosen by the peers themselves — text only, never markup (audit NET-5).
function renderRoster(workers) {
  rosterList.replaceChildren();
  for (const w of workers) {
    const row = document.createElement('div');
    row.className = 'worker-row';
    const dot = document.createElement('span');
    dot.className = 'worker-dot' + (w.isSelf ? ' self' : '');
    const name = document.createElement('span');
    name.className = 'worker-name';
    name.textContent = w.isSelf ? (w.name || 'You') + ' (you)' : String(w.name || w.id);
    name.title = name.textContent;
    row.append(dot, name);
    rosterList.appendChild(row);
  }
}

// Renders THIS scheduler instance's own in-flight/recently-finished
// worker-task activity (answering OTHER peers' jobs in the background) — see
// Scheduler.getLocalActivities()/_handleIncomingTask. Deliberately reads the
// scheduler's own local list rather than the global Host.activities$ registry:
// Host's `servicePlatformName` identifies the shared module that renders this
// iframe (e.g. the generic `ui.iframe` command), not this specific window
// instance, so it can't distinguish one open distributed-compute window's own
// activity from another's. (The `activities` CLI command/Task Manager use the
// global registry instead, where cross-window visibility is the point.)
function renderActivity(mine) {
  activityList.innerHTML = '';
  if (!mine || mine.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'activity-empty';
    empty.textContent = 'No active worker tasks';
    activityList.appendChild(empty);
    return;
  }
  for (const a of mine) {
    const row = document.createElement('div');
    row.className = 'activity-row';

    const label = document.createElement('span');
    label.className = 'activity-label';
    label.title = a.label;
    label.textContent = a.label;
    row.appendChild(label);

    const state = document.createElement('span');
    state.className = `activity-state state-${a.state}`;
    state.textContent = a.state;
    row.appendChild(state);

    if (a.state === 'running' && a.meta && a.meta.killable) {
      const killBtn = document.createElement('button');
      killBtn.className = 'activity-kill-btn';
      killBtn.textContent = 'Kill';
      killBtn.title = 'Terminate this worker task immediately';
      killBtn.addEventListener('click', () => {
        platformHost.getCommand('activity.kill')?.exec(a.id);
      });
      row.appendChild(killBtn);
    }

    activityList.appendChild(row);
  }
}

function updateStatusRunState() {
  const activeCount = latestActivities.filter((a) => a.state !== 'done' && a.state !== 'failed' && a.state !== 'killed').length;
  const parts = [running ? 'Running' : 'Idle'];
  if (activeCount > 0) parts.push(`${activeCount} worker task${activeCount === 1 ? '' : 's'} active`);
  statusRunState.textContent = parts.join(' · ');
  statusRunState.classList.toggle('busy', running || activeCount > 0);
}

function renderMeshBanner(available, groups) {
  if (!available) {
    meshBanner.textContent = 'Mesh bridge unavailable -- running local-only. Open WebRTC Chat, connect to a group, and come back to distribute across peers.';
    meshBanner.className = 'warn';
  } else if (groups.length === 0) {
    meshBanner.textContent = 'No WebRTC groups joined -- running local-only. Open WebRTC Chat, connect to a group, and come back.';
    meshBanner.className = 'warn';
  } else {
    meshBanner.textContent = `Mesh ready -- ${groups.length} group(s) available.`;
    meshBanner.className = 'ok';
  }
}

function currentWorkers() {
  const myId = (mesh.myIdentity() || {}).id || 'self';
  const gid = groupSelect.value || null;
  if (!mesh.isAvailable() || !gid) return [{ id: myId, name: 'You', isSelf: true }];
  const groups = mesh.groups();
  const group = groups.find((g) => g.gid === gid);
  if (!group) return [{ id: myId, name: 'You', isSelf: true }];
  const workers = [];
  let sawSelf = false;
  for (const m of group.members || []) {
    if (m.id === myId) { sawSelf = true; workers.push({ id: myId, name: m.name || 'You', isSelf: true }); continue; }
    if (m.online) workers.push({ id: m.id, name: m.name, isSelf: false });
  }
  if (!sawSelf) workers.unshift({ id: myId, name: 'You', isSelf: true });
  return workers;
}

function refreshMeshUi() {
  const available = mesh.isAvailable();
  const groups = available ? mesh.groups() : [];
  const prevGid = groupSelect.value;
  groupSelect.innerHTML = '';
  // Always offer an explicit "run locally only" choice, even when groups are available --
  // currentWorkers() already treats an empty gid as local-only, so this just exposes that
  // as a real, always-present option rather than only existing implicitly when no group
  // has ever been selected.
  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = 'None (run locally only)';
  groupSelect.appendChild(noneOpt);
  for (const g of groups) {
    const opt = document.createElement('option');
    opt.value = g.gid;
    opt.textContent = g.name || g.gid;
    groupSelect.appendChild(opt);
  }
  groupSelect.value = groups.some((g) => g.gid === prevGid) ? prevGid : '';
  renderMeshBanner(available, groups);
  renderRoster(currentWorkers());
  renderAcceptList(false);
}

let lastAcceptSig = '';
function renderAcceptList(force) {
  const groups = mesh.isAvailable() ? mesh.groups() : [];
  const sig = JSON.stringify(groups.map((g) => [g.gid, g.name, g.creator, (g.members || []).length, acceptsTasksFrom(g.gid)]));
  if (!force && sig === lastAcceptSig) return;   // don't rebuild (and steal clicks from) an unchanged list
  lastAcceptSig = sig;
  acceptList.replaceChildren();
  if (!groups.length) {
    const empty = document.createElement('div');
    empty.className = 'activity-empty';
    empty.textContent = 'Join a WebRTC Chat group to help with other people\'s jobs.';
    acceptList.appendChild(empty);
    return;
  }
  for (const g of groups) {
    const row = document.createElement('label');
    row.className = 'accept-row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = acceptsTasksFrom(g.gid);
    box.dataset.gid = g.gid;
    box.addEventListener('change', () => { box.checked = setAcceptTasks(g.gid, box.checked); });
    const name = document.createElement('span');
    name.className = 'accept-name';
    name.textContent = g.name || g.gid;
    name.title = `${(g.members || []).length} member(s)`;
    row.append(box, name);
    acceptList.appendChild(row);
  }
  const hint = document.createElement('div');
  hint.className = 'accept-hint';
  hint.textContent = 'Off by default. Ticked groups can run their code on this computer — in an isolated sandbox without network or storage access, stopped after a timeout.';
  acceptList.appendChild(hint);
}

function resetProgress(chunkCount, labelPrefix) {
  progressList.innerHTML = '';
  chunkRows = new Map();
  for (let i = 0; i < chunkCount; i++) {
    const row = document.createElement('div');
    row.className = 'chunk-row';
    row.innerHTML = `<span class="chunk-idx">${labelPrefix}${i}</span><span class="chunk-worker">--</span><span class="chunk-status status-queued">queued</span>`;
    progressList.appendChild(row);
    chunkRows.set(i, row);
  }
}

function onProgress(update, workers) {
  const row = chunkRows.get(update.chunkIndex);
  if (!row) return;
  const statusEl = row.querySelector('.chunk-status');
  const workerEl = row.querySelector('.chunk-worker');
  statusEl.className = `chunk-status status-${update.status}`;
  statusEl.textContent = update.status;
  workerEl.textContent = workerLabel(workers, update.workerId);
  if (update.status === 'failed' || update.status === 'timeout') {
    log(`chunk ${update.chunkIndex} ${update.status} on ${workerLabel(workers, update.workerId)}${update.error ? ': ' + update.error : ''}`, update.status === 'failed');
  }
}

async function runMapReduceExample(sourceText, gid, workers) {
  const parsed = runTask(sourceText, undefined);
  if (!parsed.ok) throw new Error('editor source error: ' + parsed.error);
  const { data, chunkSize, mapTaskSource, combineTaskSource } = parsed.result;
  if (!Array.isArray(data) || !chunkSize || !mapTaskSource || !combineTaskSource) {
    throw new Error('map/reduce descriptor must have { data, chunkSize, mapTaskSource, combineTaskSource }');
  }
  const chunkCount = Math.ceil(data.length / chunkSize);
  resetProgress(chunkCount, '#');
  const buildArgs = (i) => ({ chunk: data.slice(i * chunkSize, (i + 1) * chunkSize), chunkIndex: i });
  const { combined } = await scheduler.run({
    gid, chunkCount, taskSource: mapTaskSource, buildArgs, combineSource: combineTaskSource,
    workers, timeoutMs: 8000, maxRetries: 2,
    onProgress: (u) => onProgress(u, workers),
  });
  resultValue.textContent = JSON.stringify(combined);
  log(`combined result: ${JSON.stringify(combined)}`);
}

async function runNeuralNetExample(sourceText, gid, workers) {
  const parsed = runTask(sourceText, undefined);
  if (!parsed.ok) throw new Error('editor source error: ' + parsed.error);
  const cfg = parsed.result;
  if (typeof cfg.generateDataset !== 'function' || !cfg.workerStepSource) {
    throw new Error('NN descriptor must have { generateDataset(n,seed), workerStepSource, hiddenSize, epochs, lr, datasetSize, seed }');
  }
  const { X, Y } = cfg.generateDataset(cfg.datasetSize, cfg.seed);
  let model = TinyNN.createModel(2, cfg.hiddenSize, 1, cfg.seed);
  const losses = [];
  const shardCount = Math.max(1, workers.length);
  const shardSize = Math.ceil(X.length / shardCount);

  for (let epoch = 0; epoch < cfg.epochs; epoch++) {
    resetProgress(shardCount, 'w');
    const currentModel = model;
    const buildArgs = (i) => ({
      shardX: X.slice(i * shardSize, (i + 1) * shardSize),
      shardY: Y.slice(i * shardSize, (i + 1) * shardSize),
      model: currentModel,
    });
    const { combined } = await scheduler.run({
      gid, chunkCount: shardCount, taskSource: cfg.workerStepSource, buildArgs,
      combineSource: NN_COMBINE_SOURCE, workers, timeoutMs: 8000, maxRetries: 2,
      onProgress: (u) => onProgress(u, workers),
    });
    model = TinyNN.applyUpdate(model, combined.grads, cfg.lr);
    losses.push(combined.loss);
    resultValue.textContent = `epoch ${epoch + 1}/${cfg.epochs} loss=${combined.loss.toFixed(4)}`;
    drawLossChart(lossCanvas, losses);
    log(`epoch ${epoch + 1}/${cfg.epochs} loss=${combined.loss.toFixed(4)}`);
    // yield to the UI thread between epochs
    await new Promise((r) => setTimeout(r, 0));
  }
  window.__lastNNLosses = losses; // test hook
  window.__lastNNModel = model; // test hook
}

async function onRun() {
  if (running) return;
  running = true;
  updateStatusRunState();
  runBtn.disabled = true;
  logEl.innerHTML = '';
  resultValue.textContent = '--';
  try {
    const example = EXAMPLES.find((e) => e.id === exampleSelect.value) || EXAMPLES[0];
    const workers = currentWorkers();
    const gid = groupSelect.value || null;
    log(`running "${example.name}" across ${workers.length} worker(s): ${workers.map((w) => w.name || w.id).join(', ')}`);
    const sourceText = editor.getValue();
    if (example.id === MAP_REDUCE_EXAMPLE.id) {
      await runMapReduceExample(sourceText, gid, workers);
    } else {
      await runNeuralNetExample(sourceText, gid, workers);
    }
    log('done.');
  } catch (e) {
    log('run failed: ' + (e && e.message ? e.message : String(e)), true);
  } finally {
    running = false;
    runBtn.disabled = false;
    updateStatusRunState();
  }
}

function loadExample(id) {
  const example = EXAMPLES.find((e) => e.id === id) || EXAMPLES[0];
  editor.setValue(example.source);
  editor.refresh();
}

function init() {
  for (const ex of EXAMPLES) {
    const opt = document.createElement('option');
    opt.value = ex.id;
    opt.textContent = ex.name;
    exampleSelect.appendChild(opt);
  }
  editor = createEditor(el('editor-host'), EXAMPLES[0].source);
  exampleSelect.addEventListener('change', () => loadExample(exampleSelect.value));
  runBtn.addEventListener('click', onRun);
  toggleNavBtn.addEventListener('click', () => sideNav.classList.toggle('collapsed'));

  refreshMeshUi();
  setInterval(refreshMeshUi, 3000); // roster/availability can change any time (peers join/leave)

  // Worker-task activity (this window acting as a worker for another peer's
  // job) — see Scheduler._handleIncomingTask/getLocalActivities(). Polled
  // (like refreshMeshUi above) rather than event-driven, since Scheduler is
  // deliberately plain/DOM-free and doesn't own a pub/sub mechanism of its
  // own; states are short-lived enough that a fast poll keeps it feeling live.
  const refreshActivity = () => {
    latestActivities = scheduler.getLocalActivities();
    renderActivity(latestActivities);
    updateStatusRunState();
  };
  refreshActivity();
  setInterval(refreshActivity, 500);

  // test hooks
  window.__distComputeReady = true;
  window.__distComputeSetSource = (text) => editor.setValue(text);
  window.__distComputeGetSource = () => editor.getValue();
  window.__distComputeMesh = mesh;
  window.__distComputeScheduler = scheduler;
  window.__distComputeActivities = () => scheduler.getLocalActivities();
  window.__distComputeSetAccept = (gid, on) => setAcceptTasks(gid, on !== false);
  window.__distComputeAccepts = (gid) => acceptsTasksFrom(gid);
  window.__distComputeSandbox = sandbox;
}

init();
