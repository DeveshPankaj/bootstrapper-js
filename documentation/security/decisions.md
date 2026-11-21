# Security design decisions

Each decision: the context that forced it, what we do, and what it costs. Finding IDs refer to
[audit.md](audit.md). Status: **accepted** unless marked otherwise.

## D1 — Trust boundary: the static build is trusted, the vfs is data
- **Context**: every persistence chain in the audit (BOOT-5, BOOT-6, WIN-6, NET-3) is "write a vfs file
  that the top realm later executes". The vfs is writable by apps, peers, archives and drag-and-drop.
- **Decision**: the trusted computing base is what GitHub Pages serves from `docs/`: `index.html`,
  `*.bundle.js`, and the immutable static copies under `/public/mount/**`. Nothing read from the vfs ever
  executes in the top realm — not even the vfs copies of first-party apps, which become view-only.
- **Cost**: `/opt/window-manager.js`, `/opt/wm/*.js`, `/opt/desktop/*.js`, `menuItem.js` and fflate stop
  being live-editable from the vfs (they load from the static copy or the bundle). User-editable hooks
  (widgets, cron, initd, settings sections) keep working but run sandboxed (D7).

## D2 — The layout is the only DOM owner, selected at boot from a shipped allowlist
- **Context**: requirement — "layout is the only app with direct DOM access, selected at bootstrap".
- **Decision**: the layout (`src/core/layout`, plus the window-manager / desktop modules it selects) owns
  the top document. The selection is an id validated against layouts that ship with the build (bundle or
  static copy, D1); it's never a vfs path. Docks and the canvas wallpaper are *layout extensions*: they
  already run in opaque srcdoc frames and get a narrow capability set (window list, toggle, launch, their
  own settings).
- **Cost**: third-party layouts can't get DOM access; they'd have to ship with the build.

## D3 — Isolation primitive: opaque-origin sandboxed iframes
- **Context**: same-origin iframes, `about:blank` windows, `new Function` shims and `allow-scripts` +
  `allow-same-origin` all give full access (WIN-1, KRN-4, KRN-6). Separate domains aren't available on
  GitHub Pages. A blob Worker created by a same-origin page has the site's origin (NET-1).
- **Decision**: every app instance is `<iframe sandbox="allow-scripts allow-forms allow-modals
  allow-downloads" allow="fullscreen" allowfullscreen>`. Never `allow-same-origin`,
  `allow-top-navigation*`, `allow-popups-to-escape-sandbox` (the spike showed a popup of our own origin
  escapes with full storage), `allow-storage-access-by-user-activation`, and no `allow-popups` either.
  Per-manifest extras: `allow-pointer-lock` and `clipboard-write`. Workers are spawned inside the sandbox
  — classic Workers from the sandbox's own `blob:`/`data:` URLs, or module Workers from `data:` — so
  they're opaque too. External links go through `wos.openExternal(url)`: the kernel allows cross-origin
  http(s) only, with `noopener,noreferrer`.
- **Facts (spike, Chromium 153 — `testing/scripts/security/spike-*.mjs`)**: inside the sandbox,
  `parent`/`top` DOM, `top.platform`, IndexedDB, local/sessionStorage, cookies, SW registration,
  `caches`, `BroadcastChannel` to the top page, `top.location =` and `window.open` are all blocked. WASM,
  WebGL, RTCPeerConnection, `eval`, fullscreen, `alert` (with `allow-modals`) and downloads (with
  `allow-downloads`) work. `getUserMedia` fails in an opaque origin even with `allow="microphone"`.
  Third-party embeds nested in the sandbox inherit it and break (YouTube never starts). Every frame on
  the page can `postMessage` every other frame, so any `window` `message` listener that remains is attack
  surface and must check `e.source`.
- **Cost**: apps lose IndexedDB, localStorage, cookies and the service worker — persistence moves to the
  broker (D8). Mic and camera go through a kernel media relay (D8). Third-party embeds become kernel-owned
  embed frames outside the app's sandbox (D13).

