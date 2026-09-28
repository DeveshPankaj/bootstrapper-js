// ui/app.js — wires together the mesh client, the replicated store, and the DOM
// (main.html). This is the only file that knows about DOM ids; lib/kv-store.js and
// lib/mesh-client.js are plain, DOM-free logic that testing/scripts/*.mjs also
// exercises directly, independent of this UI layer — mirrors the separation of
// concerns in docs/public/mount/opt/apps/distributed-compute/ui/app.js.
//
// Wire protocol (payloads sent/received via mesh.send(gid, message) /
// mesh.onMessage(handler); a `gid` bucket is a whole group's shared store, so every
// member ends up with its own independent KVStore per group):
//   { type: 'kv-set',       key, entry }  -- a local set/delete, entry = {value, ts, peerId, deleted}
//   { type: 'kv-sync-req' }               -- "I just selected/opened this group's store — send me a snapshot"
//   { type: 'kv-sync-res',  snapshot }    -- full KVStore#snapshot() dump, sent in reply
//
// Late-joiner catch-up: the first time a group is selected in this tab, we broadcast
// kv-sync-req to the whole group. Since the mesh bridge only exposes group-wide
// broadcast (no point-to-point send), a kv-sync-res reply also goes to the whole
// group — every recipient just merges it via LWW, which is harmless/idempotent, so
// this doesn't need to target any specific peer.
import { MeshClient } from '../lib/mesh-client.js';
import { KVStore } from '../lib/kv-store.js';

const LOCAL_GID = ''; // sentinel bucket for "None (run locally only)"

const el = (id) => document.getElementById(id);
const groupSelect = el('group-select');
const meshBanner = el('mesh-banner');
const rosterList = el('roster-list');
const kvForm = el('kv-form');
const kvKey = el('kv-key');
const kvValue = el('kv-value');
const kvTbody = el('kv-tbody');

const mesh = new MeshClient(window.platform ? window.platform.host : null);

// The mesh identity may not exist yet when this module first runs (e.g. the app was
// opened before WebRTC Chat finished connecting), so it's resolved fresh on every
// write rather than captured once at startup -- see the comment on KVStore's
// constructor in lib/kv-store.js. Falls back to a stable-for-this-tab random id so
// concurrent purely-local sessions still tie-break deterministically against each
// other if their writes ever do end up compared (e.g. after joining a mesh later).
let _fallbackId = null;
function myPeerId() {
  const identity = mesh.myIdentity();
  if (identity && identity.id) return identity.id;
  if (!_fallbackId) _fallbackId = 'local-' + Math.random().toString(36).slice(2, 10);
  return _fallbackId;
}

const stores = new Map();       // gid -> KVStore
const requestedSync = new Set(); // gids we've already sent a kv-sync-req for, this session
let currentGid = LOCAL_GID;

function storeFor(gid) {
  let s = stores.get(gid);
  if (!s) {
    s = new KVStore();
    stores.set(gid, s);
  }
  return s;
}

function groupById(gid) {
  return mesh.groups().find((g) => g.gid === gid) || null;
}

function peerName(gid, peerId) {
  if (peerId === myPeerId()) return 'You';
  const g = groupById(gid);
  const m = g && g.members.find((mm) => mm.id === peerId);
  return (m && m.name) || String(peerId).slice(0, 8);
}

function onMeshMessage(gid, fromPeerId, fromName, msg) {
  if (!msg || typeof msg !== 'object') return;
  const store = storeFor(gid);
  let changed = false;
  if (msg.type === 'kv-set' && msg.key) {
    changed = store.applyEntry(msg.key, msg.entry);
  } else if (msg.type === 'kv-sync-req') {
    if (!store.isEmpty()) mesh.send(gid, { type: 'kv-sync-res', snapshot: store.snapshot() });
    return;
  } else if (msg.type === 'kv-sync-res') {
    changed = store.mergeSnapshot(msg.snapshot);
  }
  if (changed && gid === currentGid) render();
}

let subscribed = false;
function ensureSubscribed() {
  if (subscribed) return;
  if (!mesh.isAvailable()) return;
  mesh.onMessage(onMeshMessage);
  subscribed = true;
}

// Ensures a group's store exists and, the first time it's selected this session,
// requests a late-joiner catch-up snapshot from whoever else is already in it.
function ensureSyncRequested(gid) {
  if (!gid) return;
  storeFor(gid);
  if (!requestedSync.has(gid)) {
    requestedSync.add(gid);
    mesh.send(gid, { type: 'kv-sync-req' });
  }
}

function currentWorkers(gid) {
  const myId = myPeerId();
  if (!gid || !mesh.isAvailable()) return [{ id: myId, name: 'You', isSelf: true, online: true }];
  const g = groupById(gid);
  if (!g) return [{ id: myId, name: 'You', isSelf: true, online: true }];
  const workers = [];
  let sawSelf = false;
  for (const m of g.members || []) {
    if (m.id === myId) { sawSelf = true; workers.push({ id: myId, name: m.name || 'You', isSelf: true, online: true }); continue; }
    workers.push({ id: m.id, name: m.name, isSelf: false, online: !!m.online });
  }
  if (!sawSelf) workers.unshift({ id: myId, name: 'You', isSelf: true, online: true });
  return workers;
}

