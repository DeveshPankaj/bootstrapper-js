// mesh-client.js — thin wrapper around the WebRTC Chat app's "mesh bridge"
// (platform.host commands `webrtc.mesh.*`, see documentation/CLAUDE.md and the
// task brief). Responsible for: checking availability, listing workers, and
// sending/receiving JSON messages over the group's existing peer connections
// with a small chunk+reassemble layer so a caller never has to think about the
// ~50KB per-message ceiling.
//
// Deliberately takes `host` as a constructor argument (defaulting to
// window.platform.host) rather than reaching for the global directly, so a
// test can hand it a fully in-process fake host exposing the same
// getCommand()/registerCommand() surface — see
// testing/scripts/test-distributed-compute-mock-mesh.mjs.

const CHANNEL = 'distributed-compute';

// Keep well under the bridge's ~50KB guidance to leave room for JSON escaping
// overhead and the envelope fields themselves.
const MAX_CHUNK_CHARS = 40000;

// Reassembly limits (audit NET-13): chunks come from peers, so a message can't claim more than
// MAX_CHUNKS chunks, partial messages are keyed by the sender (a peer can only ever add chunks to
// its own messages), capped in number and total size — when full, the oldest partial goes (a peer
// over its own share only evicts its own) — and dropped when they go stale.
const MAX_CHUNKS = 64;                       // ≈ 2.5 MB per reassembled message
const MAX_PARTIALS = 32, MAX_PARTIALS_PER_PEER = 8;
const MAX_BUFFERED_CHARS = 8 * 1024 * 1024;  // across every partial message
const PARTIAL_TTL_MS = 60000;

function noopSub() { return { unsubscribe() {} }; }

export class MeshClient {
  constructor(host) {
    this.host = host || (typeof window !== 'undefined' && window.platform && window.platform.host) || null;
    // "gid\npeer\nmsgId" -> { chunks: string[], received, total, chars, peer, at }
    this._reassembly = new Map();
    this._bufferedChars = 0;
    this._subs = [];
  }

  _cmd(name) {
    if (!this.host || typeof this.host.getCommand !== 'function') return null;
    try { return this.host.getCommand(name) || null; } catch (_) { return null; }
  }

  isAvailable() {
    const cmd = this._cmd('webrtc.mesh.available');
    if (!cmd) return false;
    try { return !!cmd.exec(); } catch (_) { return false; }
  }

  myIdentity() {
    const cmd = this._cmd('webrtc.mesh.myId');
    if (!cmd) return null;
    try { return cmd.exec(); } catch (_) { return null; }
  }

  // -> [{ gid, name, members: [{ id, name, online }] }]
  groups() {
    const cmd = this._cmd('webrtc.mesh.groups');
    if (!cmd) return [];
    try { return cmd.exec() || []; } catch (_) { return []; }
  }

  // Sends one JSON-serializable `message` to everyone in group `gid`,
  // transparently splitting it across multiple mesh messages if it doesn't
  // fit in one. Returns the bridge's { ok, sentTo } | { ok:false, err }
  // (of the last chunk sent, or a synthetic failure if the bridge is missing).
  send(gid, message) {
    const cmd = this._cmd('webrtc.mesh.send');
    if (!cmd) return { ok: false, err: 'mesh bridge unavailable' };
    let str;
    try { str = JSON.stringify(message); } catch (e) {
      return { ok: false, err: 'message is not JSON-serializable: ' + e.message };
    }
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    if (str.length <= MAX_CHUNK_CHARS) {
      return cmd.exec(gid, CHANNEL, { id, seq: 0, total: 1, chunk: str });
    }
    const total = Math.ceil(str.length / MAX_CHUNK_CHARS);
    if (total > MAX_CHUNKS) return { ok: false, err: `message too large (${str.length} chars, max ${MAX_CHUNKS * MAX_CHUNK_CHARS})` };
    let last = { ok: false, err: 'no chunks sent' };
    for (let i = 0; i < total; i++) {
      const chunk = str.slice(i * MAX_CHUNK_CHARS, (i + 1) * MAX_CHUNK_CHARS);
      last = cmd.exec(gid, CHANNEL, { id, seq: i, total, chunk });
      if (last && last.ok === false) return last;
    }
    return last;
  }