## D4 — One privileged channel: a MessagePort per app instance
- **Context**: KRN-1 — a `window` `message` listener that serves raw fs to any sender, including other
  websites through popups, openers and embeds.
- **Decision**: the kernel creates a `MessageChannel` per app instance and posts one end to that
  iframe's `contentWindow` once, after its first `load`. Every request on that port runs with that
  instance's permissions. No privileged handler listens on `window` `message`. If the frame navigates
  again, that's a restart: the old port is closed and a new one issued with the same permissions. In the
  transition (phase 1) the legacy `wos-ipc` listener only answers frames the kernel registered, with that
  frame's ACL.
- **Cost**: synchronous APIs disappear for sandboxed apps (D8).

## D5 — Capabilities: manifests, deny-by-default, user grants
- **Decision**: each app has a manifest (`app.json`): `id`, `name`, `entry`, `icon`, `commands[]`,
  `fileTypes[]`, `window{width,height}`, `permissions[]`. The default scope is its own data dir
  `/home/user1/.local/share/<id>` (rw), `/tmp/<id>` (rw) and its own static files (r). More scope comes
  from permissions the user approves at install (`fs:read:/home/user1/Pictures`, `commands:call:<name>`,
  `net:<origin>`, `media:microphone`, …), and from **per-file grants**: when the user opens a file with an
  app, or picks one in a kernel file picker (powerbox), that instance gets exactly that path. System paths
  (I4) are kernel-only. Content from `/mnt/**`, downloads, received files and archives carries a
  provenance label and is never executable (D10).
- **Cost**: apps that browse the whole disk (file explorer, terminal) need explicit broad permissions —
  they're "system apps" in the manifest and the user sees that.

## D6 — One path policy, used everywhere
- **Context**: `..` traversal in the ACL (KRN-5), package install (BOOT-4), archive extraction (BOOT-8),
  WebRTC mounts (NET-3) and SSH mirrors (NET-4) — each hand-rolls path joins.
