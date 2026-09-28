// Pure unit test of the replication/merge logic in lib/kv-store.js, no browser needed.
// Simulates two independent KVStore instances (two "peers") exchanging entries
// directly in-process, to validate: set replication, delete replication, late-joiner
// snapshot catch-up, and deterministic LWW conflict resolution (same key, two
// different timestamps -> converges regardless of arrival order; identical
// timestamps -> tie-broken deterministically by peerId so every peer lands on the
// same winner) -- before wiring any of it through the real (or mocked) mesh bridge /
// Playwright.
import { KVStore, compareEntries, pickWinner } from '../../docs/public/mount/opt/apps/distributed-kv/lib/kv-store.js';

let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${x ? '  — ' + x : ''}`); if (!ok) failed++; };

// --- pure compareEntries/pickWinner, no store involved at all ---
{
  const older = { value: 'first', ts: 100, peerId: 'peer-a', deleted: false };
  const newer = { value: 'second', ts: 200, peerId: 'peer-b', deleted: false };
  check('compareEntries: higher ts wins', compareEntries(newer, older) > 0 && compareEntries(older, newer) < 0);
  check('pickWinner picks the higher-ts entry regardless of argument order', pickWinner(older, newer) === newer && pickWinner(newer, older) === newer);

  const fromAlice = { value: 'alice-wins?', ts: 500, peerId: 'peer-alice', deleted: false };
  const fromZoe = { value: 'zoe-wins?', ts: 500, peerId: 'peer-zoe', deleted: false };
  check('compareEntries: identical ts tie-breaks by peerId (lexicographically larger wins)', compareEntries(fromZoe, fromAlice) > 0);
  check('pickWinner on a same-ts tie converges to the identical winner regardless of argument order', pickWinner(fromAlice, fromZoe) === fromZoe && pickWinner(fromZoe, fromAlice) === fromZoe);
  check('pickWinner(null, x) returns x', pickWinner(null, fromZoe) === fromZoe);
  check('pickWinner(x, null) returns x', pickWinner(fromZoe, null) === fromZoe);
}

// --- basic set + replicate ---
{
  const a = new KVStore();
  const b = new KVStore();
  const entry = a.set('color', 'blue', 'peer-a');
  b.applyEntry('color', entry);
  check('set on A replicates to B', b.visible().length === 1 && b.visible()[0].value === 'blue');
}

// --- delete + replicate (tombstone) ---
{
  const a = new KVStore();
  const b = new KVStore();
  const setEntry = a.set('temp', 42, 'peer-a');
  b.applyEntry('temp', setEntry);
  const delEntry = a.delete('temp', 'peer-a');
  b.applyEntry('temp', delEntry);
  check('delete on A replicates to B (key no longer visible)', b.visible().length === 0);
  check('B still has a tombstone internally (not just silently dropped)', b.entries.get('temp')?.deleted === true);
}

// --- late joiner catch-up via snapshot ---
{
  const a = new KVStore();
  a.set('x', 1, 'peer-a');
  a.set('y', 2, 'peer-a');
  a.delete('y', 'peer-a');
  const c = new KVStore(); // late joiner, empty
  const changed = c.mergeSnapshot(a.snapshot());
  check('late joiner merge reports a change', changed === true);
  check('late joiner ends up with the same visible entries as the existing peer', JSON.stringify(c.visible().map(e => e.key)) === JSON.stringify(a.visible().map(e => e.key)));
  check('late joiner correctly omits the tombstoned key from visible entries', !c.visible().some(e => e.key === 'y'));
}

// --- conflict resolution: higher ts wins regardless of arrival order (convergence) ---
{
  const a = new KVStore();
  const b = new KVStore();
  const older = { value: 'first', ts: 100, peerId: 'peer-a', deleted: false };
  const newer = { value: 'second', ts: 200, peerId: 'peer-b', deleted: false };
  // A sees them in order; B sees them out of order (newer arrives first)
  a.applyEntry('k', older);
  a.applyEntry('k', newer);
  b.applyEntry('k', newer);
  b.applyEntry('k', older); // must be rejected — ts 100 < 200
  check('newer ts wins when applied in order', a.get('k') === 'second');
  check('newer ts wins even when the older entry arrives AFTER it (order-independent convergence)', b.get('k') === 'second');
  check('both peers converge to the identical value', a.get('k') === b.get('k'));
}

// --- conflict resolution: same ts (concurrent write), peerId tie-break, deterministic on both sides ---
{
  const a = new KVStore();
  const b = new KVStore();
  const fromAlice = { value: 'alice-wins?', ts: 500, peerId: 'peer-alice', deleted: false };
  const fromZoe = { value: 'zoe-wins?', ts: 500, peerId: 'peer-zoe', deleted: false };
  // Apply in different orders on the two stores — result must still match (peer-zoe > peer-alice lexicographically)
  a.applyEntry('conflict-key', fromAlice);
  a.applyEntry('conflict-key', fromZoe);
  b.applyEntry('conflict-key', fromZoe);
  b.applyEntry('conflict-key', fromAlice);
  check('same-ts conflict resolves to the same winner regardless of application order', a.get('conflict-key') === b.get('conflict-key'));
  check('winner is the lexicographically larger peerId ("peer-zoe" > "peer-alice")', a.get('conflict-key') === 'zoe-wins?');
}

// --- nextTs monotonicity within the same store (HLC-lite) ---
{
  const a = new KVStore();
  const e1 = a.set('k1', 'v1', 'peer-a');
  const e2 = a.set('k2', 'v2', 'peer-a');
  check('nextTs is strictly increasing even for rapid successive local writes', e2.ts > e1.ts);
}

// --- a stale re-application of an already-applied entry is a no-op (idempotent merge) ---
{
  const a = new KVStore();
  const entry = a.set('idem', 'v', 'peer-a');
  const changedAgain = a.applyEntry('idem', entry);
  check('re-applying the exact same entry reports no change (idempotent)', changedAgain === false);
}

// --- writer identity isn't baked into the store at construction time (see comment in
//     lib/kv-store.js) — the same store can accept writes tagged with different peerIds
//     over its lifetime, e.g. a fallback local id before the mesh identity resolves,
//     then the real peer id afterward, without needing to be recreated. ---
{
  const a = new KVStore();
  a.set('k', 'v1', 'local-tmp');
  const laterEntry = a.set('k', 'v2', 'real-peer-id');
  check('store accepts a later write tagged with a different peerId than an earlier write', a.get('k') === 'v2' && laterEntry.peerId === 'real-peer-id');
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
