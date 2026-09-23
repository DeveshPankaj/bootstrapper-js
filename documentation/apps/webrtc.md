# WebRTC Chat

Serverless peer-to-peer chat between browsers, with groups, direct messages, file transfer and VFS
folder sharing. Files: `docs/public/mount/opt/apps/webrtc/{main.js,main.html}`, CLI `/bin/webrtc.run`.

## Connecting (no server, no accounts)

Signaling is manual: an **invite link** (offer) is sent to a friend, who sends back an **answer link**.

1. **Invite** → enter your name → *Generate invite link* → *Copy*. One link per person; generate as many
   as you like, also while others are already connected.
2. The friend opens the link (a new tab boots the OS and opens the app on the *Join* tab), picks a name,
   *Generate answer link*, and sends it back.
3. Open the answer link in your browser — if the app is already open in another tab the link is handed to
   that tab (`BroadcastChannel`), the new tab shows "Opened in your other tab". Or paste it in the card's
   *Accept answer* box, or *Join / paste link*.

Links look like `https://host/path/#open=ui.webrtc&app=webrtc&arg=wrtc1.<deflate+base64url SDP>`; the hash is
never sent to a web server. Default ICE: Google + Cloudflare STUN.

### STUN vs TURN (when people can't join)

STUN only discovers your public address; it works for most home routers but **not** behind carrier-grade /
symmetric NAT (mobile data, many ISPs) or networks that block UDP — there you need a **TURN** relay.
Settings → *Connection servers*: add `turn:host:3478?transport=udp` (or `turns:host:443` for TLS, best
through firewalls) with username/password, *Test servers* shows how many local / public (STUN) / relay (TURN)
addresses were found, and *Always use the TURN relay* forces relay-only (also hides your IP). Both sides
should be able to reach the TURN server. Invite/answer cards show a warning when no public or relay address
was found. Credentials stay in `~/.local/share/webrtc/settings.json` and are never put in links. CLI:
`webrtc ice [add|rm|relay|test]`. Get a TURN server by self-hosting coturn or using a provider.

## Mesh

When *Connect me to everyone in the room* is on (default), members are introduced to each other and connect
directly (signaling is relayed over existing links, one hop; the smaller id dials). Connections are
identified by the channel they arrived on, never by a claimed id in a message.

## Chat

Two attach buttons in the composer: the paperclip picks a file from the local device; the
folder icon picks a file from the VFS (browse/traverse, then pick — same crumbs UI as the
folder-share pickers). Both go through the same transfer path, so progress, size caps and image
previews behave identically either way. CLI: `webrtc sendfile <everyone|@user|#group> <vfs-path>`.

Every received (or sent) file/image offers two actions once it's fully transferred: **download to
this device** (the usual browser download) and **save to Files** (writes it into the VFS, via the
same folder picker used elsewhere in the app).

Muting a peer (`access <user> chat|files off`) also tells them: their composer disables itself
with a reason ("X has turned off messages from you") the moment they're told, instead of letting
them keep typing into a conversation that silently drops everything.

Conversations: **Everyone**, **direct** (one per person), **groups** (created by picking connected people;
only the creator can add/remove; anyone can leave). Files up to 100 MB (drag & drop, paste, paperclip);
images (png/jpeg/gif/webp/bmp/avif/svg) show an inline preview with a lightbox. Everything else is a download card.

## Shared VFS folders

*Folders → Share a folder*. A share has a **ceiling** (read-only or read & write) and **per-person grants**
(none / read only / read & write). Effective access = the stricter of the two; default is no access.
Owner-side checks on every request: grant lookup, path normalisation (no `..`), no symlink hops, size limits,
uploads pre-approved with fixed path/size, activity log. Grants last for the session (they are per connection).
Remote users browse via *Permissions → Browse* / *Folders → Browse*.

## Mounting a remote folder (edit directly with the normal file explorer)

*Permissions* (per person) or *Folders → Shared with you* now has a **Mount** button next to any
folder a peer shares with you (once they grant access). Mounting grafts it into the real virtual
filesystem at `/mnt/webrtc/<peer>-<share>` — after that, the folder is just a folder: open it with
Files, edit a file with Notepad, `ls`/`cat` it from the terminal, or drag files into it. No
WebRTC-specific UI is needed once it's mounted.

Under the hood this is a live *clone*, not a lazy passthrough — every vfs call in this OS is
synchronous, but a remote read/write is an async round trip, so the whole tree is fetched into a
real, synchronous, in-memory filesystem backend (`FS.createBackend('InMemory', {})`, grafted in
via a new `FS.mount(path, backend)` added in `src/kernel/vfs.ts`), then reconciled with the peer
every ~1.5s: local edits are pushed, remote changes are pulled, size+mtime decide what changed
(the same heuristic rsync defaults to). It is not instantaneous, and a local edit always wins over
a conflicting concurrent remote edit to the same file. A read-only share is mounted behind a
differential-inheritance wrapper (`Object.create(realBackend)` with the mutating methods
overridden to throw `EROFS`) so a save fails immediately in the editor, instead of silently being
dropped on the next sync pass. Unmounting (or closing the WebRTC window) removes it instantly.
A read-only, stateless JSON summary of active mounts is kept at `/proc/<pid>/webrtc-mounts.json`
(the pid of the WebRTC window itself — the live peer connections can only exist in that page, so
there is no separate mount process to hand them to).