- **Decision**: one kernel helper: `normalizePath(p)` (resolve `.`, `..`, `//`; reject NUL, `\`, control
  characters), `isInside(base, p)` (segment-wise), `safeJoin(base, name)` (throws if the result escapes),
  `validName(n)` for names coming from peers, hosts and archives. vfs scripts that can't import it
  (`/bin/*.run`, app `main.js` files) use a small copy with the same tests.

## D7 — Code delivery into sandboxes
- **Facts (spike)**: opaque frames are never served by the service worker. A `src=/(sw)/…` navigation
  404s, and their subresources skip it. A parent's `blob:` URL can't be loaded inside the sandbox. Static
  files under `/public/mount/**` load fine with `Origin: null`, including full relative module graphs,
  because the dev server and GitHub Pages both send `Access-Control-Allow-Origin: *`. A srcdoc with
  `<base href="/public/mount/opt/apps/<id>/">` loads relative classic scripts, nested module imports and
  relative `fetch`. `data:` modules and an import map of absolute URLs → `data:` work, but a relative
  import inside a `data:` module doesn't.
- **Decision**:
  - *Static mode* — first-party apps shipped in `docs/public/mount/opt/apps/<id>/`. The kernel builds a
    srcdoc of `<base href="/public/mount/opt/apps/<id>/">`, the SDK, the handshake, then the entry HTML
    it fetched from the static copy. Code therefore always comes from the immutable deployed files, never
    the writable vfs copy, and the kernel controls what runs first.
  - *vfs mode* — installed and user apps. The kernel builds the srcdoc from the vfs files:
    - classic scripts and styles are inlined;
    - relative module imports are rewritten to absolute placeholder URLs (`http://wos.invalid/app/<id>/…`)
      and resolved by an import map to `data:` URLs;
    - images and media arrive as bytes over the port and become the sandbox's own `blob:null` URLs.
  - *Headless mode* — cron jobs, widgets, `initd` user hooks and systemd units run in hidden sandboxed
    frames with their own permissions.
  - srcdoc inherits the top document's CSP, so the top policy (D12) must stay a superset of what apps
    need. If that gets in the way, static mode switches to `src=/public/mount/…` with the app including
    the SDK `<script>` itself (this also works, per the spike).
- **Cost**: vfs apps' Workers must be `data:` URLs or the sandbox's own classic blob Workers; `new
  Worker('./x.js')` doesn't work in either mode.

## D8 — An async SDK (`wos`) replaces `window.platform` inside sandboxes
- **Decision**: the SDK (built from `src/sdk/` to `docs/`) offers promise-based APIs:
  - `fs.*` — read, write, list, stat, mkdir, rm, rename, batched `readdirStat`, and change events for
    granted paths.
  - `window.*` — `setTitle` (text only), `close`, `getBounds`/`setBounds` (numbers, clamped),
    fullscreen, action buttons, signals, `onMessage`.
  - `commands.call(name, ...args)` and `commands.register(name)`, inside the app's own namespace.
  - Per-app storage and secrets: `storage.*` and `secrets.*` (kept by the broker per app, NET-7, APP-8).
  - `dialogs.pickFile/pickFolder` (grant on pick), `notify`, `openExternal`, mesh pub/sub with channels
    namespaced by app id.
  - `media.getUserMedia(constraints)` — a kernel media relay. `getUserMedia` doesn't work in opaque
    origins, and a `MediaStreamTrack` can't be posted. So with the manifest permission and a user prompt,
    the kernel captures in the top document and relays the track to the sandbox over a loopback
    `RTCPeerConnection`. The spike showed the sandbox receives a live track it can add to its own
    connections (WebRTC voice calls).

  The existing `AppSDK` / `window.ipc` shapes keep working through a compatibility shim. There's no sync
  fs.
- **Cost**: the ~25 apps that use sync `getFS()` are rewritten to async (phase 3).

## D9 — Commands: declared, namespaced, never built from strings
- **Context**: KRN-2/KRN-3 — URL parameters and file names are pasted into `execCommand` source;
  KRN-10 — newest registration wins.
- **Decision**:
  - The registry records an owner (the registering module's platform name). A different owner can't
    replace a name, except a registration explicitly marked `fallback` (the `explorer` fallback in
    `src/remote.ts`).
  - Callers pass structured `{command, args}` and never generate DSL code: no `execCommand` call
    interpolates `${…}` (a static test enforces this).
  - `?app=` opens a command by validated name only; passing args — there or via `#open=` — requires
    `deepLink: true`. In phase 2 that flag comes from the manifest, not runtime meta.
- **Cost**: user-written DSL in `/etc/contextmenu.json`, crontab and `.run` files keeps working
  (user-authored code). It's never fed untrusted values, and it runs sandboxed in phase 2.

## D10 — Opening is not running
- **Decision**:
  - Double-click or "Open" views a file. `.js`/`.run` outside `/bin`, `/usr/bin`, `/opt/apps` open in the
    editor, and running needs an explicit Run plus a confirmation naming the file.
  - `.svg`/`.ico` open in the image viewer as `<img>`.
  - `.html` opens only in an opaque sandbox (`ui.sandboxed-app`), never same-origin.
  - Viewers of untrusted markup sanitise it, or render it in their own opaque frame.

## D11 — Service worker: vfs responses are data, never same-origin documents
- **Decision**:
  - Every `/(sw)/` and `/cache/` response gets `Content-Security-Policy: sandbox allow-scripts allow-forms
    allow-modals`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin` and an
    explicit type (default `application/octet-stream`).
  - Transitional exception (phase 1 only): iframe navigations to `/(sw)/opt/apps/**` stay same-origin
    until those apps move to static mode. Top-level navigations are always sandboxed.
  - File requests go to one registered kernel client and replies are bound to it (random ids, checked
    source).

## D12 — Top document hardening within GitHub Pages limits
- **Decision**:
  - A `<meta>` CSP in `docs/public/index.html`: `object-src 'none'; base-uri 'self'`, and script sources
    limited to self plus pinned CDNs. It's transitional: it keeps `'unsafe-eval'` until no vfs code runs in
    the top realm.
  - The bootstrapper refuses to boot inside a cross-origin frame and drops `window.opener`.
  - A kernel `window.open` wrapper forces `noopener,noreferrer` for cross-origin URLs.
  - The `__BOOTSTRAP_SCRIPT_PATH__` override is removed; `/remote.bundle.js` is fixed.
  - The server `meta.json` is authoritative: the vfs copy can't disable refresh, and sources must be
    same-origin `/public/mount/`.
  - CDN libraries are pinned to exact versions with SRI, or vendored into `docs/`.

## D13 — Peers and network content are untrusted by default
- **Decision**:
  - Joining a group needs the user's acceptance, and `autoMesh` is off by default.
  - Distributed Compute doesn't answer tasks until the user opts in for that group. Tasks run in an opaque
    sandboxed frame with `connect-src 'none'`.
  - System folders can't be shared read-write.
  - Names from peers and hosts are validated (D6).
  - Secrets (SSH, TURN, TOTP) live in broker-held per-app stores. Until phase 2 they at least stop living
    in origin-wide localStorage.
  - Third-party embeds (YouTube, fast.com, code-server, the Browser app) get their own restrictive
    `sandbox` today. After migration, a sandboxed app can't nest them (they inherit its opaque sandbox and
    break), so embeds become kernel-owned frames placed over the app's window via
    `wos.embed(url, rect)`. Cross-origin http(s) only, with `allow-scripts allow-same-origin
    allow-forms` (safe because the origin differs), never `allow-top-navigation` or
    `allow-popups-to-escape-sandbox`.

## D14 — Migration: fix the remote holes first, then sandbox app by app
- **Decision**:
  - **Phase 1** closes the remotely exploitable and zero-click holes with in-place fixes.
  - **Phase 2** builds the broker, the SDK, the sandboxed window type and the test harness.
  - **Phase 3** migrates apps in waves, smallest first, starting with the pilots that already use
    `AppSDK`. Each wave lands with tests.
  - **Phase 4** deletes the legacy paths: same-origin `ui.iframe` for vfs content, `window.platform`
    injection, `execString`/`execCommand` in the top realm, the `wos-ipc` window listener, the
    `window.fs`/`__wosHost` globals, and CSP `'unsafe-eval'`.

  Between phases, legacy same-origin hosting is allowed only for first-party code. Anything installed,
  received or user-authored is sandboxed as soon as phase 2 lands.
- **Cost**: the security guarantee (I1–I8) holds only after phase 4. Until then, the residual risk is
  "a bug in a first-party app", not "any file or peer".

## D15 — Project structure: rings, with `docs/` as the deploy root
- **Decision**: this replaces the legacy plan in [/TODO.md](../../TODO.md), whose files mostly exist
  but aren't wired in.
  - `src/kernel/` — ring 0: vfs, SW bridge, broker, sandbox host, path/permission policy.
  - `src/platform/` — ring 1: registries and namespaces, as kernel-internal state that is never exported
    on `window`.
  - `src/core/layout/` + `src/system/` — ring 2: the layout.
  - `src/sdk/` — the app-side SDK.
  - Apps — ring 3: `docs/public/mount/opt/apps/*`, `src/apps/*`.

  `docs/` stays the GitHub Pages root: bundles at `docs/*.bundle.js`, static app sources in
  `docs/public/mount/` served as-is, with no copy step. Dead code (`src/platform/exec-engine.ts`) is
  removed or rebuilt as the broker.

## D16 — Every finding gets a regression test
- **Decision**:
  - A Playwright suite lives in `testing/scripts/security/`, with a shared harness (`lib/harness.mjs`) and
    one script per finding group. The runner `run-all.mjs` prints a PASS/FAIL table keyed by finding ID.
  - Each test is shown red against the pre-fix code (`BASE_URL` pointed at a baseline worktree) and green
    after.
  - Static checks cover code-string generation, templated `innerHTML`, `allow-same-origin` on app
    sandboxes, and unpinned CDN URLs.
