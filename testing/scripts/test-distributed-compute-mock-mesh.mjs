// test-distributed-compute-mock-mesh.mjs — pure Node/ESM test harness with a
// mocked, in-process `webrtc.mesh.*` bridge simulating 2-3 "peers" exchanging
// messages, so the scheduler's chunking/dispatch/combine/timeout-reassignment
// logic (and mesh-client's chunk+reassemble transport) can be verified
// thoroughly independent of whether the real WebRTC mesh bridge is finished.
//
// No browser needed: mesh-client.js/scheduler.js/task-runtime.js/tiny-nn.js
// have no DOM dependency, so they can be imported and driven directly.
import { MeshClient } from '../../docs/public/mount/opt/apps/distributed-compute/lib/mesh-client.js';
import { Scheduler } from '../../docs/public/mount/opt/apps/distributed-compute/lib/scheduler.js';
import * as TinyNN from '../../docs/public/mount/opt/apps/distributed-compute/lib/tiny-nn.js';
import { NEURAL_NET_EXAMPLE, NN_COMBINE_SOURCE } from '../../docs/public/mount/opt/apps/distributed-compute/examples/neural-net-training.js';
import { runTask } from '../../docs/public/mount/opt/apps/distributed-compute/lib/task-runtime.js';

let failures = 0;
function check(label, cond, extra) {
  if (cond) {
    console.log(`PASS: ${label}`);
  } else {
    failures++;
    console.log(`FAIL: ${label}${extra !== undefined ? ' -- ' + JSON.stringify(extra) : ''}`);
  }
}

// ---- in-process fake mesh network -----------------------------------------
class FakeNetwork {
  constructor() { this.peers = new Map(); } // id -> { subs: Map(channel -> [handler]) }
  registerPeer(id) { this.peers.set(id, { subs: new Map() }); }
  subscribe(id, channel, handler) {
    const peer = this.peers.get(id);
    let list = peer.subs.get(channel);
    if (!list) { list = []; peer.subs.set(channel, list); }
    list.push(handler);
    return { unsubscribe: () => { const i = list.indexOf(handler); if (i >= 0) list.splice(i, 1); } };
  }
  send(fromId, gid, channel, payload) {
    const sentTo = [];
    for (const [pid, peer] of this.peers) {
      if (pid === fromId) continue;
      const list = peer.subs.get(channel) || [];
      if (list.length > 0) sentTo.push(pid);
      for (const h of list) {
        // simulate an async network hop
        setTimeout(() => h(gid, fromId, fromId, payload), 1);
      }
    }
    return { ok: true, sentTo };
  }
}

function makeFakeHost(network, id) {
  const commands = new Map();
  commands.set('webrtc.mesh.available', { exec: () => true });
  commands.set('webrtc.mesh.myId', { exec: () => ({ id, name: id }) });
  commands.set('webrtc.mesh.groups', { exec: () => [{
    gid: 'g1',
    name: 'Test Group',
    members: [...network.peers.keys()].map((pid) => ({ id: pid, name: pid, online: true })),
  }] });
  commands.set('webrtc.mesh.send', { exec: (gid, channel, payload) => network.send(id, gid, channel, payload) });
  commands.set('webrtc.mesh.subscribe', { exec: (channel, handler) => network.subscribe(id, channel, handler) });
  return { getCommand: (name) => commands.get(name) || null };
}

async function testChunkedTransport() {
  const network = new FakeNetwork();
  network.registerPeer('A');
  network.registerPeer('B');
  const meshA = new MeshClient(makeFakeHost(network, 'A'));
  const meshB = new MeshClient(makeFakeHost(network, 'B'));

  const bigPayload = { blob: 'x'.repeat(120000), tag: 'big' }; // forces multi-chunk split (> 40000 chars/chunk)
  const smallPayload = { hello: 'world' };

  const received = [];
  meshB.onMessage((gid, fromId, fromName, msg) => received.push(msg));

  meshA.send('g1', smallPayload);
  meshA.send('g1', bigPayload);

  await new Promise((r) => setTimeout(r, 50));

  check('mesh-client: small message reassembled correctly', received.some((m) => m && m.hello === 'world'));
  check('mesh-client: large (chunked) message reassembled correctly', received.some((m) => m && m.tag === 'big' && m.blob === bigPayload.blob));
}

