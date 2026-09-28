// examples/map-reduce-demo.js — the first, simple proof-of-plumbing example:
// distributed sum-of-squares over chunks of a number range.
//
// `source` is the DEFAULT TEXT loaded into the app's code editor. It is run
// exactly once locally (via task-runtime's runTask, same discipline as any
// other task source — size-capped `new Function`) to produce a plain "job
// descriptor" object:
//   {
//     data: number[],          // the full dataset, generated locally
//     chunkSize: number,       // how many elements per chunk/worker
//     mapTaskSource: string,   // sent to (and run on) each worker for its chunk
//     combineTaskSource: string, // run once locally over all chunk results
//   }
// The app splits `data` into chunks of `chunkSize` and feeds mapTaskSource /
// combineTaskSource straight into the Scheduler.

export const MAP_REDUCE_EXAMPLE = {
  id: 'map-reduce-demo',
  name: 'Sum of squares (map/reduce demo)',
  description: 'Splits a range of numbers into chunks, computes sum-of-squares per chunk on each worker, and adds the partial sums back together. Proves the chunk/dispatch/combine plumbing works before the neural-net example.',
  source: `// Distributed sum-of-squares demo.
// Edit freely -- this whole object is re-read every time you click Run.
return {
  // The full dataset. Generated locally; only individual chunks are sent to workers.
  data: Array.from({ length: 400 }, (_, i) => i),

  // How many numbers each worker gets in one chunk.
  chunkSize: 40,

  // Runs on a worker (possibly a remote peer) for exactly one chunk.
  // args = { chunk: number[] }  ->  return a number (partial sum of squares).
  mapTaskSource: \`
    const { chunk } = args;
    let sum = 0;
    for (const x of chunk) sum += x * x;
    return sum;
  \`,

  // Runs once locally after every chunk has a result.
  // args = { results: number[] } (one partial sum per chunk, in chunk order).
  combineTaskSource: \`
    const { results } = args;
    return results.reduce((a, b) => a + b, 0);
  \`,
};
`,
};
