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
    `.host` is the same shared `Host`.
  - `execCommand(commandStr, platform, ...args)` — runs a small DSL string with
    `service(moduleName, serviceName)`, `command(commandName)`, `$args` in scope (used
    for context-menu actions like
    `service('001-core.layout', 'open-window') (command('ui.notepad'), '/path')`).
  - `registerCommand(name, callback, meta)` / `getCommand` / `callCommand`.
- `platform.register(name, value)` / `platform.getService(moduleName, serviceName)` —
  cross-module service registry.
- `UserPreference` — reads/writes `/user-preferences.json` (wallpaper, etc.).

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

Both explorer copies share the same macOS Finder look:
- Toolbar: light gradient header with back/forward/up (history-stack based) nav arrows
  and a clickable breadcrumb path bar (`getBreadcrumbs()`).
- Sidebar: "FAVORITES" section (`NAV_SHORTCUTS` = Home `/home/user1`, Mounted `/mnt`,
  Root `/`), rounded blue active highlight.
- Content: icon grid, single-click selects (blue highlight), double-click opens
  (`.file-item`/`.file-item.selected`).
- Status bar `.file-explorer-status` at the bottom (`margin-top: auto` so it sticks to
  the bottom of a flex column even with few items).

When changing one explorer file's structure/behavior, mirror the change in the other.

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
- After verifying, stop the dev server: `pkill -f "pnpm start"` /
  `pkill -f "webpack serve"`.

## Misc gotchas

- Material Symbols Outlined icon font is loaded from Google Fonts CDN and re-declared
  via `@font-face`/`.material-symbols-outlined` in several stylesheets (layout, both
  explorer copies) — keep consistent if editing.
- `settings.html` pages array (`pages` in the `App` component) drives the left nav of
  the Settings window; each entry is `{id, name, label, component}`.
