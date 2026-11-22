# bootstrapper-js — project notes for LLM context

This file captures architecture/convention knowledge accumulated while working on this
repo, so a fresh session can be productive quickly. See `README.md` for the
user-facing overview.

## Big picture

A browser-based "web OS" (TypeScript + React + BrowserFS). On load it boots a virtual
filesystem in IndexedDB, then renders a desktop shell (layout, window manager, desktop
icons) and a set of bundled mini-apps that run inside iframe "windows".

- Build: webpack, output to `./docs` (also the GitHub Pages preview root).
- Dev server: `pnpm start` → `http://localhost:8080`.
- Build once: `npx webpack`. This is a **production** build (minified JS, production
  React), which is what `docs/` should hold. `pnpm start` builds in development mode.
  `optimization.minimize: { html: false }` keeps `docs/index.html` unminified, so its CSP
  `<meta>` stays readable and the KRN-11 check can parse it.
- Every build/watch first runs `scripts/gen-meta-manifest.mjs` (meta.json `sha256`/`when`/
  `app` annotations) and `scripts/gen-registry-integrity.mjs` (registry `sha256`s), via
  `ManifestHashesPlugin` in `webpack.config.js`. After editing a `docs/public/mount` file
  without a build, run `node scripts/gen-meta-manifest.mjs` (`--check` only verifies).
- The webpack build always prints one pre-existing, unrelated warning about
  `src/shared/babel.js` critical dependency expression — ignore it.
- Babel standalone lives **only in `remote.bundle.js`**. `src/shared/index.ts` doesn't
  import it; `remote.ts` hands it over with `provideBabel()`. Don't `require` it from any
  other entry, or every bundle grows by ~3 MB (it used to be in all of them, 49.6 MB total).

## Boot loading (what loads when)

The landing page (desktop) comes first, and everything else loads in the background after it.
`testing/scripts/perf/` measures this (`measure-boot.mjs`) and checks it (`test-boot-loading.mjs`).
- **Service worker.** `registerServiceWorker()` (`src/kernel/sw-bridge.ts`) waits for
  `clients.claim()` instead of reloading on a first visit, so the boot runs once. A page
  that loaded while the worker was activating, after its claim (e.g. reloaded during the
  first install), sends the active worker `sw/claim` on `navigator.serviceWorker.ready`.
  Don't wait for a worker `statechange` instead: it may already have happened. It reloads
  only as a last resort, at most once per session.
- **meta.json sync** (`bootstrapMetaFiles`, `src/kernel/vfs.ts`). It fetches meta.json with
  `no-cache`, then downloads only files that are missing or whose `sha256` differs from the vfs
  copy (a repeat visit downloads nothing but meta.json). `when: "boot"` entries are awaited,
  and `when: "background"` ones are synced after landing. A downloaded file whose hash doesn't
  match is refetched with `cache: 'reload'` (GitHub Pages caches for 10 minutes).
- **Default apps.** A fresh profile gets only the essential apps: File Explorer, Settings,
  Terminal, Spotlight, Audio Player and App Drawer, plus App Manager (installs everything else)
  and Image Viewer (the explorer opens images with it). Notepad and the dock are part of the
  shell. The default set is kept in three places: `installed.json`, `CORE_APPS` in
  `opt/apps/pkg-manager/loader.js` (loaded whenever their files exist, unless uninstalled) and
  meta.json's `/opt/apps/<id>/` entries. Every other registry app installs from App Manager.
  `testing/scripts/test-default-apps.mjs` checks this.
- **Apps install once.** Only *preinstalled* apps (in `docs/public/mount/etc/pkg/installed.json`)
  are in meta.json, marked `app: "<id>"`. Such a file is written only if it is missing and
  the app isn't in `uninstalled.json`; a meta.json change never overwrites it. Other registry
  apps are downloaded only when the user installs them in App Manager. To ship an app update,
  bump its `version` in `docs/registry.json` (App Manager offers "Update"). The generator's
  `SYSTEM_APPS` list is the exception: system apps are `force_reload`, refreshed on hash change.
- **Bundles.** In `src/modules/modules.json`, `preload: true` bundles (layout, iframe,
  file-explorer) load before the desktop, and the rest load after landing. `host.openWindow` on a
  command that a pending bundle will register waits for it (`setModulesPending`), not "not found".
- **Background work + spinner.** `src/kernel/background.ts`: `whenLandingReady()` (desktop
  rendered + idle), `trackBackground(work, label)` (shows the near-invisible 10px
  `#wos-background-spinner` at the bottom right while anything is pending). Apps reach them
  as `platform.host.whenLandingReady()` / `platform.host.trackBackgroundTask(work, label)`.
- **Verified vfs reads.** `src/system/static-code.ts` runs a system module (`/opt/window-manager.js`,
  `/opt/wm/*`, `/opt/desktop/*`, `menuItem.js`) from its vfs copy only if those exact bytes
  hash to the server's meta.json `sha256` (`host.metaSha256`, kernel closure state). Otherwise
  it fetches the immutable static copy. The D1 trust boundary is unchanged, and it saves a
  request per module.
- Lazy fetches: Spotlight fetches the registry the first time it opens.

## Security model (read before touching the kernel, app hosting or file opening)

Docs: `documentation/security/` — README (trust levels, invariants I1–I8), `audit.md`
(finding IDs such as KRN-1 / NET-1 used in code comments), `decisions.md` (D1–D16) and
`runtime-spec.md` (the phase-2 sandbox runtime). Plan and progress live in the root
`TODO.md`.

