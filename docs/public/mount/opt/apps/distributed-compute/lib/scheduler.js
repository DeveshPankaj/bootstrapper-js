// scheduler.js — chunks a dataset, dispatches one chunk per available worker
// (including this peer itself), collects/combines results, and reassigns a
// chunk to a different worker if the original one never responds within a
// timeout. Works identically whether `workers` has one entry (pure local
// fallback, no mesh needed at all) or many (real distributed dispatch over
// the mesh bridge).
//
// Also runs the stateless "worker responder" side of the protocol: any peer
// with this app open answers `dc-task` messages addressed to it (via
// task-runtime.js) regardless of whether it is itself currently coordinating
// a job — every open window is a potential worker for anyone else's job.
import { runTask } from './task-runtime.js';

const MSG_TASK = 'dc-task';
const MSG_RESULT = 'dc-result';

function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class Scheduler {
  constructor(mesh, opts = {}) {
    this.mesh = mesh;
    this.myId = opts.myId || 'self';
    this._pending = new Map(); // taskId -> { resolve }
    this._sub = null;
  }

  startResponder() {
    if (this._sub) return;
    this._sub = this.mesh.onMessage((gid, fromPeerId, fromName, msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === MSG_TASK && msg.to === this.myId) {
        const outcome = runTask(msg.taskSource, msg.args);
        this.mesh.send(gid, {
          type: MSG_RESULT,
          to: fromPeerId,
          taskId: msg.taskId,
          ok: outcome.ok,
          result: outcome.ok ? outcome.result : undefined,
          error: outcome.ok ? undefined : outcome.error,
        });
      } else if (msg.type === MSG_RESULT && msg.to === this.myId) {
        const pending = this._pending.get(msg.taskId);
        if (pending) {
          this._pending.delete(msg.taskId);
          pending.resolve({ ok: msg.ok, result: msg.result, error: msg.error, fromPeerId });
        }
      }
    });
  }

  dispose() {
    if (this._sub) { this._sub.unsubscribe(); this._sub = null; }
    this._pending.clear();
  }

  // Runs one chunk on one worker. Self is always executed in-process
  // (synchronous, no mesh round trip, cannot "time out"). A remote worker is
  // dispatched a `dc-task` message and given `timeoutMs` to reply with a
  // `dc-result` before this resolves with `{ ok:false, timedOut:true }`.
  _runOnWorker(gid, worker, taskSource, args, timeoutMs) {
    if (worker.isSelf) {
      return Promise.resolve(Object.assign({ fromPeerId: this.myId }, runTask(taskSource, args)));
    }
    const taskId = randomId();
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this._pending.delete(taskId);
        resolve({ ok: false, error: 'timeout waiting for worker', timedOut: true, fromPeerId: worker.id });
      }, timeoutMs);
      this._pending.set(taskId, {
        resolve: (outcome) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(outcome);
        },
      });
      const sent = this.mesh.send(gid, { type: MSG_TASK, to: worker.id, taskId, taskSource, args });
      if (sent && sent.ok === false) {
        // send failed outright (e.g. peer dropped) — don't wait for the timeout.
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          this._pending.delete(taskId);
          resolve({ ok: false, error: sent.err || 'send failed', fromPeerId: worker.id });
        }
      }
    });
  }

  // Runs a single chunk, trying `primaryWorker` first, then other workers from
  // `pool` on timeout/failure (up to maxAttempts total), and finally always
  // giving self a shot before giving up entirely.
  async _assignChunk(gid, chunkIndex, primaryWorker, pool, taskSource, buildArgs, timeoutMs, maxAttempts, onProgress) {
    const attempted = new Set();
    let worker = primaryWorker;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      attempted.add(worker.id);
      onProgress && onProgress({ chunkIndex, status: 'running', workerId: worker.id, attempt });
      const args = buildArgs(chunkIndex);
      const outcome = await this._runOnWorker(gid, worker, taskSource, args, timeoutMs);
      if (outcome.ok) {
        onProgress && onProgress({ chunkIndex, status: 'done', workerId: worker.id });
        return outcome.result;
      }
      onProgress && onProgress({ chunkIndex, status: outcome.timedOut ? 'timeout' : 'failed', workerId: worker.id, error: outcome.error });
      if (attempt === maxAttempts - 1) break;
      const next = pool.find((w) => !attempted.has(w.id));
      worker = next || pool.find((w) => w.isSelf) || worker;
    }
    if (!attempted.has(this.myId)) {
      const selfWorker = pool.find((w) => w.isSelf) || { id: this.myId, isSelf: true, name: 'You' };
      onProgress && onProgress({ chunkIndex, status: 'running', workerId: selfWorker.id });
      const args = buildArgs(chunkIndex);
      const outcome = await this._runOnWorker(gid, selfWorker, taskSource, args, timeoutMs);
      if (outcome.ok) {
        onProgress && onProgress({ chunkIndex, status: 'done', workerId: selfWorker.id });
        return outcome.result;
      }
      onProgress && onProgress({ chunkIndex, status: 'failed', workerId: selfWorker.id, error: outcome.error });
    }
    throw new Error(`chunk ${chunkIndex} failed after ${maxAttempts} attempt(s): exhausted all workers`);
  }

  // opts:
  //   gid           - mesh group id (unused/optional for a pure local-only run)
  //   chunkCount    - number of chunks to process
  //   taskSource    - task-runtime source run once per chunk, args from buildArgs(i)
  //   buildArgs(i)  - () => plain JSON-serializable args for chunk i
  //   combineSource - task-runtime source run once locally over { results }
  //   workers       - [{ id, name, isSelf }], defaults to [{ id: myId, isSelf: true }]
  //   timeoutMs, maxRetries, onProgress({chunkIndex,status,workerId,error?})
  async run({ gid, chunkCount, taskSource, buildArgs, combineSource, workers, timeoutMs = 8000, maxRetries = 2, onProgress }) {
    const pool = (workers && workers.length > 0) ? workers : [{ id: this.myId, isSelf: true, name: 'You' }];
    const results = new Array(chunkCount);
    let nextChunk = 0;
    const maxAttempts = 1 + Math.max(0, maxRetries);

    const lanes = pool.map(async (worker) => {
      // Each worker "lane" repeatedly claims the next unclaimed chunk index
      // until the queue is empty — a fast worker naturally does more chunks.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (nextChunk >= chunkCount) return;
        const idx = nextChunk;
        nextChunk += 1;
        onProgress && onProgress({ chunkIndex: idx, status: 'queued', workerId: worker.id });
        results[idx] = await this._assignChunk(gid, idx, worker, pool, taskSource, buildArgs, timeoutMs, maxAttempts, onProgress);
      }
    });
    await Promise.all(lanes);

    const combined = runTask(combineSource, { results });
    if (!combined.ok) throw new Error('combine step failed: ' + combined.error);
    return { results, combined: combined.result };
  }
}
