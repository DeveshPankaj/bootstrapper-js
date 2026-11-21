// worker-task-runtime.js — runs ANOTHER PEER's task source (code received over the
// mesh) in an isolated sandbox, never in this app's own realm (audit NET-1,
// documentation/security/decisions.md D3/D13).
//
// Isolation: one hidden `<iframe sandbox="allow-scripts">` (no allow-same-origin →
// opaque origin: no IndexedDB, localStorage, cookies, caches, service worker,
// window.platform or parent DOM) built from srcdoc, with a meta CSP of
// `default-src 'none'` (so connect-src / img-src / … are 'none': no fetch, XHR,
// WebSocket, beacon or image exfiltration) that only allows its own nonce'd
// bootstrap script, eval (the task is a function body) and blob: workers. Each task
// runs in a fresh classic Worker created from the sandbox frame's OWN blob: URL
// (so the Worker is opaque too and inherits that CSP). A blob Worker created from
// this app's same-origin document would have the site's origin — never do that.
//
// Results come back over a MessagePort handed to the frame once. Each task has a
// timeout, and kill() terminates its Worker, which genuinely interrupts it (a
// synchronous `new Function` call on a thread can't be preempted) — that's what
// the activity registry's onKill (Host.registerActivity, src/shared/index.ts) uses,
// wired up in scheduler.js.
//
// tiny-nn.js has no DOM/platform dependency (pure math), so its source text is
// inlined into the worker script with `export` keywords stripped (a classic Worker
// has no module loader, and a sandboxed frame can't reach the vfs anyway).
import { MAX_SOURCE_LEN } from './task-runtime.js';

export const DEFAULT_TASK_TIMEOUT_MS = 60000;
export const MAX_TASK_TIMEOUT_MS = 120000;
const MIN_TASK_TIMEOUT_MS = 1000;
const SANDBOX_START_MS = 10000;   // the frame must say hello within this long
const WATCHDOG_GRACE_MS = 5000;   // parent-side backstop after the sandbox's own timer

function buildWorkerScript(nnSourcePlain) {
  return `
${nnSourcePlain}
const nn = { createModel, cloneModel, forward, computeGradAndLoss, averageResults, applyUpdate, predict };
self.onmessage = (e) => {
  const { taskSource, args } = e.data;
  let fn;
  try {
    fn = new Function('args', taskSource);
  } catch (err) {
    self.postMessage({ ok: false, error: 'syntax error in task source: ' + (err && err.message ? err.message : String(err)) });
    return;
  }
  let result;
  try {
    const fullArgs = Object.assign({}, args, { nn });
    result = fn(fullArgs);
  } catch (err) {
    self.postMessage({ ok: false, error: (err && err.message) ? err.message : String(err) });
    return;
  }
  try { self.postMessage({ ok: true, result }); }
  catch (err) { self.postMessage({ ok: false, error: 'the result could not be sent back: ' + ((err && err.message) || String(err)) }); }
};
`;
}

// Runs INSIDE the sandbox frame (serialised with Function.prototype.toString into
// its srcdoc). Self-contained on purpose: no closure over this module.
function sandboxMain() {
  let port = null, workerUrl = null;
  const running = new Map();   // task id -> { worker, timer }
  const stop = (id) => {
    const t = running.get(id);
    if (!t) return false;
    running.delete(id);
    clearTimeout(t.timer);
    try { t.worker.terminate(); } catch (_) {}
    return true;
  };
  const finish = (id, outcome) => {
    if (!stop(id)) return;
    try { port.postMessage({ type: 'done', id, outcome }); }
    catch (_) { port.postMessage({ type: 'done', id, outcome: { ok: false, error: 'the result could not be sent back' } }); }
  };
  const onPortMessage = (e) => {
    const m = e.data || {};
    if (m.type === 'kill') { stop(m.id); return; }
    if (m.type !== 'run' || typeof m.id !== 'string' || running.has(m.id)) return;
    let worker;
    try { worker = new Worker(workerUrl); }
    catch (err) { port.postMessage({ type: 'done', id: m.id, outcome: { ok: false, error: 'could not start the sandbox worker: ' + ((err && err.message) || String(err)) } }); return; }
    const ms = Number(m.timeoutMs) || 60000;
    const timer = setTimeout(() => finish(m.id, { ok: false, error: 'timed out after ' + Math.round(ms / 1000) + 's', timedOut: true }), ms);
    running.set(m.id, { worker, timer });
    worker.onmessage = (ev) => finish(m.id, ev.data && typeof ev.data === 'object' ? ev.data : { ok: false, error: 'bad reply from the task' });
    worker.onerror = (ev) => { try { ev.preventDefault(); } catch (_) {} finish(m.id, { ok: false, error: (ev && ev.message) || 'worker error' }); };
    worker.postMessage({ taskSource: m.source, args: m.args });
  };
  addEventListener('message', function hello(e) {
    if (e.source !== parent || !e.data || e.data.type !== 'dc-sandbox-init' || !e.ports || !e.ports[0]) return;
    removeEventListener('message', hello);
    port = e.ports[0];
    workerUrl = URL.createObjectURL(new Blob([String(e.data.workerSource || '')], { type: 'text/javascript' }));
    port.onmessage = onPortMessage;
    port.postMessage({ type: 'ready', origin: String(self.origin) });
  });
  parent.postMessage({ type: 'dc-sandbox-loaded' }, '*');
}

const randomToken = (bytes) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');

function sandboxDocument(nonce) {
  return '<!doctype html><html><head><meta charset="utf-8">'
    + `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' 'unsafe-eval' blob:; worker-src blob:; base-uri 'none'; form-action 'none'">`
    + `</head><body><script nonce="${nonce}">(${sandboxMain.toString()})();</script></body></html>`;
}

