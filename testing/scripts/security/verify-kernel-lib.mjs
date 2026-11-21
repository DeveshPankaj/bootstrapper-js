// Shared helpers for the phase-1A kernel verification scripts (verify-kernel-*.mjs).
// Builds on spike-lib.mjs (bootOS, addFrame, startServer, …).
export * from './spike-lib.mjs';

const results = [];

/** Records one check; prints PASS/FAIL immediately. */
export function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  const d = detail === undefined ? '' : '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail));
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${d.length > 400 ? d.slice(0, 400) + '…' : d}`);
}

/** Prints the totals and exits 0 when every check passed, 1 otherwise. */
export function finish(label) {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${label}: ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) console.log('failed: ' + failed.map((r) => r.name).join(' | '));
  process.exit(failed.length ? 1 : 0);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Polls `fn` (async) until it returns a truthy value or `ms` passes; returns the last value. */
export async function pollFor(fn, ms, step = 250) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await fn().catch(() => null);
    if (v) return v;
    await sleep(step);
  }
  return v;
}

// srcdoc for a frame that talks wos-ipc to its parent and records every response by id.
export const IPC_PROBE_SRCDOC = `<!doctype html><body>ipc probe<script>
  window.__resp = {};
  window.__events = [];
  addEventListener('message', (e) => {
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'wos-ipc-response') window.__resp[d.id] = { origin: e.origin, fromParent: e.source === parent, result: d.result, error: d.error };
    if (d.type === 'wos-ipc-event') window.__events.push({ event: d.event, fromParent: e.source === parent, fromTop: e.source === top });
  });
  window.__ask = (id, event, data) => parent.postMessage({ type: 'wos-ipc', id, event, data }, '*');
</script></body>`;

/** Sends `requests` ([id, event, data]) from `frame`, waits, returns the collected responses by id. */
export async function askAll(frame, requests, waitMs = 1500) {
  await frame.evaluate((reqs) => { for (const [id, ev, data] of reqs) window.__ask(id, ev, data); }, requests);
  await sleep(waitMs);
  return frame.evaluate(() => window.__resp);
}
