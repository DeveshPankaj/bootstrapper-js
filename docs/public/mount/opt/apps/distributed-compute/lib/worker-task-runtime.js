// worker-task-runtime.js — runs a task source inside a real dedicated Web
// Worker instead of on the main thread. task-runtime.js's `runTask` is a
// synchronous `new Function(...)` call: once started it cannot be interrupted
// by anything (not a button click, not a CLI command) until it returns
// naturally, because JS on one thread can't preempt itself. A Worker can
// actually be `.terminate()`d mid-execution, which is what makes a genuine
// "kill this worker task" feature possible (see the activity registry —
// Host.registerActivity in src/shared/index.ts — this module's `kill()` is
// wired up as an activity's `onKill` in scheduler.js).
//
// Only used for the RESPONDER side (answering another peer's dc-task) — the
// dispatcher's own local self-dispatch and combine step still call
// task-runtime.js's synchronous `runTask` directly, unchanged, since those
// already have UI feedback via the progress panel and aren't what this
// feature is about.
//
// tiny-nn.js has no DOM/platform dependency (pure math), so its source text
// can be inlined into the worker's bootstrap script verbatim, with `export`
// keywords stripped (a classic dedicated Worker has no module loader unless
// created with `{ type: 'module' }`, and inlining avoids needing to resolve
// the vfs's own `/(sw)/...` URL scheme — which doesn't reach a Worker anyway
// — from inside the worker itself).
import { MAX_SOURCE_LEN } from './task-runtime.js';

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
  try {
    const fullArgs = Object.assign({}, args, { nn });
    const result = fn(fullArgs);
    self.postMessage({ ok: true, result });
  } catch (err) {
    self.postMessage({ ok: false, error: (err && err.message) ? err.message : String(err) });
  }
};
`;
}

// Runs `source` in a fresh dedicated Worker (one per call — these are meant to
// be short-lived per-task workers, not a persistent pool).
// `nnSource` is tiny-nn.js's raw file text, read by the caller (which has
// fs/vfs access — this module deliberately has none of its own).
// Returns { promise, kill() }. `promise` resolves to the same
// `{ ok, result }` / `{ ok:false, error }` shape as task-runtime.js's
// `runTask`, plus `killed: true` when resolved via `kill()`.
export function runTaskInWorker(source, args, nnSource) {
  if (typeof source !== 'string' || source.trim().length === 0) {
    return { promise: Promise.resolve({ ok: false, error: 'task source must be a non-empty string' }), kill: () => false };
  }
  if (source.length > MAX_SOURCE_LEN) {
    return { promise: Promise.resolve({ ok: false, error: `task source too large (${source.length} chars, max ${MAX_SOURCE_LEN})` }), kill: () => false };
  }

  const nnPlain = (nnSource || '').replace(/^export /gm, '');
  const blob = new Blob([buildWorkerScript(nnPlain)], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);

  let settled = false;
  let resolvePromise;
  const promise = new Promise((resolve) => { resolvePromise = resolve; });

  const cleanup = () => {
    try { worker.terminate(); } catch (_) {}
    try { URL.revokeObjectURL(url); } catch (_) {}
  };

  worker.onmessage = (e) => {
    if (settled) return;
    settled = true;
    cleanup();
    resolvePromise(e.data);
  };
  worker.onerror = (e) => {
    if (settled) return;
    settled = true;
    cleanup();
    resolvePromise({ ok: false, error: (e && e.message) || 'worker error' });
  };
  worker.postMessage({ taskSource: source, args });

  return {
    promise,
    kill() {
      if (settled) return false;
      settled = true;
      cleanup();
      resolvePromise({ ok: false, error: 'killed', killed: true });
      return true;
    },
  };
}