  // Subscribes to fully reassembled distributed-compute messages.
  // handler(gid, fromPeerId, fromName, message)
  // Returns { unsubscribe() }.
  onMessage(handler) {
    const cmd = this._cmd('webrtc.mesh.subscribe');
    if (!cmd) return noopSub();
    const deliver = (gid, fromPeerId, fromName, text) => {
      let message;
      try { message = JSON.parse(text); } catch (_) { return; }
      handler(gid, fromPeerId, fromName, message);
    };
    const wrapped = (gid, fromPeerId, fromName, payload) => {
      if (!payload || typeof payload.id !== 'string' || !payload.id || payload.id.length > 64) return;
      const { total, seq, chunk } = payload;
      if (!Number.isInteger(total) || total < 1 || total > MAX_CHUNKS) return;
      if (!Number.isInteger(seq) || seq < 0 || seq >= total) return;
      if (typeof chunk !== 'string' || chunk.length > MAX_CHUNK_CHARS) return;
      if (total === 1) return deliver(gid, fromPeerId, fromName, chunk);
      this._expirePartials();
      const peer = `${gid}\n${fromPeerId}`;
      const key = `${peer}\n${payload.id}`;
      let entry = this._reassembly.get(key);
      if (!entry) {
        let fromPeer = 0;
        for (const e of this._reassembly.values()) if (e.peer === peer) fromPeer++;
        if (fromPeer >= MAX_PARTIALS_PER_PEER) this._evictOldest(peer);
        else if (this._reassembly.size >= MAX_PARTIALS) this._evictOldest(null);
        entry = { chunks: new Array(total), received: 0, total, chars: 0, peer, at: Date.now() };
        this._reassembly.set(key, entry);
      } else if (entry.total !== total) { this._dropPartial(key); return; }
      if (entry.chunks[seq] !== undefined) return;   // duplicate chunk
      while (this._bufferedChars + chunk.length > MAX_BUFFERED_CHARS && this._evictOldest(null, key));
      if (this._bufferedChars + chunk.length > MAX_BUFFERED_CHARS) { this._dropPartial(key); return; }
      entry.chunks[seq] = chunk;
      entry.received += 1;
      entry.chars += chunk.length;
      this._bufferedChars += chunk.length;
      if (entry.received === entry.total) {
        this._dropPartial(key);
        deliver(gid, fromPeerId, fromName, entry.chunks.join(''));
      }
    };
    const sub = cmd.exec(CHANNEL, wrapped) || noopSub();
    this._subs.push(sub);
    return sub;
  }

  _dropPartial(key) {
    const e = this._reassembly.get(key);
    if (!e) return;
    this._reassembly.delete(key);
    this._bufferedChars -= e.chars;
  }

  // Drops the oldest partial message (of `peer` only, when given; never `keep`). Returns
  // whether one was dropped.
  _evictOldest(peer, keep) {
    let oldestKey = null, oldestAt = Infinity;
    for (const [k, e] of this._reassembly) if (k !== keep && (!peer || e.peer === peer) && e.at < oldestAt) { oldestKey = k; oldestAt = e.at; }
    if (oldestKey === null) return false;
    this._dropPartial(oldestKey);
    return true;
  }

  _expirePartials(now = Date.now()) {
    for (const [key, e] of this._reassembly) if (now - e.at > PARTIAL_TTL_MS) this._dropPartial(key);
  }

  dispose() {
    for (const s of this._subs) { try { s && s.unsubscribe && s.unsubscribe(); } catch (_) {} }
    this._subs = [];
    this._reassembly.clear();
    this._bufferedChars = 0;
  }
}

export const CHANNEL_NAME = CHANNEL;
