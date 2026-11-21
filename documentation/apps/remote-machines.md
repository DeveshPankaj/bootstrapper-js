# Remote Machines

Machines reached over SSH, through a small bridge on your computer: saved connections, terminals on
the machine or inside its LXD / Incus containers, and a file browser that copies to and from the VFS.
Files: `docs/public/mount/opt/apps/remote-machines/{main.js,main.html}`, command `ui.remote-machines`
(a core app, loaded by `pkg-manager/loader.js`). Ported from ts-playground's Containers page, Terminal
and Explorer (SSH part).

## The bridge

A browser can't open SSH connections, so the app talks to the **workspace-ssh bridge** — ts-playground's
`bridge/` (`node bridge/main.ts`), or its download `bridge.mjs`. It runs no agent on the machines and
writes nothing there.

```sh
node bridge.mjs                                                  # http://localhost:7090, localhost sites allowed
node bridge.mjs --host 0.0.0.0 --origin https://you.github.io    # a bridge on another machine (prints a token)
```

**Getting it:** the app offers it for download — on the first screen while no bridge answers, and in
*Bridge* settings: `bridge.mjs` (one self-contained file, Node.js 20+, `node bridge.mjs`) or
`workspace-ssh-bridge.zip` (the same file with `start.sh` / `start.cmd` and a README), with the version
and SHA-256 (click to copy). They are served with the site from `docs/public/downloads/remote-machines/`
(not part of the VFS / `meta.json`, so they aren't fetched at boot), described by its `manifest.json`;
when the running bridge is older than that version, the app marks it *update*. They are copies of
ts-playground's build — to refresh: `node scripts/build-downloads.ts` there, then copy `bridge.mjs` (out
of the zip) and the zip here and update the sizes and SHA-256 in the manifest.

*Bridge* (top left) sets its address and token, and **Test** shows whether it runs and whether it
allows this site (`/health` → `originAllowed`). From an https site the bridge must be https too
(browsers block `ws://` from https pages), e.g. behind a reverse proxy.

Protocol (one WebSocket per machine, `<bridge>/rpc`): the first message is the login
`{type:'ssh', host, port, username, password | privateKey + passphrase | useAgent, hostKey, root, bridgeToken?}`;
the bridge answers `ready` (machine info), `prompt` (keyboard-interactive questions, answered with
`{type:'answers'}`) or `error` (`host-key-unknown`, `host-key-changed`, `auth-failed`, `bridge-token`,
`connect-failed`). Then JSON-RPC `{id, method, params}` → `{id, result | error}` and pushed
`{event, data}`. Used here: `fs.list/read/readChunk/write/mkdir/remove/rename`,
`term.open/write/resize/close` (events `term.data`, `term.exit`), `exec.run` (events `exec.output`,
`exec.exit`).

## Connections

**+** next to *Machines* adds one: `user@host`, port, sign-in (password, private key + passphrase, or
the SSH agent of the bridge's computer), and the folder the file browser shows (`/` for the whole
disk; paths outside it are refused by the bridge). The pencil edits it, the bin removes it.

- **Host keys** are confirmed on first contact (fingerprint shown) and kept per `host:port` in
  `~/.local/share/remote-machines/known_hosts.json`. A changed key is refused, with a warning and
  *Trust the new key…*.
- **Sign-ins** stay in memory for the window's lifetime; with *Remember*, they're encrypted with AES-GCM
  under a non-extractable key kept in this browser's IndexedDB (`remote-machines-keystore`), and only
  the ciphertext goes to `~/.local/share/remote-machines/secrets.json`. A wrong or missing sign-in shows
  a sign-in form. The bridge token is kept the same way.
- Saved state: `settings.json` (bridge address), `connections.json` (no secrets), both in
  `~/.local/share/remote-machines/` (localStorage when the page runs outside the OS).
- A dropped connection reconnects with a back-off; open terminals show "[connection lost]" and a
  *Restart* button.

## In Files: `/mnt/ssh/<name>`

While a machine is connected (and the Remote Machines window is open), it is mounted at
`/mnt/ssh/<name>`: the default file explorer, Notepad, the terminal's `ls`/`cat`, every app uses it like
any folder. *Open in Files* in the app's header opens it. Closing the window or disconnecting unmounts it.

