// tiny-nn.js — a tiny, dependency-free multi-layer perceptron.
//
// Single hidden layer: nInput -> tanh(hidden) -> sigmoid(output).
// Weights are plain nested JS arrays (not Float32Array) so a model is directly
// JSON-serializable and can be broadcast to peers over the mesh bridge with no
// extra encode/decode step.
//
// This module is intentionally NOT part of the "task source" contract (see
// task-runtime.js) — it is trusted local library code, loaded identically by
// every peer running this app, and injected into every task's `args.nn` by
// task-runtime.js. Only small pieces of glue code (what to do with `nn`) travel
// over the wire as task source text.

// Deterministic PRNG (mulberry32) so `createModel(..., seed)` gives every peer
// byte-identical initial weights without having to transmit them, if desired.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randRange(rng, lo, hi) { return lo + rng() * (hi - lo); }

export function createModel(nInput, nHidden, nOutput = 1, seed = 42) {
  const rng = mulberry32(seed);
  const scale1 = Math.sqrt(1 / nInput);
  const scale2 = Math.sqrt(1 / nHidden);
  const W1 = Array.from({ length: nHidden }, () =>
    Array.from({ length: nInput }, () => randRange(rng, -scale1, scale1)));
  const b1 = Array.from({ length: nHidden }, () => 0);
  const W2 = Array.from({ length: nOutput }, () =>
    Array.from({ length: nHidden }, () => randRange(rng, -scale2, scale2)));
  const b2 = Array.from({ length: nOutput }, () => 0);
  return { nInput, nHidden, nOutput, W1, b1, W2, b2 };
}

export function cloneModel(model) {
  return {
    nInput: model.nInput, nHidden: model.nHidden, nOutput: model.nOutput,
    W1: model.W1.map((row) => row.slice()),
    b1: model.b1.slice(),
    W2: model.W2.map((row) => row.slice()),
    b2: model.b2.slice(),
  };
}

const tanh = Math.tanh;
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

// Forward pass for a single example x (array length nInput).
// Returns intermediates needed for backprop.
export function forward(model, x) {
  const { W1, b1, W2, b2, nHidden, nOutput } = model;
  const hidden = new Array(nHidden);
  for (let j = 0; j < nHidden; j++) {
    let s = b1[j];
    const row = W1[j];
    for (let i = 0; i < row.length; i++) s += row[i] * x[i];
    hidden[j] = tanh(s);
  }
  const out = new Array(nOutput);
  for (let k = 0; k < nOutput; k++) {
    let s = b2[k];
    const row = W2[k];
    for (let j = 0; j < row.length; j++) s += row[j] * hidden[j];
    out[k] = sigmoid(s);
  }
  return { x, hidden, out };
}

function zerosLikeModel(model) {
  return {
    W1: model.W1.map((row) => row.map(() => 0)),
    b1: model.b1.map(() => 0),
    W2: model.W2.map((row) => row.map(() => 0)),
    b2: model.b2.map(() => 0),
  };
}

const EPS = 1e-7;

