// ui/app.js — wires together the mesh client, scheduler, code editor and
// progress/log UI. This is the only file that knows about DOM ids in
// main.html; everything else (mesh-client, scheduler, task-runtime, tiny-nn,
// the examples) is plain, DOM-free logic that testing/scripts/*.mjs also
// exercises directly/mocked, independent of this UI layer.
import { MeshClient } from '../lib/mesh-client.js';
import { Scheduler } from '../lib/scheduler.js';
import { runTask } from '../lib/task-runtime.js';
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
const meshBanner = el('mesh-banner');
const rosterList = el('roster-list');
const progressList = el('progress-list');
const resultValue = el('result-value');
const lossCanvas = el('loss-canvas');
const logEl = el('log');

const mesh = new MeshClient(window.platform ? window.platform.host : null);
const scheduler = new Scheduler(mesh, { myId: (mesh.myIdentity() || {}).id || 'self' });
scheduler.startResponder(); // this window is always a potential worker for other peers' jobs

let editor = null;
let running = false;
let chunkRows = new Map(); // chunkIndex -> row element

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

function renderRoster(workers) {
  rosterList.innerHTML = '';
  for (const w of workers) {
    const row = document.createElement('div');
    row.className = 'worker-row';
    row.innerHTML = `<span class="worker-dot${w.isSelf ? ' self' : ''}"></span><span class="worker-name">${w.isSelf ? (w.name || 'You') + ' (you)' : (w.name || w.id)}</span>`;
    rosterList.appendChild(row);
  }
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

  refreshMeshUi();
  setInterval(refreshMeshUi, 3000); // roster/availability can change any time (peers join/leave)

  // test hooks
  window.__distComputeReady = true;
  window.__distComputeSetSource = (text) => editor.setValue(text);
  window.__distComputeGetSource = () => editor.getValue();
  window.__distComputeMesh = mesh;
  window.__distComputeScheduler = scheduler;
}

init();