const clampTimeout = (ms) => {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TASK_TIMEOUT_MS;
  return Math.min(MAX_TASK_TIMEOUT_MS, Math.max(MIN_TASK_TIMEOUT_MS, Math.round(n)));
};

// Only plain fields cross from the sandbox into the app.
function cleanOutcome(o) {
  if (!o || typeof o !== 'object') return { ok: false, error: 'bad reply from the sandbox' };
  if (o.ok === true) return { ok: true, result: o.result };
  return { ok: false, error: String(o.error == null ? 'failed' : o.error).slice(0, 500), timedOut: o.timedOut === true || undefined };
}

// Creates the runner. `nnSource` is tiny-nn.js's raw file text, read by the caller
// (which has vfs access — this module deliberately has none). The sandbox frame is
// created lazily in `doc` (the app's own document) on the first task and recreated
// if it ever stops answering.
// run(source, args, { timeoutMs }) -> { promise, kill() }. `promise` resolves to the
// same `{ ok, result }` / `{ ok:false, error }` shape as task-runtime.js's `runTask`,
// plus `killed: true` when resolved via kill() and `timedOut: true` on a timeout.
export function createSandboxRunner({ nnSource = '', doc = typeof document !== 'undefined' ? document : null } = {}) {
  const workerSource = buildWorkerScript(String(nnSource || '').replace(/^export /gm, ''));
  let sandbox = null;

  function start() {
    const iframe = doc.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('tabindex', '-1');
    iframe.setAttribute('title', 'Distributed Compute task sandbox');
    iframe.style.cssText = 'position:absolute;left:-10000px;top:0;width:1px;height:1px;border:0;visibility:hidden;pointer-events:none';
    iframe.srcdoc = sandboxDocument(randomToken(16));
    const channel = new MessageChannel();
    const sb = { iframe, port: channel.port1, pending: new Map(), origin: null, ready: null, onWindowMessage: null };
    sb.ready = new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), SANDBOX_START_MS);
      sb.port.onmessage = (e) => {
        const m = e.data || {};
        if (m.type === 'ready') { clearTimeout(timer); sb.origin = String(m.origin); resolve(true); return; }
        if (m.type === 'done' && typeof m.id === 'string') { const settle = sb.pending.get(m.id); if (settle) settle(cleanOutcome(m.outcome)); }
      };
      // The frame announces itself once its own document runs; only then is the port
      // handed over (to that exact window — `e.source` can't be forged by other frames).
      sb.onWindowMessage = (e) => {
        if (e.source !== iframe.contentWindow || !e.data || e.data.type !== 'dc-sandbox-loaded') return;
        doc.defaultView.removeEventListener('message', sb.onWindowMessage);
        try { iframe.contentWindow.postMessage({ type: 'dc-sandbox-init', workerSource }, '*', [channel.port2]); }
        catch (_) { clearTimeout(timer); resolve(false); }
      };
      doc.defaultView.addEventListener('message', sb.onWindowMessage);
    });
    (doc.body || doc.documentElement).appendChild(iframe);
    return sb;
  }

  // Tears a sandbox down (removing the frame kills every Worker in it).
  function discard(sb, why) {
    if (sandbox === sb) sandbox = null;
    try { doc.defaultView.removeEventListener('message', sb.onWindowMessage); } catch (_) {}
    try { sb.port.close(); } catch (_) {}
    try { sb.iframe.remove(); } catch (_) {}
    for (const settle of [...sb.pending.values()]) settle({ ok: false, error: why });
  }

  function run(source, args, opts = {}) {
    if (typeof source !== 'string' || source.trim().length === 0) {
      return { promise: Promise.resolve({ ok: false, error: 'task source must be a non-empty string' }), kill: () => false };
    }
    if (source.length > MAX_SOURCE_LEN) {
      return { promise: Promise.resolve({ ok: false, error: `task source too large (${source.length} chars, max ${MAX_SOURCE_LEN})` }), kill: () => false };
    }
    if (!doc) return { promise: Promise.resolve({ ok: false, error: 'no document to host the task sandbox' }), kill: () => false };
    const timeoutMs = clampTimeout(opts.timeoutMs);
    if (!sandbox) sandbox = start();
    const sb = sandbox;
    const id = randomToken(8);
    let settled = false, resolvePromise, watchdog = null;
    const promise = new Promise((resolve) => { resolvePromise = resolve; });
    const settle = (outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      sb.pending.delete(id);
      resolvePromise(outcome);
    };
    sb.pending.set(id, settle);
    sb.ready.then((ok) => {
      if (settled) return;
      if (!ok) { discard(sb, 'could not start the task sandbox'); return; }
      try { sb.port.postMessage({ type: 'run', id, source, args, timeoutMs }); }
      catch (e) { settle({ ok: false, error: 'could not hand the task to the sandbox: ' + ((e && e.message) || String(e)) }); return; }
      // Backstop: the sandbox's own timer fires first; this only catches a sandbox that stopped answering.
      watchdog = setTimeout(() => { if (!settled) discard(sb, 'the task sandbox stopped responding'); }, timeoutMs + WATCHDOG_GRACE_MS);
    });
    return {
      promise,
      kill() {
        if (settled) return false;
        try { sb.port.postMessage({ type: 'kill', id }); } catch (_) {}
        settle({ ok: false, error: 'killed', killed: true });
        return true;
      },
    };
  }

  return {
    run,
    // For tests: the sandbox frame's origin as reported from inside it ('null' = opaque).
    origin: () => (sandbox ? sandbox.origin : null),
    frame: () => (sandbox ? sandbox.iframe : null),
    dispose() { if (sandbox) discard(sandbox, 'disposed'); },
  };
}