- **Trust boundary (D1).** Trusted code is what GitHub Pages serves from `docs/`: the
  bundles and the immutable `/public/mount/**` copies. **Nothing read from the vfs is
  trusted code.** Apps, peers, archives and drag-drop can all write it. Never add a code
  path that executes a vfs file in the top realm without the user's explicit Run.
- **Target (phase 2+).** Only the layout touches the top document. Every app runs in an
  opaque-origin `sandbox="allow-scripts …"` iframe, never `allow-same-origin`, and
  talks to a capability broker over a `MessagePort`. Until then, first-party apps still
  run same-origin, so treat every XSS in an app as a full compromise.
- **Hosting limits.** There are no response headers on GitHub Pages: the CSP is a
  `<meta>` in `docs/public/index.html` (keep it a superset of what inheriting frames
  need). Framing defence is a boot check in `src/index.ts`; a cross-origin parent means
  refuse to boot.
- **Service worker (D11).** Every `/(sw)/` and `/cache/` response carries `CSP: sandbox`,
  `nosniff` and `CORP` headers and a real type. The only transitional exemption is
  iframe loads under `/(sw)/opt/apps/**`. So a vfs HTML/SVG opened top-level, or framed
  anywhere else, runs opaque with no storage and no `window.platform`. Cache Storage is
  not used; the SW purges it.
- **Boot integrity.** The kernel is always `/remote.bundle.js`; there's no localStorage
  override. The server `meta.json` decides what is reloaded, and only same-origin
  `/public/mount/` sources are accepted. Its `sha256`s are recorded in kernel closure
  (`src/kernel/meta-hashes.ts`) and are never readable as vfs state apps could rewrite.
- **Peers / network.** Distributed Compute runs other peers' tasks only for groups the
  user opted into ("Run tasks for others"), inside a no-network, no-storage sandbox.
  WebRTC group invites need acceptance, and `autoMesh` defaults to off.
- **Tests.** `testing/scripts/security/`. `test-*.mjs` plus `run-all.mjs` is the
  regression suite, keyed by finding ID. `verify-*.mjs` are the per-owner checks from the
  phase-1 fixes. `spike-*.mjs` record browser facts; `spike-ipc-exploit.mjs` must
  report SAFE.

## Virtual filesystem

- BrowserFS 2.0, `MountableFileSystem` mounting `/`, `/tmp`, `/mnt` separately, each an
  IndexedDB-backed store mirrored behind an InMemory fs (`AsyncMirror`) for sync access.
- `defaultDirs` and the default-files bootstrap list live in `src/index.ts`. Default
  files are described in `docs/public/mount/meta.json` — each entry is
  `{ path, file, force_reload, sha256, when, app? }` (`sha256`/`when`/`app` are generated,
  see "Boot loading"):
  - `force_reload: true` → re-fetched from the server when its `sha256` differs from the vfs
    copy, overwriting any user edits (used for app/runtime files that aren't meant to be
    user-customized).
  - `force_reload: false` / absent → only written if the path doesn't already exist in
    the virtual fs (safe for user-editable config/content).
  - `app: "<id>"` → a preinstalled app's file: written once, never overwritten by boot.
  - Parent directories are created with `mkdirSync(..., { recursive: true })`
    automatically, so a dir doesn't need to be in `defaultDirs` for a meta.json file to
    land there (e.g. `/opt` is not in `defaultDirs` but `/opt/window-manager.js` works).
- `normalizePath()` (duplicated in `docs/public/mount/opt/apps/file-explorer/main.js` and
  `src/apps/file-explorer/index.tsx`) resolves `.`/`..`/`//` manually — don't use
  `fs.realpathSync`, it returns paths relative to the mounted filesystem's own root
  under `MountableFileSystem` (e.g. `realpathSync('/tmp')` → `/`, not the global path).

### "FHS-lite" vfs layout

The vfs loosely mirrors Linux's filesystem hierarchy. When adding a new system file,
follow these existing conventions (all bootstrapped via `meta.json`, all currently
`force_reload: true` except where noted):
- `/bin/*.run` — built-in shell commands (`ls.run`, `cp.run`, `cat.run`, ...), run via
  `execCommand`/the terminal.
- `/usr/bin/*.js` — small standalone scripts (e.g. `fullscreen.js`).
- `/usr/lib/ui/*.js` — shared UI snippets consumed by other vfs scripts (currently
  `menuItem.js`, a context-menu item template).
- `/usr/share/icons/*` — file-type icon images for the explorer's `extIconMap` (see
  "File-type icons" below).
- `/etc/wm/` — window manager config (`layouts.json`, `config.json`, `current.json`,
  `themes/*.json`).
- `/etc/crontab`, `/etc/widgets/*.js` — cron schedule and desktop widget scripts
  (`force_reload: false`, user-editable).
- `/opt/window-manager.js` — per-window behavior. Runs from the shipped static copy
  (`/public/mount/opt/window-manager.js`), never from the vfs, whose copy is view-only
  (see "Window manager appearance & behavior").
- `/opt/cron/*.js` — cron job scripts (`force_reload: false`).
- `/home/user1/` — user home: `initd.run` (boot script run by
  `initd`), user content dirs (`projects/`, `welcome/`). All apps live under
  `/opt/apps/<name>/` now (see below) — there is no more `/home/user1/apps/`.
- `/tmp`, `/mnt` — ephemeral / mounted-folder space, not part of `meta.json`.