## Listen Together (groups only)

A group's header shows a "Listen together" button. Pick a track — from the VFS or upload it from
this device — and it's pushed (over the normal chunked transfer) to everyone currently online in
the group; a "now playing" strip appears in the header for all of them once it arrives, with
play/pause, a click-to-seek bar, a per-user mute (local only — muting for yourself doesn't affect
anyone else), and "stop for everyone". Anyone in the group can play/pause/seek, not just whoever
started it.

Playback is kept in sync with a small periodic clock message (`{status, posMs, epochMs}` — "at
posMs as of epochMs, still advancing if playing") rather than a live stream, so it tolerates the
same peer-to-peer realities as everything else here (no server, connections can drop): a session
just needs one still-connected member to keep going, and any member can nudge everyone back in
sync by pressing play, pause or seeking. This clock-message shape is intended to carry over to a
future live voice-chat feature in this app (swapping the file-backed player for a live audio
stream, keeping the same "who's in sync with whom" plumbing).

CLI: `webrtc listen <#group> <vfs-path>`, `webrtc listen-stop <#group>`.

Known limitation: a member who joins the group *after* a session has started doesn't automatically
get the track — they'd need it restarted.

## Whiteboard (groups only)

A group's header has a **Whiteboard** button. It opens a shared canvas everyone in the group
draws on together in real time: **Pen** (with a color swatch and size slider), **Eraser** (a real
destination-out erase, not a white-colored pen), **Undo** (removes only *your own* last stroke —
authenticated by the connection it arrives on, so nobody can undo someone else's work), **Download
PNG** (to this device) and **Save to Files** (VFS).

Everyone's live cursor is shown as a small colored badge with their name initial (and full name on
hover-adjacent label), tinted the same way avatars are elsewhere in the app. Drawing is a flat,
append-only list of strokes per group, kept in memory for as long as that group's page session
lasts — it isn't tied to whether the whiteboard modal is open (strokes from others still arrive and
get recorded while it's closed, so reopening replays them instantly), and a member who opens the
board for the first time (e.g. just joined the group) asks around for a copy of the existing
drawing before starting blank.

CLI: none — this one's UI-only.

## CLI (`webrtc help`)

The running app registers `webrtc.api`; `/bin/webrtc.run` forwards to it.

```
webrtc users                       webrtc kick <user> [--ban]
webrtc access <user> chat|files on|off
webrtc grant <user> <share> [ro|rw]  webrtc revoke <user> <share>
webrtc shares | share add <path> [name] [ro|rw] | share rm <share> | share mode <share> ro|rw
webrtc groups | name <new name>
webrtc chats | messages <everyone|@user|#group> [n] | say <everyone|@user|#group> <text>
webrtc invite [name] | join <link> [name] | answer <link>
webrtc mount <user> <share> [--ro] | mounts | unmount <mount> | sync <mount>
webrtc listen <#group> <vfs-path> | listen-stop <#group>
webrtc ice | ice add <url> [user] [pass] | ice rm <n> | ice relay on|off | ice test
```

## Testing

`node testing/scripts/test-webrtc-e2e.mjs` (needs `webpack serve --port 8103`): three isolated browser
contexts; covers links, handoff, mesh, chat/DM/group, file + image, VFS ro/rw/traversal, CLI.
`node testing/scripts/test-webrtc-turn.mjs` additionally needs a local TURN server (see the script header) and
verifies connect + chat + file over a relay-only path between two instances.
`node testing/scripts/test-webrtc-mount.mjs` covers `FS.mount`/`createBackend`/`umount`, cloning, editing via
the real file explorer + notepad, bidirectional sync (including new/changed/deleted paths in both
directions), ro enforcement, and the CLI.
`node testing/scripts/test-webrtc-refresh-mute.mjs` covers live progress/completion rendering without
switching chats, the muted-peer composer notice, sending a file picked from the VFS, and the
download-to-device / save-to-Files pair on received files and images.
`node testing/scripts/test-webrtc-listen.mjs` covers a 3-person group Listen Together session: track
delivery, synced play/pause/seek initiated by a non-originator, per-user local mute isolation, and
stop-for-everyone.
`node testing/scripts/test-webrtc-whiteboard.mjs` covers live cross-peer drawing (incl. the actual
painted canvas pixels, not just state), eraser compositing, per-author undo (and that it propagates
without touching the other author's strokes), a late joiner getting caught up via sync request, and
both save paths.
Known gap: symlink hardening isn't exercised — the mounted BrowserFS returns ENOTSUP for `symlinkSync`.