function renderMeshBanner(available, groups) {
  if (!available) {
    meshBanner.textContent = 'Mesh bridge unavailable -- running local-only. Open WebRTC Chat, connect to a group, and come back to replicate across peers.';
    meshBanner.className = 'warn';
  } else if (groups.length === 0) {
    meshBanner.textContent = 'No WebRTC groups joined -- running local-only. Open WebRTC Chat, connect to a group, and come back.';
    meshBanner.className = 'warn';
  } else if (!currentGid) {
    meshBanner.textContent = `Mesh ready -- ${groups.length} group(s) available. Select one to replicate.`;
    meshBanner.className = 'ok';
  } else {
    const workers = currentWorkers(currentGid);
    const onlineCount = workers.filter((w) => w.online).length;
    meshBanner.textContent = `Replicating over "${(groupById(currentGid) || {}).name || currentGid}" -- ${onlineCount} peer(s) online.`;
    meshBanner.className = 'ok';
  }
}

function renderRoster(workers) {
  rosterList.innerHTML = '';
  for (const w of workers) {
    const row = document.createElement('div');
    row.className = 'worker-row';
    const dotClass = w.isSelf ? 'self' : (w.online ? '' : 'offline');
    row.innerHTML = `<span class="worker-dot ${dotClass}"></span><span class="worker-name">${escapeHtml(w.isSelf ? (w.name || 'You') + ' (you)' : (w.name || w.id))}</span>`;
    rosterList.appendChild(row);
  }
}

function refreshMeshUi() {
  const available = mesh.isAvailable();
  const groups = available ? mesh.groups() : [];
  ensureSubscribed();

  const prevGid = groupSelect.value;
  groupSelect.innerHTML = '';
  // Always offer an explicit "run locally only" choice, even when groups are
  // available -- mirrors distributed-compute's group-select pattern exactly.
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
  const stillValid = groups.some((g) => g.gid === prevGid);
  groupSelect.value = stillValid ? prevGid : (currentGid && groups.some((g) => g.gid === currentGid) ? currentGid : '');
  if (groupSelect.value !== currentGid) currentGid = groupSelect.value || LOCAL_GID;

  if (currentGid) ensureSyncRequested(currentGid);
  window.__kvStore = storeFor(currentGid);

  renderMeshBanner(available, groups);
  renderRoster(currentWorkers(currentGid));
  render();
}

function selectGroup(gid) {
  currentGid = gid || LOCAL_GID;
  window.__kvStore = storeFor(currentGid);
  if (currentGid) ensureSyncRequested(currentGid);
  refreshMeshUi();
}

// ---- form actions ----
function parseValueInput(text) {
  if (text === '') return '';
  try { return JSON.parse(text); } catch (_) { return text; }
}

function doSet(key, rawValue) {
  if (!key) return;
  const store = storeFor(currentGid);
  const value = parseValueInput(rawValue);
  const entry = store.set(key, value, myPeerId());
  if (currentGid) mesh.send(currentGid, { type: 'kv-set', key, entry });
  render();
}

function doDelete(key) {
  if (!key) return;
  const store = storeFor(currentGid);
  const entry = store.delete(key, myPeerId());
  if (currentGid) mesh.send(currentGid, { type: 'kv-set', key, entry });
  render();
}

// ---- rendering ----
function fmtAgo(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 2) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function render() {
  const store = storeFor(currentGid);
  const entries = store.visible();
  if (entries.length === 0) {
    kvTbody.innerHTML = `<tr><td colspan="5" class="empty-row">No keys yet -- set one above.</td></tr>`;
    return;
  }
  kvTbody.innerHTML = entries.map((e) => {
    const displayValue = typeof e.value === 'object' && e.value !== null ? JSON.stringify(e.value) : String(e.value);
    return `<tr>
      <td class="key-cell">${escapeHtml(e.key)}</td>
      <td class="value-cell">${escapeHtml(displayValue)}</td>
      <td class="writer-cell">${escapeHtml(peerName(currentGid, e.peerId))}</td>
      <td class="age-cell">${fmtAgo(e.ts)}</td>
      <td><button type="button" class="danger del-btn" data-key="${escapeHtml(e.key)}">Delete</button></td>
    </tr>`;
  }).join('');
}

function init() {
  window.__kvStore = storeFor(currentGid);

  groupSelect.addEventListener('change', () => selectGroup(groupSelect.value));
  kvForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const key = kvKey.value.trim();
    doSet(key, kvValue.value);
    kvKey.value = '';
    kvValue.value = '';
    kvKey.focus();
  });
  kvTbody.addEventListener('click', (e) => {
    const btn = e.target.closest('.del-btn');
    if (btn) doDelete(btn.dataset.key);
  });

  refreshMeshUi();
  setInterval(refreshMeshUi, 2000); // roster/availability can change any time (peers join/leave)

  // test hooks (mirrors distributed-compute's window.__distCompute* pattern)
  window.__kvReady = true;
  window.__kvMesh = mesh;
  window.__kvSet = (key, value) => {
    doSet(key, typeof value === 'string' ? value : JSON.stringify(value));
    return storeFor(currentGid).get(key);
  };
  window.__kvDelete = (key) => doDelete(key);
  window.__kvGet = (key) => storeFor(currentGid).get(key);
  window.__kvAll = () => storeFor(currentGid).all();
  window.__kvSelectGroup = (gid) => { groupSelect.value = gid || ''; selectGroup(gid); };
}

init();