Rule of thumb: files under `/usr`, `/etc`, `/opt`, `/bin` are "system" — not meant for
direct user editing (`force_reload: true`); files under `/home/user1` and `/etc/crontab`
/`/etc/widgets`/`/opt/cron` are user-editable (`force_reload: false`/absent).
`src/kernel/path-policy.ts` (`KERNEL_OWNED_PATHS`) is the security version of this rule:
`/bin`, `/boot`, `/etc`, `/opt`, `/usr`, `/meta.json`, `/.initd.run` and
`/home/user1/initd.run` are never writable through a namespace or the IPC bus.

### Storage backend switch (IndexedDB vs LocalStorage)

- `src/index.ts` resolves which backend to mount via `resolveFsBackend()`: reads the
  `__app_fs_backend__` localStorage key (default `'indexeddb'`), overridable/persisted
  via the `?fsBackend=indexeddb|localstorage` query param. A link that would *change*
  the backend asks for confirmation first, and the param is stripped from the URL
  (audit KRN-9).
  - `'indexeddb'` (default, GB-scale): `/`, `/tmp`, `/mnt` each `AsyncMirror` over
    IndexedDB (`createIndexedDBMirror`).
  - `'localstorage'` (~5-10MB, for accessing data saved by older app versions): `/` is
    a raw `LocalStorage` backend; `/tmp` and `/mnt` are `InMemory` (ephemeral, to avoid
    key collisions since LocalStorage has no namespacing).
  - Each backend is a completely separate filesystem — switching doesn't move/merge
    files.
- Settings → Storage → Default Files → **Force Reload** re-downloads every meta.json file.
  - **Source:** an optional field, prefilled with this site's `meta.json`; empty means this site.
    It accepts another site running this OS (its `/public/mount/meta.json` is used) or a
    `meta.json` URL, `https:` only (`http:` only for localhost). It's never saved, so nothing
    can pre-point it.
  - **Another source:** gets its own confirmation naming the origin. Entries are checked with
    the kernel's rules (no URLs / `..` / query characters; normalized targets), and sha256 is
    checked where given.
  - **What sticks:** the boot sync still restores this site's system files on the next start.
  - **Saving:** before reloading it waits on `fs.whenFlushed()` (`src/kernel/vfs.ts`: the
    AsyncMirror IndexedDB queues are empty). Use it whenever code reloads right after writing
    many files.
  - **Test:** `testing/scripts/test-force-reload-source.mjs`.
- Settings → "Storage" page (`docs/public/mount/etc/settings/08-storage.js`) lets the user pick a backend and reloads
  (`top.location.href` with the query param set) to apply it. Keep its
  `FS_BACKEND_STORAGE_KEY`/`FS_BACKEND_QUERY_PARAM` constants in sync with `src/index.ts`.
- **Gotcha (legacy data only)**: apps used to live at `/home/user1/apps/*.js` with
  `force_reload` absent, so a LocalStorage-backend fs from an old app version may still
  contain a stale copy of `/home/user1/apps/explorer.js` that never gets overwritten.
  If that stale copy calls `registerCommand("explorer", ...)` with an outdated
  implementation, it can shadow the real one. All apps now live under `/opt/apps/`
  (`force_reload: true`, always refreshed) — new installs are unaffected. A fallback
  `'explorer'` command still exists as a safety net — see Platform/Host section.

## Platform / Host architecture (`src/shared/index.ts`)

