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
- Build once: `npx webpack`.
- The webpack build always prints one pre-existing, unrelated warning about
  `src/shared/babel.js` critical dependency expression — ignore it.

## Virtual filesystem

- BrowserFS 2.0, `MountableFileSystem` mounting `/`, `/tmp`, `/mnt` separately, each an
  IndexedDB-backed store mirrored behind an InMemory fs (`AsyncMirror`) for sync access.
- `defaultDirs` and the default-files bootstrap list live in `src/index.ts`. Default
  files are described in `docs/public/mount/meta.json` — each entry is
  `{ path, file, force_reload }`:
  - `force_reload: true` → always re-fetched from server on boot, overwriting any user
    edits (used for app/runtime files that aren't meant to be user-customized).
  - `force_reload: false` / absent → only written if the path doesn't already exist in
    the virtual fs (safe for user-editable config/content).
  - Parent directories are created with `mkdirSync(..., { recursive: true })`
    automatically, so a dir doesn't need to be in `defaultDirs` for a meta.json file to
    land there (e.g. `/opt` is not in `defaultDirs` but `/opt/window-manager.js` works).
- `normalizePath()` (duplicated in `explorer.js` and `src/apps/file-explorer/index.tsx`)
  resolves `.`/`..`/`//` manually — don't use `fs.realpathSync`, it returns paths
  relative to the mounted filesystem's own root under `MountableFileSystem` (e.g.
  `realpathSync('/tmp')` → `/`, not the global path).

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
- `/opt/window-manager.js` — per-window behavior, re-read on every `createWindow`
  (see "Window manager appearance & behavior").
- `/opt/cron/*.js` — cron job scripts (`force_reload: false`).
- `/home/user1/` — user home: `apps/` (explorer, terminal, etc.), `settings.html`,
  `initd.run` (boot script run by `initd`), user content dirs (`projects/`, `quotes/`,
  `tools/`, `welcome/`).
- `/tmp`, `/mnt` — ephemeral / mounted-folder space, not part of `meta.json`.

Rule of thumb: files under `/usr`, `/etc`, `/opt`, `/bin` are "system" — not meant for
direct user editing (`force_reload: true`); files under `/home/user1` and `/etc/crontab`
/`/etc/widgets`/`/opt/cron` are user-editable (`force_reload: false`/absent).

### Storage backend switch (IndexedDB vs LocalStorage)

- `src/index.ts` resolves which backend to mount via `resolveFsBackend()`: reads the
  `__app_fs_backend__` localStorage key (default `'indexeddb'`), overridable/persisted
  via the `?fsBackend=indexeddb|localstorage` query param.
  - `'indexeddb'` (default, GB-scale): `/`, `/tmp`, `/mnt` each `AsyncMirror` over
    IndexedDB (`createIndexedDBMirror`).
  - `'localstorage'` (~5-10MB, for accessing data saved by older app versions): `/` is
    a raw `LocalStorage` backend; `/tmp` and `/mnt` are `InMemory` (ephemeral, to avoid
    key collisions since LocalStorage has no namespacing).
  - Each backend is a completely separate filesystem — switching doesn't move/merge
    files.
- Settings → "Storage" page (`docs/public/mount/home/user1/settings.html`,
  `StorageSettings` component) lets the user pick a backend and reloads
  (`top.location.href` with the query param set) to apply it. Keep its
  `FS_BACKEND_STORAGE_KEY`/`FS_BACKEND_QUERY_PARAM` constants in sync with `src/index.ts`.
- **Gotcha**: a LocalStorage-backend fs may contain a *stale* copy of
  `/home/user1/apps/explorer.js` from an older app version (it has `force_reload`
  absent, so it's never overwritten). If that stale copy doesn't call
  `registerCommand("explorer", ...)`, every `command('explorer')` call (opening a
  folder, desktop "Explorer" context menu) throws an uncaught `Command: [explorer] not
  found`. Mitigated by a fallback `'explorer'` command — see Platform/Host section.

## Platform / Host architecture (`src/shared/index.ts`)

- `Platform.getInstance()` — per-module/per-script platform instance.
- `platform.host` — shared `Host` singleton:
  - `getFS()` — the virtual fs.
  - `exec(platform, filepath, ...args)` — opens a file with the right app based on
    extension (`.js` → `execString`, `.run` → `execCommand`, others → registered UI
    command via `appExtMap`).
  - `execString(source, filenameAlias, _platform?)` — Babel-transpiles
    (`env`+`react`+`typescript`, commonjs modules) and runs source via `new Function`,
    returns `module.exports`. This is how `.js` files in the virtual fs and dynamic
    "scripts" (settings.html `<script type="text/React-Jsx">`) get executed. Inside the
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
    `service('001-core.layout', 'open-window') (command('ui.notepad'), '/path')`).
  - `registerCommand(name, callback, meta)` / `getCommand` / `callCommand`. New
    registrations are *prepended*, and `command(name)`/`getCommand` use `.find()`, so
    the most-recently-registered command with a given name wins.
