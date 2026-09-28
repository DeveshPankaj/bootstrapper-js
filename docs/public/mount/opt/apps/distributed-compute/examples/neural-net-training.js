// examples/neural-net-training.js — data-parallel training of a tiny MLP
// across the group's peers.
//
// `source` is the DEFAULT TEXT loaded into the code editor. It is run once
// locally (via task-runtime's runTask, same size-capped `new Function`
// discipline as any other task) to produce a plain "training descriptor":
//   {
//     hiddenSize, epochs, lr, datasetSize, seed,   // all directly editable
//     generateDataset(n, seed) -> { X, Y },        // runs locally only
//     workerStepSource: string,                    // sent to & run on each worker, every epoch
//   }
//
// Each epoch, the app (see main.js's runNeuralNetTraining):
//   1. splits { X, Y } into one shard per available worker (including self),
//   2. dispatches workerStepSource to each worker with that shard + the
//      CURRENT shared model weights (JSON-serializable plain arrays),
//   3. each worker computes forward+backward pass on its shard with tiny-nn.js
//      (injected as `args.nn` by task-runtime.js -- never sent over the wire)
//      and reports back its gradients + local loss,
//   4. the coordinator averages the gradients across all workers
//      (nn.averageResults, weighted by shard size) and applies one update to
//      the shared weights,
//   5. the updated weights are broadcast out as the model for the next epoch.
// This is standard data-parallel SGD with gradient averaging.

export const NEURAL_NET_EXAMPLE = {
  id: 'neural-net-training',
  name: 'Data-parallel NN training (XOR-ish toy problem)',
  description: 'Trains a tiny 2-input / hidden / 1-output MLP on a noisy interleaved-clusters toy dataset. Each epoch the dataset is sharded across every available worker; each worker computes gradients on its shard from the CURRENT shared weights; the coordinator averages the gradients, updates the weights, and broadcasts them back out for the next epoch.',
  source: `// Distributed, data-parallel neural net training.
// Edit hiddenSize / epochs / lr / datasetSize / the dataset generator / the
// per-worker training step below, then click Run.
return {
  hiddenSize: 6,
  epochs: 40,
  lr: 0.6,
  datasetSize: 240,
  seed: 42,

  // Generates a small 2D binary classification toy problem: two noisy
  // interleaved rings (label 0 = inner-ish ring, label 1 = outer-ish ring) --
  // not linearly separable, small enough to converge in a few seconds.
  // Runs locally only (never sent to workers).
  generateDataset(n, seed) {
    const rng = mulberry32(seed);
    const X = [];
    const Y = [];
    for (let i = 0; i < n; i++) {
      const label = i % 2;
      const angle = rng() * Math.PI * 2;
      const radius = (label === 0 ? 1.1 : 2.6) + (rng() - 0.5) * 0.7;
      const x1 = Math.cos(angle) * radius;
      const x2 = Math.sin(angle) * radius;
      X.push([x1, x2]);
      Y.push(label);
    }
    return { X, Y };
  },

  // Runs on a worker (possibly a remote peer) for ONE epoch's shard, using the
  // CURRENT shared weights broadcast at the start of the epoch.
  // args = { shardX: number[][], shardY: number[], model, nn }
  //   -- nn is each peer's own local tiny-nn.js module, injected by
  //      task-runtime.js; it is never itself sent over the wire, only this
  //      small glue string is.
  // returns { grads, loss, n } (n = shard size, for correctly weighted averaging)
  workerStepSource: \`
    const { shardX, shardY, model, nn } = args;
    return nn.computeGradAndLoss(model, shardX, shardY);
  \`,
};

// Small deterministic PRNG so the dataset is reproducible across runs.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
`,
};

// The combine step for one epoch is fixed infrastructure (gradient averaging),
// not something the user is expected to hand-edit like the training step
// above, so it lives here as a plain constant rather than in the editable
// descriptor. It still goes through the exact same task-runtime.runTask path
// as any other task source (args.nn injected the same way).
export const NN_COMBINE_SOURCE = `
  const { results, nn } = args;
  return nn.averageResults(results);
`;