VFS calls are synchronous and the bridge isn't, so the mount is an in-memory mirror
(`FS.createBackend('InMemory')`) behind a wrapper (`Object.create(mem)`, like WebRTC's read-only view)
that this app owns and keeps in step with the machine:

- **Folders** are listed when an app reads them (`readdirSync`, re-listed if older than 5 s) and one
  level ahead: opening a folder lists its sub-folders in the background, and only those (background
  listings don't expand further, so the mirror never crawls the disk). When a listing arrives, the app
  sends `vfs:changed` (`{ detail: { path } }`) on the top window; both explorer copies re-read the folder
  they show when the change is in it, is it, or is its parent.
- **Files** start as placeholders whose `statSync` reports the remote size and date. Small ones
  (≤ 512 KB, up to 40 / 4 MB per opened folder) are fetched in the background; any other read starts a
  download and fails with `EAGAIN` ("still downloading … open it again in a moment") instead of
  returning wrong bytes, and a notification says when it's there. Files over 8 MB download on a second
  open within a minute (the explorer reads every image for its thumbnails); over 256 MB, never (use the
  app's Download).
- **Writes** (`writeFileSync`, `appendFileSync`, streams: everything through `openSync`), `mkdirSync`,
  `unlinkSync`, `rmdirSync`, `renameSync` apply to the mirror at once, so the calling app sees them, and
  go to the machine in order in the background (the header counts what is still on its way). A failure is
  notified and the folder is listed again, so the mirror shows what the machine really has.
  `mkdirSync` means "make sure it exists" (the explorer mkdirs paths it navigates to): missing levels are
  created locally, then the machine is asked (`fs.stat`) and only `mkdir -p`'d when it lacks the folder.
  `rmdirSync` uses the bridge's non-recursive `fs.rmdir`, so a folder whose remote contents were never
  listed can't be deleted with them by accident.
- **Remote changes** come from the bridge's `fs.watch` (it re-lists recently listed folders every 4 s and
  pushes `fs` events); edits on their way to the machine are never overwritten by an older listing.
- Background work runs two jobs at a time and waits while anything a person is waiting for is in flight
  (the bridge runs four commands per machine).

Limits: opening the explorer *directly* at a deep path that hasn't been listed yet fails like any
missing folder (the explorer reads it before anything could create it); clicking down to it works.

## Files

Breadcrumbs, up, refresh, dotfiles toggle, new folder. Per item: open (text files up to 4 MB, in an
editor; Ctrl/⌘+S saves back), **Save to Files** (copies into the VFS, folders with everything in them),
download to this computer, rename, delete. Ctrl/⌘+click selects several (Save to Files / Delete).

Uploads: *Upload* (from this computer), *From Files* (pick VFS files and folders), or drop onto the list
— files from your computer, or items dragged from the OS's file explorer (`application/x-vfs-path`).
Big files go in 6 MB pieces (`fs.readChunk`, appending `fs.write`). Copies are limited to 5000 items.

This is a browser over the remote files, not a VFS mount: every VFS call in this OS is synchronous, and
a remote machine's whole tree can't be cloned into memory the way the WebRTC app clones a shared folder.

## Terminals

*Terminal* opens a login shell on the machine (a real PTY over SSH) in an xterm.js tab (xterm 5.3.0 +
fit addon 0.8.0 from unpkg, pinned). Several tabs per machine; they keep running while you switch tabs
or machines in the app. `term.open` always runs before any resize (see the CLAUDE.md terminal note).

## Containers

Lists the LXD or Incus instances on the machine (`lxc list --format json --all-projects`, also on cluster
members: a *Member* column), with state and IPv4. **Terminal** opens a shell inside a running one
(`lxc exec <name> [--project p] -- sh -c 'exec bash -l || sh -l'`); start, stop and restart are there too.
When the SSH user can't use the LXD socket, commands run with `sudo` (`sudo -n`, then asking for the
password once — kept only in memory); container terminals prefix `sudo`, which asks in the terminal.

## Monitor

The bridge samples Linux machines every 5 s once connected (CPU — the cgroup's share when the user
is in a limited one, memory without page cache, swap, disk of the attached folder, network in/out of
every interface but `lo`, load, each core) and keeps the last hour (`metrics.history`). While the
*Monitor* tab is open the app reads what's new every 5 s and stops when you leave it:

- tiles for CPU, memory, swap, load (also per core), disk and network, with meters (amber from 75 %,
  red from 90 %);
- CPU, memory and network charts over 5 min, 15 min or 1 hour, with a crosshair and one tooltip for
  every series; network shows received and sent in two colours (the chart kit's validated categorical
  steps) with a legend, the single-series charts need none;
- each core's use now, and the 15 busiest processes (`metrics.top`), each with *Stop* — SIGTERM through
  `proc.kill`, after a confirmation.

History starts when the session does (the bridge keeps it per connection), so a fresh connection shows
"Collecting the first samples" for a few seconds.

## Security behaviour (audit NET-4, NET-7)

- **Bridge approval:** credentials and the bridge token go only to an approved bridge origin. Signing in
  through an address that isn't approved, or has changed since it was approved, asks first. Declining
  opens no socket at all. Saving the address in *Bridge* settings approves it, and the default localhost
  bridge is approved on first use. The approved origin is sealed in `secrets.json` together with the
  token.
- **Names from the bridge:** names are validated before anything touches the vfs. `.`/`..`, separators
  and control characters are refused and counted. `/mnt/ssh/<name>` paths and *Save to Files*
  destinations are built with `pathPolicy.safeJoin`, so a malicious bridge can't write outside the
  mirror or the chosen folder.
- **Still open until phase 2:** the AES key protecting `secrets.json` is non-extractable but lives in
  origin-wide IndexedDB, so other same-origin code could still use it. The fix is a broker-held per-app
  secret store (`documentation/security/runtime-spec.md`, `secrets.*`).

## Testing

`testing/scripts/remote-machines-e2e.mjs` (needs a bridge and a reachable SSH machine; see its header).
`window.__remoteMachines` exposes the app state for tests.
