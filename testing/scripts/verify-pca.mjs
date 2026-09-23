// Standalone correctness check for the hand-rolled PCA (power iteration +
// Hotelling deflation) before it's pasted into model-builder/main.html.
function computeMean(vectors, dims) {
  const mean = new Float64Array(dims);
  for (const v of vectors) for (let i = 0; i < dims; i++) mean[i] += v[i];
  for (let i = 0; i < dims; i++) mean[i] /= vectors.length;
  return mean;
}
function computeCovariance(vectors, mean, dims) {
  const cov = Array.from({ length: dims }, () => new Float64Array(dims));
  for (const v of vectors) {
    for (let i = 0; i < dims; i++) {
      const di = v[i] - mean[i];
      for (let j = 0; j < dims; j++) cov[i][j] += di * (v[j] - mean[j]);
    }
  }
  const n = vectors.length - 1 || 1;
  for (let i = 0; i < dims; i++) for (let j = 0; j < dims; j++) cov[i][j] /= n;
  return cov;
}
function matVec(mat, vec, dims) {
  const out = new Float64Array(dims);
  for (let i = 0; i < dims; i++) { let s = 0; for (let j = 0; j < dims; j++) s += mat[i][j] * vec[j]; out[i] = s; }
  return out;
}
function normalizeVec(v) {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return Array.from(v, x => x / norm);
}
function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
function powerIteration(mat, dims, iterations) {
  let v = normalizeVec(Array.from({ length: dims }, () => Math.random()));
  for (let it = 0; it < iterations; it++) v = normalizeVec(matVec(mat, v, dims));
  const value = dot(v, matVec(mat, v, dims));
  return { vector: v, value };
}
function topKEigenvectors(cov, dims, k, iterations = 200) {
  let mat = cov.map(row => Float64Array.from(row));
  const components = [];
  for (let c = 0; c < k; c++) {
    const { vector, value } = powerIteration(mat, dims, iterations);
    components.push({ vector, value });
    for (let i = 0; i < dims; i++) for (let j = 0; j < dims; j++) mat[i][j] -= value * vector[i] * vector[j];
  }
  return components;
}

// --- Test 1: orthogonality + decreasing eigenvalues on random real-ish data ---
const DIMS = 6;
const N = 300;
const vectors = Array.from({ length: N }, () => {
  const t = Math.random() * 2 - 1;
  const s = Math.random() * 2 - 1;
  return [10 * t, 5 * s, t + s * 0.3, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1];
});
const mean = computeMean(vectors, DIMS);
const cov = computeCovariance(vectors, mean, DIMS);
const comps = topKEigenvectors(cov, DIMS, 3);

console.log('Eigenvalues (should be decreasing):', comps.map(c => c.value.toFixed(4)));
const decreasing = comps[0].value >= comps[1].value - 1e-6 && comps[1].value >= comps[2].value - 1e-6;
console.log('Decreasing order:', decreasing);

console.log('Component norms (should all be ~1):', comps.map(c => Math.sqrt(dot(c.vector, c.vector)).toFixed(4)));

let maxOffDiag = 0;
for (let i = 0; i < comps.length; i++) {
  for (let j = i + 1; j < comps.length; j++) {
    maxOffDiag = Math.max(maxOffDiag, Math.abs(dot(comps[i].vector, comps[j].vector)));
  }
}
console.log('Max pairwise dot product (should be ~0, orthogonal):', maxOffDiag.toFixed(6));

// The first synthetic dimension (10*t) has by far the largest spread — the
// first principal component should load heavily on dims 0 (and somewhat 1),
// confirming it actually found the direction of maximum variance.
console.log('First component loadings (dim0 should dominate):', comps[0].vector.map(v => v.toFixed(3)));

const pass = decreasing && maxOffDiag < 1e-3 && Math.abs(comps[0].vector[0]) > 0.8;
console.log(pass ? '\nPASS' : '\nFAIL');
process.exit(pass ? 0 : 1);
