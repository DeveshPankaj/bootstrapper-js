// lib/kv-store.js — pure, DOM- and mesh-free replicated key/value store logic.
// No dependency on the mesh bridge, the DOM, or window.platform at all, so it can be
// imported and unit-tested directly in plain Node — see
// testing/scripts/test-distributed-kv-store-unit.mjs.
//
// Conflict policy: LAST-WRITE-WINS. Every value is wrapped in an entry:
//   { value, ts, peerId, deleted }
// `ts` is a per-writer logical clock nudged by wall time (see `nextTs()`: it's
// max(Date.now(), lastTs + 1)) so two local writes issued back-to-back always get
// strictly increasing timestamps even if they land in the same millisecond
// (Date.now() resolution). Two entries competing for the same key are ordered by the
// tuple (ts, peerId) via `compareEntries` below: a higher ts always wins; if ts ties
// (a genuine simultaneous write from two different peers), the lexicographically
// larger peerId wins. Both halves of that rule are pure functions of the two entries
// being compared — never of arrival order — so every peer that has seen the same set
// of entries converges on the exact same winner, regardless of the order messages
// happened to arrive in.
//
// Deletes are tombstones (`deleted: true`, value cleared) rather than removed
// entries, so a late-arriving stale `set` can still correctly lose to an already-seen
// delete under the same rule, and setting the key again later works like any other
// fresh write.

// Pure comparison: returns >0 if entry `a` should win over `b`, <0 if `b` wins, 0 if
// they are identical writes. Exported standalone (not just as a class method) so the
// LWW rule itself is directly unit-testable without constructing a whole store.
export function compareEntries(a, b) {
  if (a.ts !== b.ts) return a.ts - b.ts;
  if (a.peerId === b.peerId) return 0;
  return a.peerId > b.peerId ? 1 : -1;
}

// Given two entries (either may be null/undefined) for the same key, returns the one
// that should win. A pure, order-independent helper used by both KVStore.applyEntry
// and directly by unit tests.
export function pickWinner(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return compareEntries(a, b) >= 0 ? a : b;
}

export class KVStore {
  // `peerId` is NOT fixed at construction time on purpose: a caller's mesh identity
  // may not be known yet when the store is first created (e.g. the app opened before
  // WebRTC finished connecting), so `set`/`delete` below take the writer's peerId as
  // an explicit per-call argument instead of trusting a value captured once at
  // startup, which would otherwise silently go stale.
  constructor() {
    this.entries = new Map(); // key -> { value, ts, peerId, deleted }
    this.lastTs = 0;
    this.listeners = new Set();
  }

  // Monotonically increasing per-writer logical timestamp ("HLC-lite": logical clock
  // nudged forward by wall-clock time whenever it has actually advanced).
  nextTs() {
    this.lastTs = Math.max(Date.now(), this.lastTs + 1);
    return this.lastTs;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _notify() {
    for (const fn of this.listeners) {
      try { fn(); } catch (_) {}
    }
  }

  // Applies a remote (or local) entry to `key` using the LWW rule. Returns true if
  // the entry was accepted (i.e. state actually changed) — false for a stale/no-op
  // write, so callers (mesh handlers, VFS mirrors) can skip redundant work.
  applyEntry(key, entry) {
    if (!key || typeof key !== 'string') return false;
    if (!entry || typeof entry.ts !== 'number' || typeof entry.peerId !== 'string') return false;
    const current = this.entries.get(key) || null;
    const winner = pickWinner(current, entry);
    if (winner !== entry || winner === current) return false;
    this.entries.set(key, {
      value: entry.deleted ? null : entry.value,
      ts: entry.ts,
      peerId: entry.peerId,
      deleted: !!entry.deleted,
    });
    if (this.lastTs < entry.ts) this.lastTs = entry.ts;
    this._notify();
    return true;
  }

  // Local write helpers — build a fresh entry with a new local timestamp, apply it
  // immediately, and return the entry so the caller can broadcast it over the mesh.
  set(key, value, peerId) {
    const entry = { value, ts: this.nextTs(), peerId: peerId || 'local', deleted: false };
    this.applyEntry(key, entry);
    return entry;
  }

  delete(key, peerId) {
    const entry = { value: null, ts: this.nextTs(), peerId: peerId || 'local', deleted: true };
    this.applyEntry(key, entry);
    return entry;
  }

  get(key) {
    const e = this.entries.get(key);
    return (e && !e.deleted) ? e.value : undefined;
  }

  has(key) {
    const e = this.entries.get(key);
    return !!e && !e.deleted;
  }

  // { key: value } for every non-tombstoned entry — the shape the UI/tests want.
  all() {
    const out = {};
    for (const [k, e] of this.entries) if (!e.deleted) out[k] = e.value;
    return out;
  }

  // Full rows (incl. metadata) for non-tombstoned entries, sorted by key, for the UI.
  visible() {
    const out = [];
    for (const [key, e] of this.entries) if (!e.deleted) out.push({ key, ...e });
    out.sort((a, b) => a.key.localeCompare(b.key));
    return out;
  }

  isEmpty() {
    return this.visible().length === 0;
  }

  // Full state including tombstones — sent to a late joiner (or anyone requesting a
  // sync) so deletes replicate correctly too, not just live values.
  snapshot() {
    const out = {};
    for (const [k, e] of this.entries) out[k] = e;
    return out;
  }

  // Merges a snapshot received from a peer (e.g. a late-joiner catch-up response).
  // Returns true if anything actually changed.
  mergeSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    let changed = false;
    for (const [key, entry] of Object.entries(snapshot)) {
      if (this.applyEntry(key, entry)) changed = true;
    }
    return changed;
  }
}