// Full backprop over a batch of examples X (array of arrays) with binary
// labels Y (array of 0/1, one per output unit — nOutput is normally 1 here).
// Returns { grads, loss } where grads has the same shape as the model
// (excluding nInput/nHidden/nOutput) and loss is the mean binary
// cross-entropy over the batch.
export function computeGradAndLoss(model, X, Y) {
  const grads = zerosLikeModel(model);
  const { nHidden, nOutput } = model;
  let lossSum = 0;
  const n = X.length;
  for (let s = 0; s < n; s++) {
    const x = X[s];
    const yRow = Array.isArray(Y[s]) ? Y[s] : [Y[s]];
    const { hidden, out } = forward(model, x);

    const dOutPre = new Array(nOutput);
    for (let k = 0; k < nOutput; k++) {
      const y = yRow[k];
      const p = Math.min(1 - EPS, Math.max(EPS, out[k]));
      lossSum += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
      // d(loss)/d(outPre) for sigmoid + BCE simplifies to (out - y)
      dOutPre[k] = out[k] - y;
    }

    // dW2/db2 + propagate into hidden
    const dHidden = new Array(nHidden).fill(0);
    for (let k = 0; k < nOutput; k++) {
      grads.b2[k] += dOutPre[k];
      const row = model.W2[k];
      const gRow = grads.W2[k];
      for (let j = 0; j < nHidden; j++) {
        gRow[j] += dOutPre[k] * hidden[j];
        dHidden[j] += dOutPre[k] * row[j];
      }
    }
    // tanh derivative
    for (let j = 0; j < nHidden; j++) {
      dHidden[j] *= (1 - hidden[j] * hidden[j]);
    }
    for (let j = 0; j < nHidden; j++) {
      grads.b1[j] += dHidden[j];
      const gRow = grads.W1[j];
      for (let i = 0; i < x.length; i++) {
        gRow[i] += dHidden[j] * x[i];
      }
    }
  }

  // average over batch
  if (n > 0) {
    for (let j = 0; j < grads.W1.length; j++) {
      for (let i = 0; i < grads.W1[j].length; i++) grads.W1[j][i] /= n;
      grads.b1[j] /= n;
    }
    for (let k = 0; k < grads.W2.length; k++) {
      for (let j = 0; j < grads.W2[k].length; j++) grads.W2[k][j] /= n;
      grads.b2[k] /= n;
    }
  }

  return { grads, loss: n > 0 ? lossSum / n : 0, n };
}

// Elementwise-average a list of { grads, loss, n } results from multiple
// workers into one { grads, loss } (loss is weighted by shard size n so
// uneven shard sizes are still a correct mean).
export function averageResults(results) {
  const valid = results.filter(Boolean);
  if (valid.length === 0) throw new Error('averageResults: no results to average');
  const first = valid[0].grads;
  const avg = {
    W1: first.W1.map((row) => row.map(() => 0)),
    b1: first.b1.map(() => 0),
    W2: first.W2.map((row) => row.map(() => 0)),
    b2: first.b2.map(() => 0),
  };
  let totalN = 0;
  let lossSum = 0;
  for (const r of valid) {
    const weight = r.n || 1;
    totalN += weight;
    lossSum += r.loss * weight;
    for (let j = 0; j < avg.W1.length; j++) {
      for (let i = 0; i < avg.W1[j].length; i++) avg.W1[j][i] += r.grads.W1[j][i] * weight;
      avg.b1[j] += r.grads.b1[j] * weight;
    }
    for (let k = 0; k < avg.W2.length; k++) {
      for (let j = 0; j < avg.W2[k].length; j++) avg.W2[k][j] += r.grads.W2[k][j] * weight;
      avg.b2[k] += r.grads.b2[k] * weight;
    }
  }
  if (totalN > 0) {
    for (let j = 0; j < avg.W1.length; j++) {
      for (let i = 0; i < avg.W1[j].length; i++) avg.W1[j][i] /= totalN;
      avg.b1[j] /= totalN;
    }
    for (let k = 0; k < avg.W2.length; k++) {
      for (let j = 0; j < avg.W2[k].length; j++) avg.W2[k][j] /= totalN;
      avg.b2[k] /= totalN;
    }
  }
  return { grads: avg, loss: totalN > 0 ? lossSum / totalN : 0 };
}

// Applies a (possibly averaged) gradient to a model with learning rate lr,
// returning a NEW model (does not mutate the input).
export function applyUpdate(model, grads, lr) {
  const next = cloneModel(model);
  for (let j = 0; j < next.W1.length; j++) {
    for (let i = 0; i < next.W1[j].length; i++) next.W1[j][i] -= lr * grads.W1[j][i];
    next.b1[j] -= lr * grads.b1[j];
  }
  for (let k = 0; k < next.W2.length; k++) {
    for (let j = 0; j < next.W2[k].length; j++) next.W2[k][j] -= lr * grads.W2[k][j];
    next.b2[k] -= lr * grads.b2[k];
  }
  return next;
}

export function predict(model, x) {
  return forward(model, x).out;
}