- `platform.register(name, value)` / `platform.getService(moduleName, serviceName)` —
  cross-module service registry.
- `UserPreference` — reads/writes `/user-preferences.json` (wallpaper, etc.).
- `src/remote.ts` registers a fallback `'explorer'` command (delegates to the always-
  available compiled `ui.file-explorer` command) at boot, before `initd.run` runs.
  The real `/home/user1/apps/explorer.js` registers its own `'explorer'` command later
  via `initd.run` and (being prepended) takes precedence when present — the fallback
  only matters if that file is missing/stale/fails to register one (see Storage backend
  switch gotcha above).

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
- Settings UI: `/home/user1/settings.html` → "Layout" page, lists layouts from
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

2. **Behavior** (event wiring per window) — lives in the virtual fs at
   `/opt/window-manager.js` and is **re-read + re-executed via `execString` every time
   `WindowManager.createWindow()` runs** (in `src/core/window-manager.ts`). This means
   editing `/opt/window-manager.js` through the file explorer's "Edit" action changes
   behavior for windows opened *after* the edit, with no rebuild. It exports:
   - `DEFAULT_SETTINGS`, `readSettings()` (reads `/etc/wm/current.json`).
   - `setupWindow({ container, head, iframe, command, settings, toggleFullScreen,
     moveOnTop })` — called once per new window; currently wires up
     `behavior.dblClickHeaderFullscreen` (double-click header toggles fullscreen) and
     `behavior.bringToFrontOnClick` (mousedown anywhere in window brings it to front).
   - If the file is missing or throws, `window-manager.ts` falls back to a small inline
     `FALLBACK_WM_SETTINGS` default and skips `setupWindow`.

Settings → "Window Manager" page (`settings.html`) shows a "Themes" section with
clickable preset cards (swatch preview from each theme's `appearance`, highlights the
active theme by matching `current.json`'s `name`), plus color pickers / sliders /
checkboxes for fine-tuning that write straight to `current.json`. Notes that
`/opt/window-manager.js` is the place for deeper behavior customization.

## File explorer (macOS Finder-style UI)

Two **parallel, hand-kept-in-sync** implementations (no shared module — this is the
established convention in this repo, mirroring how `/opt/window-manager.js` vs.
compiled TS are kept separate):

- `docs/public/mount/home/user1/apps/explorer.js` — **the active runtime file
  explorer** (virtual fs, `force_reload` absent so user edits persist). This is what
  actually renders when you open "Files" from the desktop. Local component name
  `ListDirConponent` (typo preserved intentionally — it's this file's own copy, distinct
  from `desktop.tsx`'s `ListDirComponent`).
- `src/apps/file-explorer/index.tsx` — compiled TS/TSX counterpart, **not used at
  runtime**, kept structurally in sync with `explorer.js` for when/if it's wired back
  in. Has its own local `ListDirComponent` (correctly spelled) — also a separate copy,
  not the one from `./desktop`.
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
- In `explorer.js` and `index.tsx` (which render inside an `about:blank` iframe, so
  `/(sw)/...` sub-resource URLs don't reach the SW — same reason thumbnails use blob
  URLs), `extIconMap` maps extensions to `/usr/share/icons/...` vfs paths, and a
  mount-only `useEffect` (`[]` deps) reads each via `fs.readFileSync` and converts to a
  blob URL (`iconUrls` state), revoked on unmount.
- In `desktop.tsx` (renders in the main document, which the SW does control),
  `extIconMap` instead references `/(sw)/usr/share/icons/...` directly — no blob-URL
  conversion needed there.

Both explorer copies share the same macOS Finder look:
- Toolbar: light gradient header with back/forward/up (history-stack based) nav arrows
  and a clickable breadcrumb path bar (`getBreadcrumbs()`).
- Sidebar: "FAVORITES" section (`NAV_SHORTCUTS` = Home `/home/user1`, Mounted `/mnt`,
  Root `/`), rounded blue active highlight.
- Content: icon grid, single-click selects (blue highlight), double-click opens
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

## Terminal (`docs/public/mount/home/user1/apps/xtermjs.html`)

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

## Testing conventions

- **Never run ad-hoc test scripts from `/tmp`** — create them in the repo (now under
  `testing/scripts/`), run them, and keep them (don't delete) unless told otherwise.
  Screenshots go in `testing/screenshots/`.
- Playwright: import via the local npx cache path, e.g.
  `import { chromium } from '/Users/pankajdevesh/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'`
  (bare `'playwright'` import fails with `ERR_MODULE_NOT_FOUND`).
- First page load commonly shows a "no client available to serve the request" service
  worker error — reload (`page.reload({ waitUntil: 'networkidle' })`) **twice** after
  the initial `goto()` before interacting.
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
- `settings.html` pages array (`pages` in the `App` component) drives the left nav of
  the Settings window; each entry is `{id, name, label, component}`.
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
