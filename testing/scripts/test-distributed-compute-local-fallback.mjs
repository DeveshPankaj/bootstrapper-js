// test-distributed-compute-local-fallback.mjs — verifies the scheduler runs a
// map/reduce example correctly with ZERO peers and no mesh bridge at all
// (MeshClient built with host=null, i.e. exactly what happens if the WebRTC
// mesh bridge command set doesn't exist yet, or the user hasn't joined any
// group) — "distributed across N machines" gracefully becomes "distributed
// across 1" instead of failing.
import { MeshClient } from '../../docs/public/mount/opt/apps/distributed-compute/lib/mesh-client.js';
import { Scheduler } from '../../docs/public/mount/opt/apps/distributed-compute/lib/scheduler.js';
import { runTask } from '../../docs/public/mount/opt/apps/distributed-compute/lib/task-runtime.js';
import { MAP_REDUCE_EXAMPLE } from '../../docs/public/mount/opt/apps/distributed-compute/examples/map-reduce-demo.js';

let failures = 0;
function check(label, cond, extra) {
  if (cond) console.log(`PASS: ${label}`);
  else { failures++; console.log(`FAIL: ${label}${extra !== undefined ? ' -- ' + JSON.stringify(extra) : ''}`); }
}

async function main() {
  const mesh = new MeshClient(null); // no host at all -- bridge cannot possibly be available
  check('mesh: isAvailable() is false with no host', mesh.isAvailable() === false);
  check('mesh: groups() is an empty array with no host', Array.isArray(mesh.groups()) && mesh.groups().length === 0);
  check('mesh: send() reports a clean failure rather than throwing', mesh.send('g1', { x: 1 }).ok === false);

  const scheduler = new Scheduler(mesh, { myId: 'self' });
  scheduler.startResponder(); // must not throw even though there's no bridge to subscribe to

  const parsed = runTask(MAP_REDUCE_EXAMPLE.source, undefined);
  check('map-reduce example source parses to a valid descriptor', parsed.ok, parsed.error);
  const { data, chunkSize, mapTaskSource, combineTaskSource } = parsed.result;
  const chunkCount = Math.ceil(data.length / chunkSize);
  const buildArgs = (i) => ({ chunk: data.slice(i * chunkSize, (i + 1) * chunkSize) });

  const progress = [];
  // No `workers` passed at all -- scheduler.run() must default to [{ isSelf:true }].
  const { results, combined } = await scheduler.run({
    gid: null,
    chunkCount,
    taskSource: mapTaskSource,
    buildArgs,
    combineSource: combineTaskSource,
    timeoutMs: 500,
    maxRetries: 2,
    onProgress: (u) => progress.push(u),
  });

  const expected = data.reduce((a, x) => a + x * x, 0);
  check('local-only run: combined result correct', combined === expected, { combined, expected });
  check('local-only run: every chunk resolved', results.every((r) => typeof r === 'number'));
  check('local-only run: every chunk ran on "self" (no network round trips)', progress.every((p) => p.workerId === 'self'));
  check('local-only run: no timeouts (local execution is synchronous)', !progress.some((p) => p.status === 'timeout'));

  scheduler.dispose();

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
