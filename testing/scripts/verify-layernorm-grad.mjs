// Standalone finite-difference check of the LayerNorm forward/backward math
// before it's pasted into model-builder/main.html's hand-rolled backprop engine.
const EPS = 1e-5;

function normForward(input, gamma, beta) {
  const n = input.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += input[i];
  mean /= n;
  let variance = 0;
  for (let i = 0; i < n; i++) { const d = input[i] - mean; variance += d * d; }
  variance /= n;
  const invStd = 1 / Math.sqrt(variance + EPS);
  const normalized = new Float64Array(n);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    normalized[i] = (input[i] - mean) * invStd;
    out[i] = normalized[i] * gamma[i] + beta[i];
  }
  return { out, cache: { normalized, invStd, n } };
}

function normBackward(cache, dOut, gamma) {
  const { normalized, invStd, n } = cache;
  const dGamma = new Float64Array(n), dBeta = new Float64Array(n);
  const dxhat = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    dGamma[i] = dOut[i] * normalized[i];
    dBeta[i] = dOut[i];
    dxhat[i] = dOut[i] * gamma[i];
  }
  let sumDxhat = 0, sumDxhatXhat = 0;
  for (let i = 0; i < n; i++) { sumDxhat += dxhat[i]; sumDxhatXhat += dxhat[i] * normalized[i]; }
  const dInput = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    dInput[i] = (invStd / n) * (n * dxhat[i] - sumDxhat - normalized[i] * sumDxhatXhat);
  }
  return { dInput, dGamma, dBeta };
}

function randArr(n) { return Array.from({ length: n }, () => Math.random() * 2 - 1); }

function lossOf(out) {
  // Arbitrary scalar loss, e.g. weighted sum, so dLoss/dOut_i = weight_i (fixed random weights)
  let s = 0;
  for (let i = 0; i < out.length; i++) s += out[i] * LOSS_WEIGHTS[i];
  return s;
}

const N = 6;
const input = randArr(N);
const gamma = randArr(N).map(v => v + 1.5); // avoid near-zero gamma
const beta = randArr(N);
const LOSS_WEIGHTS = randArr(N);

const { out, cache } = normForward(input, gamma, beta);
const dOut = Float64Array.from(LOSS_WEIGHTS); // dLoss/dOut_i = weight_i since loss is linear in out
const { dInput, dGamma, dBeta } = normBackward(cache, dOut, gamma);

const h = 1e-6;
function numGrad(paramArr, idx, forwardFn) {
  const orig = paramArr[idx];
  paramArr[idx] = orig + h;
  const plus = lossOf(forwardFn().out);
  paramArr[idx] = orig - h;
  const minus = lossOf(forwardFn().out);
  paramArr[idx] = orig;
  return (plus - minus) / (2 * h);
}

console.log('=== dInput check ===');
let maxErrInput = 0;
for (let i = 0; i < N; i++) {
  const numerical = numGrad(input, i, () => normForward(input, gamma, beta));
  const analytical = dInput[i];
  const err = Math.abs(numerical - analytical);
  maxErrInput = Math.max(maxErrInput, err);
  console.log(`i=${i} numerical=${numerical.toFixed(6)} analytical=${analytical.toFixed(6)} err=${err.toExponential(2)}`);
}
console.log('max dInput error:', maxErrInput);

console.log('=== dGamma check ===');
let maxErrGamma = 0;
for (let i = 0; i < N; i++) {
  const numerical = numGrad(gamma, i, () => normForward(input, gamma, beta));
  const analytical = dGamma[i];
  const err = Math.abs(numerical - analytical);
  maxErrGamma = Math.max(maxErrGamma, err);
}
console.log('max dGamma error:', maxErrGamma);

console.log('=== dBeta check ===');
let maxErrBeta = 0;
for (let i = 0; i < N; i++) {
  const numerical = numGrad(beta, i, () => normForward(input, gamma, beta));
  const analytical = dBeta[i];
  const err = Math.abs(numerical - analytical);
  maxErrBeta = Math.max(maxErrBeta, err);
}
console.log('max dBeta error:', maxErrBeta);

const PASS = maxErrInput < 1e-4 && maxErrGamma < 1e-4 && maxErrBeta < 1e-4;
console.log(PASS ? '\nPASS: gradients match numerical finite-difference within tolerance.' : '\nFAIL: gradient mismatch, formula is wrong.');
process.exit(PASS ? 0 : 1);
