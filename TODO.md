# TODO — security hardening & ring restructure

Goal: apps run sandboxed — each gets only its own DOM plus mediated vfs/storage access; the layout
(selected at boot) is the only code that touches the top document. Constraint: static hosting on GitHub
Pages from `docs/` (no response headers, one origin).

Docs: [security model](documentation/security/README.md) · [audit](documentation/security/audit.md)
(finding IDs used below) · [decisions D1–D16](documentation/security/decisions.md) · tests in
`testing/scripts/security/`.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` deferred (reason given). Each Phase 1 workstream
owns the files listed under it, so the workstreams could land in parallel without touching each other's files.

---

## Phase 0 — Audit & plan  [x]
- [x] 0.1 Audit of five areas: KRN (kernel/IPC/SW), WIN (window manager/hosting), BOOT (boot code/packages/shell), NET (peer & network apps), APP (viewers/utilities + app inventory) → `documentation/security/audit.md`
- [x] 0.2 Browser feasibility spike (Playwright) → matrix in `decisions.md` D3/D7/D8; scripts `testing/scripts/security/spike-*.mjs`; `spike-ipc-exploit.mjs` proves KRN-1 three ways (sandboxed frame, page in the Browser app, cross-site popup)
- [x] 0.3 Decisions D1–D16, threat model, invariants I1–I8
- [x] 0.4 Shared contracts for phase 1: `src/kernel/path-policy.ts` (+14 vitest cases) exposed as `platform.host.pathPolicy`; IPC frame registry contract `registerIpcFrame`/`getIpcFramePolicy` in `src/kernel/ipc-bus.ts`, exposed as `platform.host.registerIpcFrame` via the frozen `window.__wosKernel` hook

## Phase 1 — Close remote and zero-click holes (in-place fixes)  [x]

### 1A Kernel, service worker, boot — workstream `kernel`
Files: `src/kernel/{ipc-bus,vfs,sw-bridge,deeplink}.ts`, `src/sw.ts`, `src/index.ts`, `docs/public/index.html`, `docs/404.html`, `docs/public/mount/usr/lib/ipc.js`, `docs/public/mount/usr/bin/deeplink.js`
- [x] 1A.1 KRN-1, WIN-7, NET-2, APP-9 — IPC listener serves only frames registered via `registerIpcFrame`, only their events/paths (normalised, `isInside`); foreign/unregistered senders get nothing; reply only to the registered source
- [x] 1A.2 KRN-13 — `broadcastIpcEvent` posts only to registered frames
- [x] 1A.3 KRN-7 (D11) — SW: `CSP: sandbox …`, `nosniff`, `CORP: same-origin`, `application/octet-stream` default on every `/(sw)/` and `/cache/` response; transitional exemption only for iframe navigations under `/(sw)/opt/apps/**`; top-level navigations always sandboxed
- [x] 1A.4 KRN-8 — SW: random request ids, reply accepted only from the client asked, null-safe handler, no broadcast of requests
- [x] 1A.5 KRN-9, BOOT-7 — remove the `__BOOTSTRAP_SCRIPT_PATH__` override; `?fsBackend=` from a URL needs confirmation
- [x] 1A.6 BOOT-6 — server `meta.json` authoritative; only same-origin `/public/mount/` sources
- [x] 1A.7 KRN-11 (D12) — refuse to boot in a cross-origin frame; drop `window.opener`; `window.open` wrapper forces `noopener,noreferrer` cross-origin; meta CSP in `docs/public/index.html` + `docs/404.html` (smoke-tested)
- [x] 1A.8 KRN-12, BOOT-9 — deep links: no leading dot / `..` in names, app-id regex, only installed apps
- [x] 1A.9 KRN-6, WIN-10 (SW side) — the injected AppSDK bootstrap takes the port once, from its parent or a same-origin window that isn't itself or one of its own child frames (a strict `=== parent` breaks every `sandboxAppIframe` app: the layout posts from its module iframe); unrelated messages don't consume it. `/usr/lib/ipc.js` walks parent…top until the OS answers, then pins it; random ids; 30 s timeout

### 1B Host, exec, open policy, ACL, compiled apps — workstream `host`
Files: `src/shared/index.ts`, `src/remote.ts`, `src/platform/**`, `src/core/iframe/index.tsx`, `src/apps/**`, `src/modules/**`
- [x] 1B.1 KRN-2, BOOT-1 — `?app=`/`?apps=` launcher: validated name, no code strings, args only for `deepLink: true`
- [x] 1B.2 KRN-3, BOOT-2, WIN-2, APP-1 — `Host.exec`, `src/remote.ts:406`, compiled explorer (mirror of 1D.1), notepad, markdown → structured calls; no `${…}` in any `execCommand` string
- [x] 1B.3 WIN-3, BOOT-3, APP-2, NET-8 — open policy (D10): `.js`/`.run` outside system dirs → editor, Run needs confirmation; `.svg`/`.ico` → image viewer; `.html` → `ui.sandboxed-app`; default handler not picked by title sort
- [x] 1B.4 WIN-4, NET-2 — Browser (`ui.iframe`): cross-origin URLs get a restrictive sandbox + `no-referrer`; same-origin/`/(sw)` URLs only via the opaque path; no `platform`/`fetch` injection into non-first-party frames
- [x] 1B.5 KRN-5 — Namespace: normalise both sides, validate ids, kernel-owned paths read-only, per-app `/tmp/<id>`, deny reads of other apps' `~/.local/share/<id>`
- [x] 1B.6 KRN-10 — command registry records owners; a different owner can't replace a name unless the existing registration is `fallback` (the `explorer` fallback in `src/remote.ts`)
- [x] 1B.7 WIN-8, APP-4 — compiled markdown viewer: escape attributes, URL scheme allowlist, no raw HTML
- [x] 1B.8 `ui.sandboxed-app` registers its frame (`fs.*` read-only on its own folder)
- [x] 1B.9 D15 — delete dead `src/platform/exec-engine.ts` and `src/platform/message-bus.ts` (0 importers; exec-engine duplicates the KRN-3 sinks)
- [x] 1B.10 WIN-5 (Host part) — `appendDomElement` layout-only; `hardenWindow` on WindowService module frames. `add`/`removeCSSStyleSheet` stay open: `/etc/widgets/{shortcuts,notifications,toolbar}.js` use them (→ phase 2, widget CSS in the widget's own frame)

### 1C Window chrome & layout — workstream `layout`
Files: `src/core/window-manager.ts`, `src/core/layout/**`, `src/system/**`, `docs/public/mount/opt/window-manager.js`, `docs/public/mount/opt/wm/**`, `docs/public/mount/opt/desktop/**`
- [x] 1C.1 WIN-5 — titles via `textContent`, icon regex, header style allowlist, numeric clamped geometry, `appendDomElement`/`addCSSStyleSheet` layout-only
- [x] 1C.2 WIN-6, BOOT-5, BOOT-11 — `/opt/window-manager.js`, `/opt/wm/<id>.js`, `/opt/desktop/<id>.js`, `menuItem.js` run from the static `/public/mount` copy (or bundle), ids validated against the shipped list
- [x] 1C.3 KRN-3, WIN-2 — layout context menu / desktop actions → structured `{command, args}`
- [x] 1C.4 WIN-7 — dock + canvas-wallpaper frames registered with narrow policies; no `'*'` posts of titles/pointer to unregistered frames
- [x] 1C.5 WIN-10, KRN-6 — `props` stops exposing `namespace`/`proxyFs`; `sandboxAppIframe` port posted once with a pinned target; re-navigation = new port
- [-] 1C.6 WIN-9 — caller identity for `process.kill`/`send-message` (needs the broker → 2.2)

### 1D File, package and shell apps — workstream `apps-files`
Files: `docs/public/mount/opt/apps/{file-explorer,explorer-sifi,pkg-manager,app-drawer,app-launcher,spotlight,bookmarks,terminal,task-manager}/**`, `docs/public/mount/bin/**` (except `webrtc.run`), `docs/registry.json`, `scripts/**`
- [x] 1D.1 KRN-3, APP-1 — DSL sinks in file-explorer `main.js`, explorer-sifi, app-drawer, spotlight, pkg-manager → structured calls
- [x] 1D.2 BOOT-8, APP-3 — zip-slip: explorer Extract, explorer-sifi, `unzip.run`, `tar.run` → `pathPolicy.safeJoin`
- [x] 1D.3 BOOT-4 — pkg-manager: id/dest/main validation, per-file sha256 (generator `scripts/gen-registry-integrity.mjs`), consent for third-party registries
- [x] 1D.4 BOOT-10 — uninstall/rollback derive `appDir` from the validated id; no unsandboxed `pre-uninstall`
- [x] 1D.5 BOOT-12 — terminal rejects `/`/`..` in command names; `curl.run` neutralises terminal escape sequences
- [x] 1D.6 APP-9 — bookmarks open correctly; external opens `noopener,noreferrer`

### 1E Network & peer apps — workstream `apps-net`
Files: `docs/public/mount/opt/apps/{webrtc,remote-machines,distributed-compute,distributed-kv,wamp-client,youtube-player,speed-test,vscode-online}/**`, `docs/public/mount/bin/webrtc.run`
- [x] 1E.1 NET-1 — compute responder off by default, per-group opt-in; peer tasks run in an opaque sandboxed frame with `connect-src 'none'`
- [x] 1E.2 NET-3 — WebRTC mount names validated, writes stay inside the mount
- [x] 1E.3 NET-4 — Remote Machines reconcile/saveToVfs/cleanName validated
- [x] 1E.4 NET-5 — compute roster renders names as text
- [x] 1E.5 NET-6 — mutating `webrtc.api` calls need confirmation in the WebRTC window
- [x] 1E.6 NET-7 — Remote Machines: bridge URL sealed with the token / confirm host change
- [x] 1E.7 NET-9 — SVG never a same-origin `blob:` document
- [x] 1E.8 NET-10 — no read-write shares of system folders; `~/.local/share` excluded by default
- [x] 1E.9 NET-11 — `autoMesh` off by default; joining a group needs acceptance
- [x] 1E.10 NET-12 — Webamp pinned with SRI (or vendored)
- [x] 1E.11 NET-13 — decompression and reassembly caps
- [x] 1E.12 NET-2 — YouTube / fast.com / code-server frames get restrictive `sandbox` attributes

### 1F Viewers & tools — workstream `apps-viewers`
Files: every other `docs/public/mount/opt/apps/*/**` (notebook, mermaid-viewer, trainboard, dashboard, audio-player, fs-inspector, dock, totp-auth, ai-dom-lens, ts-ide, markdown-reader, csv/diff/image viewers, graph-editor, sqlite-*, snakes, …), `docs/public/vendor/**` (new: vendored, pinned libraries)
- [x] 1F.1 APP-5 — notebook markdown cells sanitised
- [x] 1F.2 APP-6 — ai-dom-lens page frame without `allow-scripts`
- [x] 1F.3 APP-7 — mermaid `securityLevel: 'strict'`, pinned
- [x] 1F.4 APP-8 — TOTP secrets out of localStorage into its own data dir; names escaped
- [x] 1F.5 APP-10 — TrainBoard renders log values as text; validates run/metric
- [x] 1F.6 APP-13 — dashboard picker without inline handlers; http(s)-only URLs
- [x] 1F.7 APP-14 — audio-player, fs-inspector, docks render names/titles as text
- [x] 1F.8 APP-12 — ts-ide preview without `allow-same-origin`
- [x] 1F.9 APP-11 — CDN libraries in owned apps pinned with SRI or vendored into `docs/public/vendor/`
- [x] 1F.10 `/etc/settings/20-managers.js` — text no longer claims live-edited WM modules; interpolated `execCommand` (~377) → structured call

### 1G Security regression suite — workstream `tests`
Files: `testing/scripts/security/**` (keeps the spike scripts)
- [x] 1G.1 Harness `lib/harness.mjs` (boot, vfs helpers, frame finding, cross-origin pages, realistic launch)
- [x] 1G.2 One test per finding group + static checks; `run-all.mjs` prints PASS/FAIL by finding ID
- [x] 1G.3 Red baseline: suite run against the pre-fix code (worktree of `HEAD` on `:8090`)
- [x] 1G.4 Green run against the fixed tree (`:8080`) once 1A–1F land

### 1H Integration
- [x] 1H.1 Merge check: build (`npx webpack`), vitest, full security suite, smoke-test core apps (explorer, terminal, settings, notepad, webrtc, remote-machines, pkg-manager)
- [x] 1H.2 Update audit statuses + this file; CLAUDE.md notes for new conventions (the "edit /opt/window-manager.js live" note is obsolete — 1C.2)
- [x] 1H.3 Follow-ups: `meta.json` `force_reload: true` for `/opt/window-manager.js`, `/opt/wm/{classic,minimal,ubuntu,glass,tiling}.js`, `/opt/systemd/lib/shell-init.js` (vfs copies are view-only / must carry the runFile call); bounded `borderRadius` back on window bounds (`safeBorderRadius`, Settings' 1.5rem corners); dead `execCommand(child.cmd)` branch removed from `/usr/lib/ui/menuItem.js`. Moved on: `/etc/settings/20-managers.js` + `02-projects.js` → 1F.10; `addCSSStyleSheet` → phase 2 (1B.10). Verified: `verify-integration.mjs` 8/8
- [x] 1H.5 Docs for 1E behaviour changes: `documentation/apps/webrtc.md` (group invites need acceptance, `autoMesh` off for new users, CLI/other-app mutations prompt, system folders unshareable rw, downloads as attachments, SVG previews as data: URLs), `documentation/apps/remote-machines.md` (bridge-origin approval, token pinned to its bridge, name validation), Distributed Compute ("Run tasks for others" opt-in per group, hidden no-network/no-storage sandbox, 60 s timeout, 4 concurrent), CLAUDE.md; `docs/registry.json` re-run of `scripts/gen-registry-integrity.mjs` after all owners finish
- [x] 1H.6 Autorun callers use `runFile(..., {confirm:false})`: `src/core/cron.ts` (.js/.run jobs), `/opt/systemd/lib/shell-init.js` (initd), `/etc/widgets/public-ip.js`; `src/core/systemd.ts` units get `host.forPlatform(svcPlatform)` with the stable owner `systemd:<unit>`. `LEGACY_AUTORUN_PATHS` kept as a compatibility net for old vfs copies / cached meta.json → remove in phase 4
- [x] 1H.7 `/home/user1/projects/temp.html` demo ported to the sandbox SDK (`window.ipc`): Babel + React from pinned CDN builds with SRI, `ipc.fs.readText` + live reload, "temp.js" link → `ipc.editor.open` (new IPC event, read-scope checked, throttled). Tests: `testing/scripts/test-demo-project-sandboxed.mjs`, `test-temp-html-demo.mjs`
- [x] 1H.8 Pre-existing: `ai-dom-lens`, `vector-store`, `wamp-client` are CORE_APPS but not in `meta.json` → never bootstrapped on a fresh install (wamp-client logs ENOENT at boot)
- [ ] 1H.9 Pre-existing bugs found by owners (not security): double-clicking a `.zip` in the standard explorer never extracts (`'zip'` vs `.zip` comparison; right-click Extract works); wamp-client is in the default `installed.json` with no files (ENOENT at boot, see 1H.8)
- [ ] 1H.4 Later (phase 4/5): bundle the window-manager / desktop / menu modules at build time — removes the boot race where the first window gets built-in defaults and the last top-realm `execString` of layout code (1C.2)

## Phase 2 — Sandbox runtime  [ ]
Spec: [documentation/security/runtime-spec.md](documentation/security/runtime-spec.md) (manifest, permissions, handshake, RPC, code delivery, SDK).
- [ ] 2.1 App manifest (`app.json`) + declarative loader: commands, file types, permissions, window size; no app code in the top realm at install/boot
- [ ] 2.2 Broker: per-instance `MessagePort` handshake; RPC `fs`/`window`/`commands`/`storage`/`secrets`/`dialogs`/`notify`/`openExternal`/`mesh`; ACL from manifest + user grants (powerbox); caller identity for process ops (WIN-9)
- [ ] 2.3 Sandbox host: static mode (srcdoc + `<base>` + SDK), vfs mode (inlining + import map → `data:`), headless mode
- [ ] 2.4 SDK `src/sdk/` → `docs/wos-sdk.bundle.js`, with `AppSDK` / `window.ipc` compatibility
- [ ] 2.5 Window manager: sandboxed window type; chrome actions over the port
- [ ] 2.6 Media relay (`wos.media.getUserMedia`) and kernel-owned embed frames (`wos.embed`)
- [ ] 2.7 Invariant tests I1–I8 with an attacker-app fixture

## Phase 3 — Migrate apps to the sandbox (in waves)  [ ]
- [ ] Wave 1 — pilots already on `AppSDK`: snake-game, snake-lstm, snake-qlearning, snake-cnn3d, trainboard, cpp-ide
- [ ] Wave 2 — CDN-only demos: analyze, anova, threejs-demo, threejs-flow, webgl-demo, webgl-earth, glsl-shader, speed-test
- [ ] Wave 3 — viewers: csv-viewer, diff-viewer, image-viewer, graph-editor, mermaid-viewer, markdown-reader, totp-auth, screen-reader, bookmarks, dev-utils, docks
- [ ] Wave 4 — medium: audio-player, colleps, python-repl, python-demo, todo-python, dashboard, notebook, sqlite-browser, sqlite-charts, spotlight, app-drawer, app-launcher, task-manager, ai-dom-lens, alpine-wasm, ts-ide, vector-store, robot-sim, fs-inspector, youtube-player, vscode-online, wamp-client, distributed-kv
- [ ] Wave 5 — large: file-explorer (+ compiled copy), explorer-sifi, pkg-manager, settings (+ `/etc/settings` sections), terminal (+ `/bin/*.run` in the terminal realm), nn-ide, model-builder, webrtc, remote-machines, distributed-compute; compiled notepad, markdown, xml-parser, game-of-life, vs-code
- [ ] Headless — cron jobs, widgets, initd user hooks, systemd units

## Phase 4 — Remove legacy paths  [ ]
- [ ] `LEGACY_AUTORUN_PATHS` in `src/shared/index.ts` (1H.6)
- [ ] Same-origin `ui.iframe` for vfs content, `window.platform` injection, `execString`/`execCommand` in the top realm, the `wos-ipc` window listener, `window.fs` / `__wosHost` globals, `sandboxAppIframe`'s `allow-same-origin`, CSP `'unsafe-eval'`; I1–I8 hold

## Phase 5 — Ring structure cleanup  [ ]
- [ ] Registries (commands, processes, services) as kernel closure state, never on `window`
- [ ] `src/shared/index.ts` slimmed to delegators; layout split into `src/system/*` managers
- [ ] `documentation/api/*` updated for the SDK; legacy plan below closed out

---

## Progress log
- **2026-11-18** — Phase 0: audit of five areas plus a browser feasibility spike; threat model, decisions D1–D16 and the phase-2 runtime spec written; shared path policy (`src/kernel/path-policy.ts`, 14 unit tests) and the IPC frame-registry contract landed.
- **2026-11-19** — 1B (host) done: `Host.runFile`, `confirmRun`, `getViewerCommand`, `forPlatform` (per-script command owner), safe markdown renderer; dead `exec-engine.ts` / `message-bus.ts` removed. 1C (layout) done: window chrome as text, structured context menus, dock/wallpaper frames registered, WM/desktop/menu modules from the static copy. 1E (network apps) done: Distributed Compute opt-in + opaque task sandbox, group consent, mount/SSH name validation, Webamp vendored.
- **2026-11-20** — 1A (kernel) done: IPC answers registered frames only, SW headers and reply binding, no bootstrap override, server `meta.json` authoritative, framing refusal + meta CSP, deep-link validation. CLAUDE.md "Security model" section; webrtc / remote-machines docs updated.
- **2026-11-21** — 1D (files, packages, shell) done: structured explorer menus with explicit Run, zip-slip fixed, App Manager per-file sha256 (`scripts/gen-registry-integrity.mjs`), terminal/xargs `runFile`. 1F (viewers) done: DOMPurify vendored, mermaid strict, TOTP secrets out of localStorage, text-only rendering, CDN libraries pinned with SRI. 1G: regression suite `testing/scripts/security/run-all.mjs` — baseline (pre-fix) 0/121 phase-1 checks, final run 121/121 (47/47 findings); phase-2 checks fail as expected.
- **2026-11-21** — Integration: `meta.json` fixes (docks, missing core apps), last CDN tags given SRI, registry hashes regenerated, bundles rebuilt. Projects demo (`/home/user1/projects/temp.html`) ported to the sandbox SDK (`window.ipc`): renders opaque, live-reloads `temp.js`, opens it in Notepad through the new `editor.open` IPC event (path checked against the frame's read scope).
- **2026-11-22** — Boot loading (no security model change, D1 intact):
  - Production webpack build. Babel is only in the remote bundle (bundles 49.6 → 5.4 MB).
  - meta.json carries generated `sha256`/`when`/`app`. Boot downloads only changed or missing files, and the rest syncs after landing.
  - Apps that aren't preinstalled are left out of meta.json; registry apps install once from App Manager.
  - No service-worker reload on a first visit. Deferred bundles and a background spinner.
  - System modules run from the vfs only when their hash matches the server's (`metaSha256`), otherwise from the static copy.
  - Measured on a local GitHub Pages-like server: first visit 610 → 130 requests before the desktop (4.1 → 1.6 s); repeat visit 281 → 24 requests.
  - Security tests now install non-preinstalled apps first. BOOT-11 clicks an empty desktop spot (the dock iframe covered the old one).

---

## Appendix — legacy plan: Platform Rings Refactor (superseded by Phases 2–5 above)

Status reconciled 2026-11-18 by checking imports:

| Legacy task | State |
|---|---|
| 1.1–1.4 kernel `vfs.ts`, `ipc-bus.ts`, `sw-bridge.ts`, `index.ts` | done (wired) |
| 2.1–2.3 `namespace.ts`, `process-manager.ts`, `proxy-fs.ts` | exist and wired, but advisory — apps also have raw `getFS()` (KRN-5) |
| 2.4 `message-bus.ts`, 2.7 `exec-engine.ts` | exist, **0 importers** (dead; removal = 1B.9) |
| 2.5 `command-registry.ts`, 2.6 `service-registry.ts` | exist, partly used; Host still owns the live registries |
| 2.8 slim `src/shared/index.ts` | not done → Phase 5 |
| 3.1–3.3 `src/system/*` managers | exist, partly wired; 3.4 slim layout not done → Phase 5 |
| 4.x app launch flow | partial: a namespace per window; `sandboxAppIframe` exists but is same-origin (KRN-6) → Phases 2–3 |
| 5.x tests/cleanup | → Phases 1G, 2.7, 4 |

### Platform Rings Refactor

Restructure bootstrapper-js into Linux-style privilege rings so apps are
fully isolated and all resource access is mediated by Platform.

---

#### Architecture

```
Ring 0 — Kernel
  vfs         BrowserFS mount, sync mirror, path helpers
  sw-bridge   Service worker registration + /(sw)/ request routing
  ipc-bus     Raw postMessage router (send/reply/broadcast)

Ring 1 — Platform  (the only entry point rings 2-3 can call)
  process-manager   PID generator, namespace lifecycle
  namespace         Per-app context: pid, id, ACL, owned resources
  message-bus       Mediated send between namespaces via platform
  proxy-fs          FS API for apps — path ACL + segment-safe mkdir
  command-registry  Registered commands (moved out of Host)
  service-registry  Named service map (moved out of Host)
  exec-engine       execString / execCommand / exec (moved out of Host)
  platform          Platform class (thin — delegates to above)
  host              Host class (kept, delegates to platform)

Ring 2 — System  (system services, access platform via approved API)
  layout-manager    Grid areas, active layout, layout switching
  window-manager    Window open/close/minimize/focus/pid tracking
  desktop-manager   Desktop icons, context menu, wallpaper

Ring 3 — Apps  (access nothing below platform)
  Each app launch:
    1. platform creates Namespace (pid + id + ACL)
    2. platform creates iframe + postMessage IPC channel for that namespace
    3. app receives proxy-fs + message-bus handle only
    4. to reach another process: app → platform.send(targetPid, msg)
    5. platform routes the message (enforces ACL) → target namespace
```

---

#### Tasks

##### Phase 1 — Kernel layer  [ ]
- [ ] 1.1  Create `src/kernel/vfs.ts`
        Extract VFS init from `src/index.ts`:
        `initVFS()` → mounts BrowserFS (indexeddb / localstorage),
        `bootstrapMetaFiles()` → reads meta.json, copies force_reload files,
        `mkdirRecursive(fs, path)` → segment-by-segment mkdir helper (fixes BrowserFS bug)
        Export: `getFS()`, `mkdirRecursive`
- [ ] 1.2  Create `src/kernel/ipc-bus.ts`
        Move `initIpc`, `registerIpcHandler`, `broadcastIpcEvent` out of `src/core/ipc.ts`
        Add `IpcBus` class: `register(event, handler)`, `dispatch(event, data)`, `broadcast(event, data)`
        Keep WmBridge / DockBridge types here
- [ ] 1.3  Create `src/kernel/sw-bridge.ts`
        Extract SW registration from `src/index.ts`
        `registerServiceWorker()`, `getServiceWorker()`
- [ ] 1.4  Update `src/index.ts` to call kernel layer only (no inline VFS/SW code)

##### Phase 2 — Platform core  [ ]
- [ ] 2.1  Create `src/platform/namespace.ts`
        `Namespace` class: `{ pid, id, appDir, acl: { paths: string[], read, write } }`
        ACL defaults: read `/opt/apps/<id>/`, `/home/user1/.local/share/<id>/`, write same
        `checkRead(path)`, `checkWrite(path)` → throws if denied
- [ ] 2.2  Create `src/platform/process-manager.ts`
        `ProcessManager`: PID counter, `Map<pid, Namespace>`, `spawn(id, opts)`, `kill(pid)`, `list()`
        Emits observable `processes$` (used by task-manager)
- [ ] 2.3  Create `src/platform/proxy-fs.ts`
        `ProxyFS` wraps kernel VFS with a `Namespace`
        All path args are checked via `ns.checkRead` / `ns.checkWrite` before calling real fs
        `mkdirRecursive(path)` uses segment-by-segment approach (no { recursive } flag)
        Exported to app as its only FS interface — no raw `getFS()` access
- [ ] 2.4  Create `src/platform/message-bus.ts`
        `MessageBus` singleton owned by Platform
        `subscribe(pid, handler)`, `unsubscribe(pid)`
        `send(fromPid, toPid, channel, payload)` — platform checks ACL then routes
        `broadcast(fromPid, channel, payload)` — sends to all subscribed pids
        IPC wire: wraps existing `ipc-bus` postMessage under the hood
- [ ] 2.5  Create `src/platform/command-registry.ts`
        Extract `Command` type, `registerCommand`, `getCommand`, `callCommand`,
        `getCommandsForExtension` from `Host` in `src/shared/index.ts`
        Backed by `BehaviorSubject<Command[]>` (same as today)
- [ ] 2.6  Create `src/platform/service-registry.ts`
        Extract `register`, `getServiceSync`, `getService` from `Platform` class
        `ServiceRegistry`: `Map<string, unknown>`, `register(name, value)`, `get(name)`
- [ ] 2.7  Create `src/platform/exec-engine.ts`
        Extract `execString`, `execCommand`, `exec` from `Host`
        `ExecEngine` takes `CommandRegistry`, `ServiceRegistry`, `ProcessManager`
        `execString` creates a Namespace via ProcessManager before running the script
        Window shim passed to scripts: `{ platform: namespacedProxy, document, top }`
        namespacedProxy exposes only: `ProxyFS`, `MessageBus.send`, `CommandRegistry` (read-only)
- [ ] 2.8  Slim down `src/shared/index.ts`
        `Host` delegates all methods to the new modules above
        `Platform` becomes a thin proxy; constructor accepts registry + bus + exec refs
        Remove direct `getFS()` from Host public API (internal only via ProxyFS)
        Keep `execCommand` on Host for backward compat during transition

##### Phase 3 — System layer  [ ]
- [ ] 3.1  Create `src/system/layout-manager.ts`
        Extract layout load/switch/config from `src/core/layout/index.tsx`
        `LayoutManager`: `layouts$`, `active$`, `setLayout(id)`, `readLayouts()`
- [ ] 3.2  Create `src/system/window-manager.ts`
        Extract window open/close/minimize/focus from `src/core/layout/index.tsx`
        Each window tracks its namespace pid
        `WindowManager`: `openWindow(cmd, pid, body, props)`, `closeWindow(pid)`,
        `minimizeWindow(pid)`, `focusWindow(pid)`, `windows$`
- [ ] 3.3  Create `src/system/desktop-manager.ts`
        Extract desktop icon rendering, right-click context menu from layout
        `DesktopManager`: `icons$`, `refresh()`, wallpaper apply
- [ ] 3.4  Slim `src/core/layout/index.tsx`
        Becomes a thin React shell that wires LayoutManager + WindowManager + DesktopManager
        No more direct VFS calls or business logic in the component

##### Phase 4 — App launch flow  [ ]
- [ ] 4.1  Update `pkg-manager/loader.js` boot flow
        Each CORE_APPS entry: `ProcessManager.spawn(id)` → get namespace → `ExecEngine.exec`
        Script runs in namespace context, gets ProxyFS + MessageBus only
- [ ] 4.2  Update window open flow in `open-window` service
        `WindowManager.openWindow` calls `ProcessManager.spawn` for the new window pid
        Iframe gets its namespace pid injected; AppSDK injected = ProxyFS + MessageBus
- [ ] 4.3  Update AppSDK injection (in app main.js loaders)
        Replace raw `fs.*` with `ProxyFS` methods from the namespace
        Replace `iframe.contentWindow.AppSDK = { readText: fs... }` with
        `iframe.contentWindow.AppSDK = namespace.proxyFs` (same API shape)
- [ ] 4.4  Update snake + NN app loaders
        Same pattern: get namespace from ProcessManager, inject ProxyFS
- [ ] 4.5  IPC channel per app iframe
        Each iframe postMessage channel registered in MessageBus under its pid
        Apps call `AppSDK.send(channel, payload)` → platform routes via MessageBus

##### Phase 5 — Tests + cleanup  [ ]
- [ ] 5.1  Update/add browser tests for new launch flow
- [ ] 5.2  Remove dead code from old Host (direct fs exposure, inline IPC handlers)
- [ ] 5.3  Verify task-manager still shows processes via `ProcessManager.list()`
- [ ] 5.4  Verify settings, spotlight, pkg-manager still work
- [ ] 5.5  Rebuild (`npx webpack`) and smoke-test in browser

---

#### File map (new vs old)

| New file | Replaces / source |
|---|---|
| `src/kernel/vfs.ts` | inline in `src/index.ts` |
| `src/kernel/ipc-bus.ts` | `src/core/ipc.ts` |
| `src/kernel/sw-bridge.ts` | inline in `src/index.ts` |
| `src/platform/namespace.ts` | new |
| `src/platform/process-manager.ts` | new |
| `src/platform/proxy-fs.ts` | new (replaces raw `host.getFS()` in apps) |
| `src/platform/message-bus.ts` | new (wraps existing `ipc-bus`) |
| `src/platform/command-registry.ts` | extracted from `src/shared/index.ts` Host |
| `src/platform/service-registry.ts` | extracted from `src/shared/index.ts` Platform |
| `src/platform/exec-engine.ts` | extracted from `src/shared/index.ts` Host |
| `src/system/layout-manager.ts` | extracted from `src/core/layout/index.tsx` |
| `src/system/window-manager.ts` | extracted from `src/core/layout/index.tsx` |
| `src/system/desktop-manager.ts` | extracted from `src/core/layout/index.tsx` |

---

#### Rules
- Apps MUST NOT import from `src/kernel/*` or call `host.getFS()` directly
- All FS access from apps goes through `ProxyFS` (enforced by namespace ACL)
- All inter-app messaging goes through `MessageBus.send(fromPid, toPid, ...)`
- Platform is the only layer that instantiates `Namespace` or calls kernel directly
- `src/shared/index.ts` is kept during transition; Host methods become thin delegators