- `Platform.getInstance()` — per-module/per-script platform instance.
- `platform.host` — shared `Host` singleton:
  - `getFS()` — the virtual fs.
  - `exec(platform, filepath, ...args)` — **opens** a file (open policy, decisions.md D10).
    It only *runs* `.js`/`.run` in `/bin`, `/usr/bin` and `/opt/apps`. Scripts anywhere
    else open in Notepad, `.svg`/`.ico` in the image viewer, `.html` outside `/opt/apps`
    in the opaque `ui.sandboxed-app`, and other files in the extension's default handler.
    Defaults come from a fixed system table (`getViewerCommand`), and apps can't take them
    over.
  - `runFile(platform, filepath, args = [], { confirm })` — explicit **Run** of a
    `.js`/`.run`. Outside the system folders it `confirm()`s with the file name unless
    `confirm: false`, which is for callers that *are* the user's intent: the terminal,
    cron, the initd boot script.
  - `openWindow(commandName, ...args)` — structured open-window; args are values, never
    code.
  - `execString(source, filenameAlias, _platform?)` — Babel-transpiles
    (`env`+`react`+`typescript`, commonjs modules) and runs source via `new Function`,
    returns `module.exports`. This is how `.js` files in the virtual fs and dynamic
    "scripts" (the Settings page's `<script type="text/React-Jsx">`) get executed. Inside the
    executed code, `window` is a *shim* (`{ platform: newPlatform, document, top }`),
    not the real `window` — `window.platform` gives you a working `Platform` whose
    `.host` is the same shared `Host`. `Buffer` (Node polyfill) IS available as a bare
    global identifier here (e.g. `Buffer.from(arrayBuffer)`) even though it's not part
    of `window` shim — it resolves via the real global object, where webpack's
    polyfill installs it. Use `Buffer.from(...)`, not `new Uint8Array(...)`, when
    writing binary data with `fs.writeFileSync` — BrowserFS's `writeSync` calls
    `.copy()` on the data, which `Uint8Array` lacks but `Buffer` has.
  - `execCommand(commandStr, platform, ...args)` — runs a small DSL string with
    `service(moduleName, serviceName)`, `command(commandName)`, `$args` in scope (used
    for context-menu actions like
    `service('001-core.layout', 'open-window') (command('ui.notepad'), $args[0])`).
    **Never splice data into a DSL string** — no `${…}` in an `execCommand` argument
    (audit KRN-3: a crafted file name became code). Pass values as `$args`, or call
    `openWindow` / `callCommand` directly. `testing/scripts/security` has a static check
    for this.
  - `registerCommand(name, callback, meta)` / `getCommand` / `callCommand`. Each
    registration records its **owner** (the registering platform's name; `forPlatform()`
    gives every `execString` script and first-party page its own). A different owner
    can't replace an existing name unless the active registration has
    `meta.fallback: true` (audit KRN-10).
  - `pathPolicy` — `normalizePath`, `isInside`, `isValidName`, `safeJoin`,
    `isKernelOwned`, `isValidAppId` (`src/kernel/path-policy.ts`, unit-tested). Use these
    for every path built from untrusted input: archive entries, peer listings, package
    `dest`, SSH names.
  - `registerIpcFrame(win, {id, events, fs})` — the only way a frame gets to use the
    `wos-ipc` bus (`src/kernel/ipc-bus.ts`, `/usr/lib/ipc.js`). Unregistered senders get
    no reply. Frame owners must unregister when the frame navigates.
  - `hardenWindow(win)` — a cross-origin `win.open()` gets `noopener,noreferrer`.
- `platform.register(name, value)` / `platform.getService(moduleName, serviceName)` —
  cross-module service registry.
- `UserPreference` — reads/writes `/user-preferences.json` (wallpaper, etc.).
- `src/remote.ts` registers a fallback `'explorer'` command (delegates to the always-
  available compiled `ui.file-explorer` command) at boot, before `initd.run` runs.
  `docs/public/mount/opt/apps/file-explorer/main.js` registers its own `'explorer'`
  command later, when `pkg-manager/loader.js` loads it as a `CORE_APP`, and takes
  precedence when present (allowed because the fallback is registered with
  `fallback: true`). The fallback only matters for the brief window before that loads,
  or if it's ever missing (see Storage backend switch gotcha above).

## Layout & window manager (`src/core/layout/index.tsx`, `src/core/window-manager.ts`)

### Layouts (desktop arrangement presets)

- Config lives in virtual fs under `/etc/wm/` (standard Linux config location):
  - `/etc/wm/layouts.json` — array of `LayoutDef` `{id, name, grid: {areas, columns,
    rows}, commands: {slot, vertical, align}}`. Falls back to `DEFAULT_LAYOUTS` in code
    if missing/invalid.
  - `/etc/wm/config.json` — `{ "layout": "<id>" }`, the active layout.
- `layoutSubject` (rxjs `BehaviorSubject`) makes layout switches reactive without
  remounting. `set-layout` command (both `platform.register` and
  `platform.host.registerCommand`) writes config + pushes to the subject.
- `LayoutShell` renders only the grid-area `<div>`s (`header`/`left-nav`/`right-nav`/
  `footer`/`content-area`) that actually appear in the active layout's
  `grid-template-areas`. **Important CSS Grid gotcha**: rendering unused
  `grid-area` divs makes them unassigned grid items → extra implicit rows/columns →
  layout overflow (this caused the "windows bottom bar footer cropped" bug). Always
  compute `usedAreas` from `grid.areas.match(/[\w-]+/g)`.
- `.content-area` needs `min-height: 0; min-width: 0; overflow: hidden` — grid items
  default to `min-height: auto`, which lets intrinsic content size override `1fr`
  track sizing otherwise.
- Settings UI: "Layout" page (`/etc/settings/05-layout.js`), lists layouts from
  `/etc/wm/layouts.json`, calls `platform.host.callCommand('set-layout', id)`.

### Window manager appearance & behavior

Split into two halves on purpose:

1. **Appearance** (colors, border radius, blur, shadow, accent) — compiled TS, applied
   as CSS custom properties on `document.documentElement` so both existing and new
   windows update live:
   - Active settings live in `/etc/wm/current.json` (`{name?, appearance: {...},
     behavior: {...}}`), with `DEFAULT_WM_SETTINGS` fallback in
     `src/core/layout/index.tsx`. **All edits write only to `current.json`** —
     `current.json` is the single source of truth read at runtime.
   - Presets live as individual files in `/etc/wm/themes/` (e.g. `default.json`,
     `dark.json`, `light.json`, `ocean.json`, `sunset.json`), each the same
     `{name, appearance, behavior}` shape.
   - `ensureWmCurrent()` seeds `current.json` on startup if missing: tries
     `WM_DEFAULT_THEME_PATH` (`/etc/wm/themes/ocean.json` — the default theme), then
     any other `.json` file in `/etc/wm/themes/`, then falls back to in-code
     `DEFAULT_WM_SETTINGS`.
   - `applyWmSettings(settings)` sets `--wm-header-bg`, `--wm-header-color`,
     `--wm-window-bg`, `--wm-accent`, `--wm-radius`, `--wm-blur`, `--wm-shadow` on
     `:root`. `.window`, `.window-header`, `.window.top` CSS rules consume these via
     `var(--wm-*, fallback)`.
   - Commands (register + host.registerCommand):
     - `set-window-manager-settings` — writes given settings to `current.json` and
       re-applies CSS vars.
     - `set-window-manager-theme(themeId)` — copies `/etc/wm/themes/<themeId>.json` into
       `current.json` and re-applies CSS vars.
     - `get-window-manager-themes` — lists `{id, name, appearance}` for each file in
       `/etc/wm/themes/`.

2. **Behavior** (event wiring per window) — `/opt/window-manager.js`, plus the
   window-style modules `/opt/wm/<id>.js`, the desktop variants `/opt/desktop/<id>.js` and
   `/usr/lib/ui/menuItem.js`. `src/system/static-code.ts` loads each once and evaluates it
   on first use, so `createWindow` stays synchronous. It loads the vfs copy only when its
   bytes match the server's meta.json `sha256`, and otherwise the **immutable static copy**
   (`/public/mount<path>`). The window manager preloads the base module and the
   *selected* style only. Ids must be in the shipped lists. Until the load lands, or if
   it fails, compiled defaults apply. Editing the vfs copy has **no effect**: a changed
   copy fails the hash check and the static one is used (audit WIN-6/BOOT-5: a one-time vfs
   write used to persist top-realm code). To
   change behavior, edit the file under `docs/public/mount/` and redeploy. It exports:
   - `DEFAULT_SETTINGS`, `readSettings()` (reads `/etc/wm/current.json`).
   - `setupWindow({ container, head, iframe, command, settings, toggleFullScreen,
     moveOnTop })` — called once per new window; currently wires up
     `behavior.dblClickHeaderFullscreen` (double-click header toggles fullscreen) and
     `behavior.bringToFrontOnClick` (mousedown anywhere in window brings it to front).
   - If the file is missing or throws, `window-manager.ts` falls back to a small inline
     `FALLBACK_WM_SETTINGS` default and skips `setupWindow`.

**Window materials.** An app can ask its window for a fixed look with
`props.setWindowMaterial(name)`, where name is one of `WINDOW_MATERIALS`
(`src/core/window-manager.ts`). It becomes a `material-<name>` class on the container,
styled in `src/core/layout/styles/window.ts`. Apps pick a name, never supply CSS. `glass`
is the spatial (visionOS-like) frosted material: a strong backdrop blur, a neutral dark
tint and a light rim, independent of the WM theme so white text stays readable. It also sets a
22px radius (`--glass-radius`) and makes a glass window's title bar transparent. A theme can
override `--glass-window-bg`, `--glass-blur`, `--glass-shadow` and `--glass-radius` on `:root`
(plus the `-light` variants below).

**Appearance (light / dark).**
- The user picks a mode in Settings › Window Manager › Themes: System (default), Dark, Light or
  Time. Time is light 07:00–19:00 (`DAY_START_HOUR`/`DAY_END_HOUR`) and dark otherwise.
- `src/system/appearance.ts` (started in `remote.ts`) stores the mode as `appearance_mode` in
  `/user-preferences.json`. It resolves the mode (System follows `prefers-color-scheme`; Time is
  re-checked every minute) and sets `data-appearance="light|dark"` on the desktop document, so
  `.window.material-glass` gets a light variant there. It also publishes the result on
  `platform.host.appearance$` / `getAppearance()`. Commands: `get-appearance-mode`,
  `set-appearance-mode(mode)` (unknown modes are refused).
- The value lives at module level in `src/shared/index.ts`, not on a Host instance: every module
  window has its own Host (all built in `remote.ts`), and an instance field wouldn't be shared.
- A glass app subscribes to `appearance$` and sets `data-appearance` on its own document. Its
  `--vs-*` tokens have a `:root[data-appearance="light"]` set (Settings `main.html`, both
  explorer copies). `testing/scripts/test-appearance.mjs` covers all of this.

Settings → "Window Manager" page (`/etc/settings/06-window-manager.js`) is the one place for
window looks. It shows clickable theme cards (swatch preview from each theme's
`appearance`, active one matched by `current.json`'s `name`), color pickers / sliders /
checkboxes that write straight to `current.json`, and "Save as Theme", which writes
`/etc/wm/themes/<slug>.json` and refuses names that are taken. Settings → "Managers"
(`20-managers.js`) picks the components instead: title bar style, dock and desktop icons.
Don't add theme or color controls there (it used to duplicate them). Deeper behavior
customization means editing `docs/public/mount/opt/window-manager.js` in the repo (the
shipped copy); the vfs copy is view-only.

## File explorer (macOS Finder-style UI)

Two **parallel, hand-kept-in-sync** implementations (no shared module — this is the
established convention in this repo, mirroring how `/opt/window-manager.js` vs.
compiled TS are kept separate):

- `docs/public/mount/opt/apps/file-explorer/main.js` — **the active runtime file
  explorer**. Loaded as the first entry in `CORE_APPS`
  (`docs/public/mount/opt/apps/pkg-manager/loader.js`), so it registers the `explorer`
  command on every boot and (registrations are prepended) takes precedence over the
  fallback below. This is what actually renders when you open "Files" from the desktop.
  Local component name `ListDirConponent` (typo preserved intentionally — it's this
  file's own copy, distinct from `desktop.tsx`'s `ListDirComponent`).
- `src/apps/file-explorer/index.tsx` — compiled TS/TSX counterpart, registers
  `ui.file-explorer`, kept structurally in sync with `main.js` above. Reached via
  `src/remote.ts`'s fallback `'explorer'` command registration (a safety net for before
  `main.js` loads, or if it's ever missing) and via direct `ui.file-explorer` calls
  (layout icon map, "Open in explorer" context-menu actions). Has its own local
  `ListDirComponent` (correctly spelled) — also a separate copy, not the one from
  `./desktop`.
- `src/apps/file-explorer/desktop.tsx` exports the `ListDirComponent` used for **desktop
  icons** (rendered by `LayoutShell` in `src/core/layout/index.tsx`) — a third, distinct
  usage. Its `.desktop-icons` class must stay `height: 100%` (not `100vh`) to avoid
  overflowing the grid's `content-area` track.

### File-type icons

The icon images used for `extIconMap` (per-extension file icons, e.g. `.js`, `.json`,
`.run`, folders, the generic/invalid-file icon) live in the virtual fs under
`/usr/share/icons/` (bootstrapped via `meta.json` entries with `force_reload: true`,
sourced from `docs/public/mount/usr/share/icons/*`, mirroring the existing
`/usr/lib/ui/menuItem.js` "system dir" convention) rather than as `/public/*.png`
webpack static assets.
- In `main.js` and `index.tsx` (which render inside an `about:blank` iframe, so
  `/(sw)/...` sub-resource URLs don't reach the SW — same reason thumbnails use blob
  URLs), `extIconMap` maps extensions to `/usr/share/icons/...` vfs paths, and a
  mount-only `useEffect` (`[]` deps) reads each via `fs.readFileSync` and converts to a
  blob URL (`iconUrls` state), revoked on unmount.
- In `desktop.tsx` (renders in the main document, which the SW does control),
  `extIconMap` instead references `/(sw)/usr/share/icons/...` directly — no blob-URL
  conversion needed there.

Both explorer copies share the same spatial glass look (glass window material, light/dark via
`appearance$`, the same `--vs-*` tokens as Settings, round glass toolbar buttons, a capsule path
bar, pill selection in the sidebar and grid). Keep the token block identical in both files:
- Toolbar: round glass back/forward/up buttons (history-stack based; `chevron_left`/
  `chevron_right`/`arrow_upward`, aria-labels back/forward/up) and a clickable breadcrumb path
  bar (`getBreadcrumbs()`) in a recessed capsule.
- Sidebar: "FAVORITES" section (`NAV_SHORTCUTS` = Home `/home/user1`, Mounted `/mnt`,
  Root `/`), lighter-pill active highlight.
- Content: icon grid, single-click selects (pill highlight), double-click opens
  (`.file-item`/`.file-item.selected`).
- Status bar `.file-explorer-status` at the bottom (`margin-top: auto` so it sticks to
  the bottom of a flex column even with few items).

### Drag and drop

Both explorer copies support dragging files in two directions, implemented in `App`
(handlers: `moveEntry`, `importDroppedEntry`/`importDroppedFile`, `importExternalDrop`,
`handleDragOver`, `handleDrop`) and wired up in `ListDirConponent`/`ListDirComponent`:

- **Within/between explorer windows** — every `.file-item` is `draggable`; `onDragStart`
  puts the item's vfs path in `dataTransfer` under the custom MIME type
  `application/x-vfs-path`. Dropping onto a folder `.file-item`, the file-list
  background (`<main>`, drops into the current dir), or a sidebar `NAV_SHORTCUTS` item
  calls `handleDrop`, which detects this MIME type and does `fs.renameSync` (with an
  `isDescendantOrSame` guard against moving a folder into itself/its own descendant,
  and an overwrite-confirm if the destination name already exists). Native HTML5 DnD
  works across iframes/windows in the same page, so this works between two explorer
  windows.
- **From the user's computer** — same drop handlers; if `dataTransfer` has no
  `application/x-vfs-path`, `importExternalDrop` reads `dataTransfer.items`, calling
  `webkitGetAsEntry()` for `FileSystemFileEntry`/`FileSystemDirectoryEntry` (recursing
  into directories via `entry.createReader().readEntries()`), falling back to
  `dataTransfer.files` if `webkitGetAsEntry` isn't available.
- `.file-item.drag-over` / `.${DESKTOP_CONTAINER_CLASS}-files.drag-over` CSS classes
  (dashed blue outline) highlight the current drop target.
- Drop targets call `event.preventDefault()`/`stopPropagation()` in `handleDragOver`/
  `handleDrop` so a drop on a folder item doesn't *also* fire the background drop on
  `<main>`.

When changing one explorer file's structure/behavior, mirror the change in the other.

## Terminal (`docs/public/mount/opt/apps/terminal/main.html`)

- xterm.js 5.3.0 from `https://unpkg.com/xterm/lib/xterm.js`, DOM renderer (no canvas
  addon — was tried and reverted, see below), `convertEol: true`.
- `TerminalApp` manages multiple tabbed `TerminalSession`s. Each session's
  `initializeTerminal()` is `async`: calls `terminal.open()`, then `resizeTerminal()`,
  then `await`s the initial `processCommand('info')` banner (guarded by a `busy` flag)
  before `displayPrompt()`.
- **`terminal.resize()` must never be called before `terminal.open()`** — doing so
  permanently corrupts the buffer once it scrolls (overlapping/leftover text from
  earlier rows). `TerminalApp.activate(session)` guards `resizeTerminal()`/`focus()`
  behind `if (session.terminal.element)`, and `addTab()` calls `initializeTerminal()`
  (which resizes after `open()`) before focusing.
- `window.__terminalApp` exposes the `TerminalApp` instance for test introspection.
- **Known remaining cosmetic bug**: after an async command (e.g. `sleep 1`) causes the
  terminal to scroll, one row can briefly show leftover/overlapping text from a row
  that scrolled past. Left unfixed per explicit instruction — revisit only if asked.

## Deep links (`src/kernel/deeplink.ts`, `/usr/bin/deeplink.js`)

URL hash `#open=<command>&app=<appId>&arg=<string>` opens a command with a string arg (used for
WebRTC invite/answer links). Two halves:
- **Pre-boot** (`src/index.ts`, `tryHandoffDeepLink`): if the hash has a link, ask other tabs over
  `BroadcastChannel('wos-deeplink')`; if one acks, this tab shows "Opened in your other tab" and doesn't boot.
- **Post-boot** (`/usr/bin/deeplink.js`, run from `initd.run` after the pkg loader): receives handoffs and
  handles this tab's own hash (consumed via `history.replaceState`). Waits for `.content-area` before
  `open-window` (it silently no-ops until the desktop is mounted).
- **App not installed** (`app=<id>` names an app missing from `installed.json`, e.g. a WebRTC invite
  sent to a new user): App Manager opens filtered to that app, with a toast. Nothing installs because of
  a link. If the user clicks Install, the link carries on as soon as the command registers (it waits up
  to 15 minutes).
- **Opt-in security**: a command is reachable only if its `registerCommand` meta has `deepLink: true`;
  optional `hasDeepLinkTarget()` / `onDeepLink(arg)` route the link to a running window instead of a new one.
  Names are regex-validated, `arg` is capped, and passed only as `$args` (never interpolated).
- `ui.iframe` only treats `/`-prefixed strings as vfs paths, so apps needing `?query` params pass an absolute
  `origin/(sw)/...?x=y` URL (the SW ignores the search part).

## Runtime vfs mounts (`FS.mount`/`FS.umount`/`FS.createBackend`, added in `src/kernel/vfs.ts`)

The top-level `fs` (== `platform.host.getFS()`, one object shared across every same-origin
iframe) gained three extra methods beyond BrowserFS's normal Node-`fs`-like surface:
- `fs.mount(path, backend)` / `fs.umount(path)` — thin wrappers around the real, boot-time
  `MountableFileSystem`'s own `.mount()`/`.umount()` (BrowserFS 2.0 supports grafting backends in
  after `initialize()`; the mount point auto-appears in its parent's `readdirSync` via the
  library's own internal bookkeeping — no manual placeholder directory needed).
- `fs.createBackend(name, opts)` — Promise-wrapped `window.BrowserFS.FileSystem[name].Create(...)`
  (e.g. `'InMemory'`), for building a new backend to mount.
Used by the WebRTC app (see "Mounting a remote folder" in `documentation/apps/webrtc.md`) to graft
a remote peer's shared folder into `/mnt/webrtc/<label>` as a real, synchronous, editable
filesystem — every existing app (file explorer, notepad, terminal) reads and writes it exactly
like any local folder, no special-casing anywhere else in the codebase.

### Lazy remote mounts and `vfs:changed` (Remote Machines, `/mnt/ssh/<machine>`)

Remote Machines (`docs/public/mount/opt/apps/remote-machines/`) mounts each connected SSH machine at
`/mnt/ssh/<name>` with the same `FS.mount` + `InMemory` + `Object.create(mem)` wrapper technique, but
*lazily* (a whole disk can't be cloned): folders are listed when an app reads them and one level ahead;
files are placeholders whose `statSync` reports the remote size until fetched, and a read of an
unfetched one throws `EAGAIN` (never wrong bytes) while it downloads. Writes go through `openSync`
(BaseFileSystem routes `readFileSync`/`writeFileSync`/`appendFileSync` there) and are pushed to the
machine in order. **Gotcha:** BaseFileSystem's truncating `openSync` calls `this.unlinkSync` first, so
the wrapper's `openSync` must call `mem.openSync` directly or every save would become a remote delete.
Since a lazy backend can't block, it announces finished listings/downloads with
`window.top.dispatchEvent(new CustomEvent('vfs:changed', { detail: { path } }))`; both explorer copies
(`opt/apps/file-explorer/main.js` and `src/apps/file-explorer/index.tsx`) re-read the folder they show
when the change is in it, is it, or is its parent. Any future async-backed mount can use the same event.
Details: `documentation/apps/remote-machines.md`.

## Modal width vs. a CSS Grid overlay (webrtc app, `openModal`)

`.overlay` (the backdrop behind every modal in `docs/public/mount/opt/apps/webrtc/main.html`) is
`display:grid; place-items:center`. `place-items:center` sizes the grid track to the item's
max-content width rather than the viewport — so a modal's `width: min(100%, Xpx)` doesn't actually
clamp to the window once its content (e.g. a wrapping toolbar) *wants* to be wider than the window:
"100%" resolves against that content-sized track, not the real viewport, and the modal silently
overflows the window's edge. Anchor to the real viewport instead: `min(calc(100vw - 28px), Xpx)`.
Affects any sufficiently wide modal content, not just one call site — fixed once in `openModal`.

## Testing conventions

- **Never run ad-hoc test scripts from `/tmp`** — create them in the repo (now under
  `testing/scripts/`), run them, and keep them (don't delete) unless told otherwise.
  Screenshots go in `testing/screenshots/`.
- Playwright: `import { chromium } from 'playwright'` — it is a devDependency, so
  `pnpm install` makes the bare import work.
- A first visit no longer reloads for the service worker. Wait for
  `.vfs-desktop-icon` after `goto()`, then wait for `#wos-background-spinner` to lose
  `.active` before relying on background-loaded apps or bundles. Older scripts that
  reload twice after `goto()` still work, just more slowly.
- Only the default apps are in the vfs. A test that needs another registry app installs
  it first: `ensureApp(page, id, command)` (`security/lib/harness.mjs`) or
  `installApp(page, id)` (`verify-viewers-lib.mjs` / `verify-files-lib.mjs`). `bootOS()`
  (`security/spike-lib.mjs`, behind every `verify-*` script) installs `LEGACY_TEST_APPS`, the
  apps that were preinstalled before the cut, as a preinstall would, unless called with
  `{ legacyApps: false }`. Tests of the real defaults (`test-default-apps.mjs`,
  `perf/test-boot-loading.mjs`) don't use it.
- To test like GitHub Pages (production build, 10-minute cache headers), serve `docs/` with
  `node testing/scripts/perf/static-server.mjs <port>`. Then run
  `node testing/scripts/perf/run-regressions.mjs <port> [--jobs 3] [filter-regex]`: every
  `security/verify-*.mjs`, the app tests and the boot-loading test, with one line per
  script. Use `BASE_URL=http://localhost:<port> node testing/scripts/security/run-all.mjs
  <label>` for the finding-keyed suite.
- Windows render inside `<iframe>` elements; `page.frames()` returns many transient
  `about:blank` frames. To find the right one, search `page.frames()` for a frame whose
  `.locator('text=...')` count is > 0 — and **re-run this search after any action that
  re-renders the iframe's React tree** (frame references found before a click/state
  change can stop matching afterward).
- In headless mode, the draggable `<iframe class="draggable">` overlay intercepts
  pointer events — use `{ force: true }` on `click`/`dblclick`.
- For xterm.js content, don't read `.xterm-rows` innerText (breaks if a canvas/webgl
  renderer is ever used) — use the buffer API via `window.__terminalApp` instead:
  `session.terminal.buffer.active.getLine(i).translateToString(true)` for each `i` in
  `0..buf.length`.
- After verifying, stop the dev server: `pkill -f "pnpm start"` /
  `pkill -f "webpack serve"`.

## Misc gotchas

- **`src/sw.ts` `/(sw)/<path>` and `/cache/<path>` handlers must `decodeURIComponent()`
  the path slice** before sending it to the page (`postMessage` `fs/file-request`) for
  `fs.readFileSync`. `URL.pathname` keeps percent-encoding (e.g. spaces as `%20`), but
  vfs paths from `fs.readdirSync`/`fs.statSync` have literal characters — without
  decoding, any file whose name has a space or other encoded character fails
  `fs.existsSync` in `src/index.ts`'s `fs/file-request` handler, the SW's error
  fallback does `fetch(_url.pathname.slice('/(sw)'.length))` (i.e. the bare un-prefixed
  path, which 404s since it isn't a real static file) instead of the original
  `/(sw)/...` URL. This bit drag-and-dropped files with spaces in their names (e.g.
  `5C27-EN - Detailed version.jpg`).
- Material Symbols Outlined icon font is loaded from Google Fonts CDN and re-declared
  via `@font-face`/`.material-symbols-outlined` in several stylesheets (layout, both
  explorer copies) — keep consistent if editing.
- **Settings app** (`/opt/apps/settings/main.html`; the old `/home/user1/settings.html` copy is
  gone). Every sidebar section is a script in `/etc/settings/NN-name.js`, loaded in file-name
  order each time Settings opens. A script must register under its file name without `.js`
  (`registerSection('05-layout', …)`), because that's how a reopen knows it's loaded.
  `registerSettingsSection` keeps one entry per name (registering again replaces it), so a
  mismatch costs a re-run, never a duplicate. To retire a section, delete its file and its
  meta.json entry, and add its name to `RETIRED_SECTIONS` in `main.html` (older vfs copies
  stay on disk). `testing/scripts/test-settings-sections.mjs` checks the sidebar.
- **Settings look** (spatial glass). The window uses `setWindowMaterial('glass')`, and the page is
  transparent with white text. Colors, fills and radii come from the `--vs-*` tokens at the top of
  the stylesheet in `main.html`: text levels `--vs-text/-2/-3`, platters `--vs-fill/-2/-3`, fields
  `--vs-recessed`, rims `--vs-stroke`, and `--vs-radius-*`. Section scripts should use those
  tokens (`'var(--vs-fill)'`), not hard-coded light colors. Checkboxes render as switches and
  buttons as capsules. Don't set `color-scheme: dark` in the page: a color scheme different
  from the desktop's makes Chrome paint the iframe opaque.
- Settings → "Wallpaper" page: in addition to the `wallpapers` list in
  `/user-preferences.json`, an optional `wallpapers_dir` vfs path (set via "Set
  Wallpapers Folder" / `UserPreference.getWallpapersDir`/`setWallpapersDir`, command
  `set-wallpapers-dir`) is scanned for image files and shown in the same grid
  (de-duped against `wallpapers`, referenced as `/(sw)<dir>/<name>`). Picking a folder
  uses `FilePicker`'s `mode="folder"` (lists only directories; footer button selects
  the currently open `dir` instead of a clicked file). Right-click "Delete" only
  removes wallpapers from the `wallpapers` list/preferences (never deletes the
  underlying file — folder-sourced images have no delete action since they aren't in
  the list).
