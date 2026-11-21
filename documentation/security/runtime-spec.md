# Sandbox runtime — spec (phase 2)

The contract between the kernel (broker + sandbox host, in the top document) and sandboxed apps (the
`wos` SDK, inside opaque-origin iframes). It implements [decisions.md](decisions.md) D3–D8; the
browser facts it relies on come from the spike (`testing/scripts/security/spike-*.mjs`).

## 1. App manifest — `app.json`

Lives next to the app's entry file: `docs/public/mount/opt/apps/<id>/app.json` for first-party apps
(static, part of the TCB), `/opt/apps/<id>/app.json` in the vfs for installed packages (written only by
the package installer — `/opt` is kernel-owned).

```json
{
  "id": "csv-viewer",
  "name": "CSV Viewer",
  "version": "1.0.0",
  "entry": "index.html",
  "icon": "table_chart",
  "window": { "width": 900, "height": 600, "minWidth": 320, "minHeight": 200 },
  "commands": [
    { "name": "ui.csv-viewer", "title": "CSV Viewer", "fileTypes": [".csv", ".tsv"], "public": true }
  ],
  "permissions": ["fs.read:$home/Documents", "net:https://api.example.com", "clipboard.write"],
  "system": false,
  "multiPage": false
}
```

| Field | Rule |
|---|---|
| `id` | `APP_ID_RE` (`src/kernel/path-policy.ts`); equals the folder name |
| `entry` | relative path inside the app folder (`safeJoin`) |
| `icon` | Material Symbols name, `^[a-z0-9_]+$` |
| `commands[].name` | `ui.<id>` or `<id>.<name>` — nothing outside the app's namespace; `deepLink: true` opts into URL launches; `public: true` lets other apps call it without a `commands.call` permission |
| `commands[].fileTypes` | extensions this command can open; the user/kernel picks defaults (apps can't claim them) |
| `system` | only honoured in first-party (static) manifests: lets `permissions` name kernel-owned scopes (Settings → `fs.write:/etc/wm`) |
| `multiPage` | allow the frame to navigate within the app (each load re-handshakes); default: a second `load` closes the window |

### Permissions

Implicit (every app): `fs.rw:$data` (`/home/user1/.local/share/<id>`), `fs.rw:$tmp` (`/tmp/<id>`), its own
static files (by URL), and per-instance **grants**: paths the user opened the app with or picked in a
kernel file dialog.

| Permission | Grants |
|---|---|
| `fs.read:<scope>` / `fs.write:<scope>` / `fs.rw:<scope>` | a folder subtree (placeholders `$data` `$tmp` `$home`). Third-party manifests can't name kernel-owned scopes |
| `net:<origin>` | added to the app's CSP `connect-src` / `img-src` / `media-src` (default: none beyond the static site) |
| `embed:<origin>` | `wos.embed.*` for that origin (kernel-owned frame, D13) |
| `commands.call:<name>` | call another app's non-public command |
| `media:microphone` / `media:camera` / `media:display` | `wos.media.*` relay, plus a user prompt per session |
| `clipboard.write`, `clipboard.read` | kernel-side clipboard |
| `pointer-lock` | adds `allow-pointer-lock` to the sandbox |
| `notifications` | `wos.notify` |
| `process.list`, `process.manage` | list all processes / kill any (task manager) |
| `mesh` | WebRTC mesh pub/sub, channels namespaced `<id>:<channel>` |

First-party permissions apply without a prompt. Third-party permissions are shown at install, and only
the approved ones are stored (in `/etc/pkg/grants.json`, kernel-owned).

## 2. Instances and the handshake

1. The kernel creates `<iframe sandbox="allow-scripts allow-forms allow-modals allow-downloads[ allow-pointer-lock]" allow="fullscreen[; clipboard-write]" allowfullscreen>` and sets `srcdoc` (§5).
2. The srcdoc's first `<script>` is the SDK (classic, synchronous), so `window.wos` exists before any app code runs. It waits for `{type:'wos:init', v:1, instance}` from `window.parent` (it checks `ev.source === window.parent`) carrying a `MessagePort`.
3. On the iframe's first `load`, the kernel creates a `MessageChannel`, keeps `port1` in the instance record `{pid, appId, instanceId, permissions, grants, windowRef, port}`, and posts `port2` to `iframe.contentWindow` (targetOrigin `'*'` is required for opaque frames; the target is the specific window).
4. A second `load` means the app navigated: unless `multiPage`, the kernel closes the window ("app navigated away"); with `multiPage`, it closes the old port and re-handshakes with the same permissions.
5. The kernel never listens on `window` `message` for app requests. Everything arrives on `port1`.

## 3. Wire protocol

- Request `{id, method, params: []}` → response `{id, result}` or `{id, error: {code, message}}`.
- Event (kernel → app) `{event, data}`. `ArrayBuffer`s travel as transferables.
- Error codes: `EACCES`, `ENOENT`, `EEXIST`, `EINVAL`, `ENOTDIR`, `EISDIR`, `ETIMEDOUT`, `ECANCELED` (user said no), `ENOSYS` (unknown method), `EBUSY`.
- Limits: one message ≤ 64 MB; ≤ 256 in-flight requests per instance. Over the limit → `EBUSY`.

## 4. Methods (v1)

| Method | Notes |
|---|---|
| `fs.readFile(path, {encoding?})` | `'utf8'` → string, else `ArrayBuffer` |
| `fs.writeFile(path, data, {mkdirp?})` | string or `ArrayBuffer` |
| `fs.readdir(path, {stats?})` | `[{name, kind:'file'\|'dir', size, mtime}]` with `stats` |
| `fs.stat(path)` | `{kind, size, mtime}` or `null` |
| `fs.mkdir(path, {recursive?})`, `fs.rm(path, {recursive?})`, `fs.rename(a, b)`, `fs.copy(a, b)` | both ends checked |
| `fs.watch(path)` → `watchId`; `fs.unwatch(watchId)` | events `fs.changed {watchId, path}` (replaces `vfs:changed` on `window.top`) |
| `dialogs.pickFile({multiple?, types?})`, `dialogs.pickFolder()`, `dialogs.saveAs({suggestedName, types?})` | kernel-drawn dialog; the picked paths become grants |
| `launch.args()` | the values the window was opened with; a file argument arrives already granted |
| `window.setTitle(text)` | text only, ≤ 200 chars |
| `window.close()`, `window.focus()`, `window.fullscreen(on)` | |
| `window.getBounds()`, `window.setBounds({x,y,width,height})` | numbers, clamped to the viewport |
| `window.addAction({icon, title})` → `actionId`; `window.removeAction(id)` | click → event `window.action {actionId}` |
| — | event `window.signal {name}` (`SIGTERM` before close; the app has 2 s) |
| `commands.call(name, ...args)` | needs `commands.call:<name>` or a `public` target; args structured-clone only |
| — | event `commands.invoke {callId, name, args}` for the app's own declared commands; app answers `commands.result(callId, value)` / `commands.error(callId, message)` |
| `storage.get/set/delete/keys` | JSON values, kept by the kernel in `$data/.wos-storage.json` |
| `secrets.get/set/delete` | encrypted by the kernel with a per-app non-extractable AES-GCM key in the kernel's IndexedDB; no app can address another app's secrets |
| `notify({title, body})` | `notifications` |
| `openExternal(url)` | cross-origin http(s) only; `noopener,noreferrer` |
| `clipboard.writeText(t)` / `clipboard.readText()` | kernel-side, within the user activation of the click that triggered it |
| `media.getUserMedia(constraints)` | relayed track over a loopback `RTCPeerConnection` (spike: works) |
| `embed.create(url, rect)` → id; `embed.update(id, rect)`; `embed.remove(id)` | kernel-owned frame over the app's window |
| `mesh.subscribe(ch)`, `mesh.publish(ch, data)` | channel becomes `<appId>:<ch>`; JSON only |
| `process.list()`, `process.kill(pid)` | `process.list` / `process.manage` (own pids always allowed) |

## 5. Code delivery (srcdoc)

Every srcdoc starts with, in order:
1. `<meta http-equiv="Content-Security-Policy" content="…">` — `default-src 'none'`; script/style/img/font/media from `<site origin>` + `'unsafe-inline' 'unsafe-eval' blob: data:`; `connect-src` = `<site origin>/public/` + `net:` origins; `worker-src blob: data:`; `frame-src` none (embeds go through the kernel); `base-uri <site origin>`; `form-action 'none'`. Use the explicit site origin, never `'self'` — in an opaque srcdoc, `'self'` doesn't mean the site.
2. `<base href="<site origin>/public/mount/opt/apps/<id>/">` (static mode only).
3. `<script src="<site origin>/wos-sdk.bundle.js"></script>` (static mode) or the SDK inlined (vfs mode).
4. The app's entry HTML, with the head content merged after these tags.

- **Static mode** (first-party): the entry HTML is fetched from the immutable static copy. Relative URLs,
  module graphs and `fetch` of the app's own files resolve against `<base>` (GitHub Pages sends ACAO `*`).
- **vfs mode** (installed / user apps): the kernel reads the files from the vfs:
  - same-folder `<script src>` and stylesheets are inlined;
  - module `import`s are rewritten to `http://wos.invalid/app/<id>/<path>` and listed in an import map
    pointing at `data:` URLs;
  - `<img src>` and friends become `data:` URLs;
  - anything loaded at runtime goes through `wos.fs.readUrl(path)`, which reads the bytes over the port
    and returns a sandbox-owned `blob:null` URL.
- **Headless mode** (cron jobs, widgets, `initd` user hooks, systemd units): a hidden frame with no window
  chrome. `.js` runs as a classic script. `.run` DSL runs with async proxies: `command(name)` → token,
  `service(m, s)(…)` → `services.call` RPC (allowlisted services only).

## 6. SDK surface (`window.wos`)

`wos.ready` (Promise) · `wos.fs.*` · `wos.dialogs.*` · `wos.launch.args()` · `wos.window.*` ·
`wos.commands.call/handle` · `wos.storage.*` · `wos.secrets.*` · `wos.notify` · `wos.openExternal` ·
`wos.clipboard.*` · `wos.media.getUserMedia` · `wos.embed.*` · `wos.mesh.*` · `wos.process.*` ·
`wos.on(event, cb)`.

Compatibility shims (so existing apps port with minimal edits):
- `window.AppSDK` (`readText, writeText, mkdir, remove, list, exists, stat, rename, setTitle, log`) maps
  onto `wos.fs` / `wos.window`.
- `window.ipc` (`/usr/lib/ipc.js`: `ipc.fs.*`, `ipc.wm.*`, `ipc.dock.*`) maps onto the same.
- There is deliberately no `window.platform`.

## 7. Kernel integration

- **Launcher stubs**: at boot the kernel reads the first-party manifest index
  (`docs/public/mount/opt/apps/index.json`, generated at build time) and installed manifests. It
  registers each declared command with owner `kernel` (not shadowable). Executing one opens a sandboxed
  window for the app with the given args.
- **Windows**: the layout draws container + header as today. The body holds the sandboxed iframe instead
  of an about:blank document rendered by top-realm code. Chrome requests arrive over the port and are
  validated (title text, icon regex, numeric bounds).
- **Open with**: `host.exec(path)` → default command for the extension → the target instance gets a grant
  for exactly that path.
- **Provenance**: `/mnt/**` and `/home/user1/Downloads/**` are untrusted (noexec). Run from there always
  confirms and always runs in headless/sandboxed mode.
- **Tests** (`testing/scripts/security/`): an attacker app fixture (a manifest with no permissions) must
  fail every escape in I2 and every out-of-scope `fs` call. A file-opened instance can read exactly the
  granted file. Commands outside its namespace can't be registered. A second `load` closes a
  non-multiPage window.
