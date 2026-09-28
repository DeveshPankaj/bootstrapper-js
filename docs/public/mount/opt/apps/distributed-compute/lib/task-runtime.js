// task-runtime.js — safely executes a received "task" (JS source code, not a
// closure — closures can't be serialized across peers) reconstructed via
// `new Function(...)`.
//
// House style (see CLAUDE.md's Platform/Host section on execCommand/execString):
// treat source code as data that is DELIBERATELY executed, but never string-
// interpolate untrusted VALUES into a code template. Here, `source` is always a
// literal function-body string authored by the local user in the code editor
// (or shipped as one of the bundled examples) — it travels to peers as an
// opaque string argument to a message, and is handed to `new Function('args',
// source)` as-is. The DATA a task operates on (chunks, model weights, ...)
// is passed as a real JS value via the `args` parameter, never spliced into
// the source string itself.
import * as nn from './tiny-nn.js';

// Keep individual mesh messages small (see mesh-client.js) and prevent a
// pathological/malicious task source from being executed at all.
export const MAX_SOURCE_LEN = 20000;

// Trusted local libraries injected into every task's `args`, identically on
// every peer (every peer runs the same app code) — never transmitted over the
// wire themselves, only referenced by name from small user-authored glue code.
function trustedHelpers() {
  return { nn };
}

// Runs `source` (a function BODY, i.e. what would go between the braces of
// `function(args) { ... }`) with the given plain-data `args`.
// Returns { ok: true, result } or { ok: false, error }.
export function runTask(source, args) {
  if (typeof source !== 'string' || source.trim().length === 0) {
    return { ok: false, error: 'task source must be a non-empty string' };
  }
  if (source.length > MAX_SOURCE_LEN) {
    return { ok: false, error: `task source too large (${source.length} chars, max ${MAX_SOURCE_LEN})` };
  }

  let fn;
  try {
    // eslint-disable-next-line no-new-func
    fn = new Function('args', source);
  } catch (e) {
    return { ok: false, error: 'syntax error in task source: ' + (e && e.message ? e.message : String(e)) };
  }

  try {
    const fullArgs = Object.assign({}, args, trustedHelpers());
    const result = fn(fullArgs);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: (e && e.message) ? e.message : String(e) };
  }
}