async function testSchedulerDispatchCombineAndReassign() {
  const network = new FakeNetwork();
  network.registerPeer('A');
  network.registerPeer('B');
  network.registerPeer('C'); // C will never respond (never starts a responder)

  const meshA = new MeshClient(makeFakeHost(network, 'A'));
  const meshB = new MeshClient(makeFakeHost(network, 'B'));
  // C intentionally gets no MeshClient/responder -> simulates "never responds"

  const schedulerA = new Scheduler(meshA, { myId: 'A' });
  const schedulerB = new Scheduler(meshB, { myId: 'B' });
  schedulerA.startResponder();
  schedulerB.startResponder();

  const workers = [
    { id: 'A', isSelf: true, name: 'A' },
    { id: 'B', isSelf: false, name: 'B' },
    { id: 'C', isSelf: false, name: 'C' },
  ];

  const N = 100; // 0..99
  const chunkSize = 10;
  const data = Array.from({ length: N }, (_, i) => i);
  const chunkCount = Math.ceil(data.length / chunkSize);
  const mapTaskSource = `
    const { chunk } = args;
    let sum = 0;
    for (const x of chunk) sum += x * x;
    return sum;
  `;
  const combineTaskSource = `
    const { results } = args;
    return results.reduce((a, b) => a + b, 0);
  `;

  const progressEvents = [];
  const buildArgs = (i) => ({ chunk: data.slice(i * chunkSize, (i + 1) * chunkSize) });

  const { results, combined } = await schedulerA.run({
    gid: 'g1',
    chunkCount,
    taskSource: mapTaskSource,
    buildArgs,
    combineSource: combineTaskSource,
    workers,
    timeoutMs: 250,
    maxRetries: 2,
    onProgress: (u) => progressEvents.push(u),
  });

  const expected = data.reduce((a, x) => a + x * x, 0); // sum of squares 0..99

  check('scheduler: combined result is correct despite one dead worker', combined === expected, { combined, expected });
  check('scheduler: all chunks resolved (no undefined results)', results.every((r) => typeof r === 'number'));
  check('scheduler: at least one chunk assigned to dead worker C timed out', progressEvents.some((e) => e.workerId === 'C' && e.status === 'timeout'));
  check('scheduler: a timed-out chunk was reassigned and eventually completed', progressEvents.some((e) => e.status === 'done'));
  const workerIdsUsedForDone = new Set(progressEvents.filter((e) => e.status === 'done').map((e) => e.workerId));
  check('scheduler: work was actually spread across more than one worker', workerIdsUsedForDone.size > 1, [...workerIdsUsedForDone]);

  schedulerA.dispose();
  schedulerB.dispose();
}

async function testDistributedNeuralNetTraining() {
  const network = new FakeNetwork();
  network.registerPeer('A');
  network.registerPeer('B');
  network.registerPeer('C');

  const meshA = new MeshClient(makeFakeHost(network, 'A'));
  const meshB = new MeshClient(makeFakeHost(network, 'B'));
  const meshC = new MeshClient(makeFakeHost(network, 'C'));

  const schedulerA = new Scheduler(meshA, { myId: 'A' });
  const schedulerB = new Scheduler(meshB, { myId: 'B' });
  const schedulerC = new Scheduler(meshC, { myId: 'C' });
  schedulerA.startResponder();
  schedulerB.startResponder();
  schedulerC.startResponder();

  const workers = [
    { id: 'A', isSelf: true, name: 'A' },
    { id: 'B', isSelf: false, name: 'B' },
    { id: 'C', isSelf: false, name: 'C' },
  ];

  const parsed = runTask(NEURAL_NET_EXAMPLE.source, undefined);
  check('nn example: editor source parses to a valid descriptor', parsed.ok, parsed.error);
  const cfg = parsed.result;
  cfg.epochs = 60; // keep the mock test fast but long enough to show a clear trend

  const { X, Y } = cfg.generateDataset(cfg.datasetSize, cfg.seed);
  let model = TinyNN.createModel(2, cfg.hiddenSize, 1, cfg.seed);
  const losses = [];
  const shardCount = workers.length;
  const shardSize = Math.ceil(X.length / shardCount);

  for (let epoch = 0; epoch < cfg.epochs; epoch++) {
    const currentModel = model;
    const buildArgs = (i) => ({
      shardX: X.slice(i * shardSize, (i + 1) * shardSize),
      shardY: Y.slice(i * shardSize, (i + 1) * shardSize),
      model: currentModel,
    });
    const { combined } = await schedulerA.run({
      gid: 'g1',
      chunkCount: shardCount,
      taskSource: cfg.workerStepSource,
      buildArgs,
      combineSource: NN_COMBINE_SOURCE,
      workers,
      timeoutMs: 2000,
      maxRetries: 2,
    });
    model = TinyNN.applyUpdate(model, combined.grads, cfg.lr);
    losses.push(combined.loss);
  }

  const firstQuarter = losses.slice(0, Math.floor(losses.length / 4));
  const lastQuarter = losses.slice(-Math.floor(losses.length / 4));
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const avgFirst = avg(firstQuarter);
  const avgLast = avg(lastQuarter);

  check('nn training: loss decreased from first quarter to last quarter of epochs', avgLast < avgFirst, { avgFirst, avgLast, losses });
  check('nn training: final loss is well below the initial loss', losses[losses.length - 1] < losses[0] * 0.8, { first: losses[0], last: losses[losses.length - 1] });

  schedulerA.dispose();
  schedulerB.dispose();
  schedulerC.dispose();
}

async function main() {
  await testChunkedTransport();
  await testSchedulerDispatchCombineAndReassign();
  await testDistributedNeuralNetTraining();
  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
