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

function noopSub() { return { unsubscribe() {} }; }

export class MeshClient {
  constructor(host) {
    this.host = host || (typeof window !== 'undefined' && window.platform && window.platform.host) || null;
    // msgId -> { chunks: string[], received: number, total: number }
    this._reassembly = new Map();
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
    const wrapped = (gid, fromPeerId, fromName, payload) => {
      if (!payload || typeof payload.id !== 'string' || typeof payload.total !== 'number') return;
      let entry = this._reassembly.get(payload.id);
      if (!entry) {
        entry = { chunks: new Array(payload.total), received: 0 };
        this._reassembly.set(payload.id, entry);
      }
      if (entry.chunks[payload.seq] === undefined) entry.received += 1;
      entry.chunks[payload.seq] = payload.chunk;
      if (entry.received >= payload.total) {
        this._reassembly.delete(payload.id);
        let message;
        try { message = JSON.parse(entry.chunks.join('')); } catch (_) { return; }
        handler(gid, fromPeerId, fromName, message);
      }
    };
    const sub = cmd.exec(CHANNEL, wrapped) || noopSub();
    this._subs.push(sub);
    return sub;
  }

  dispose() {
    for (const s of this._subs) { try { s && s.unsubscribe && s.unsubscribe(); } catch (_) {} }
    this._subs = [];
    this._reassembly.clear();
  }
}

export const CHANNEL_NAME = CHANNEL;
