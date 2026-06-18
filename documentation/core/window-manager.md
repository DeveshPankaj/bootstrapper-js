# Window Manager

The window manager is split into two halves: **appearance** (compiled TypeScript) and **behavior** (live-editable VFS script).

## Appearance

**Source:** `src/core/layout/index.tsx`, `src/core/window-manager.ts`

Active settings live in `/etc/wm/current.json` with the shape `{ name?, appearance: {...}, behavior: {...} }`. On startup, `ensureWmCurrent()` seeds this file from the default theme (`/etc/wm/themes/ocean.json`), falling back to any theme in `/etc/wm/themes/`, then to `DEFAULT_WM_SETTINGS` in code.

`applyWmSettings(settings)` sets CSS custom properties on `:root`:

| CSS variable | Controls |
|---|---|
| `--wm-header-bg` | Window title bar background |
| `--wm-header-color` | Window title bar text/icon color |
| `--wm-window-bg` | Window body background |
| `--wm-accent` | Accent color (focus outline, highlights) |
| `--wm-radius` | Border radius on windows and widgets |
| `--wm-blur` | `backdrop-filter: blur()` intensity |
| `--wm-shadow` | `box-shadow` on windows and widgets |

### Themes

Preset theme files live under `/etc/wm/themes/*.json`, each with the same `{ name, appearance, behavior }` shape as `current.json`. Presets are never modified at runtime — applying a theme copies its contents into `current.json`.

**Commands:**
- `set-window-manager-settings` — writes partial or full settings to `current.json` and reapplies CSS vars.
- `set-window-manager-theme(themeId)` — copies `/etc/wm/themes/<themeId>.json` into `current.json` and reapplies.
- `get-window-manager-themes` — returns `[{ id, name, appearance }]` for each file in `/etc/wm/themes/`.

## Behavior

**Source:** `/opt/window-manager.js` (VFS, re-read on every `createWindow()`)

This file is executed via `execString` each time a new window is created. It exports:

- `DEFAULT_SETTINGS` — fallback WM settings used if `current.json` is missing.
- `readSettings()` — reads and parses `/etc/wm/current.json`.
- `setupWindow({ container, head, iframe, command, settings, toggleFullScreen, moveOnTop })` — called once per new window. Currently wires up:
  - **Double-click header → fullscreen** (if `behavior.dblClickHeaderFullscreen` is true)
  - **Click anywhere → bring to front** (if `behavior.bringToFrontOnClick` is true)

Editing `/opt/window-manager.js` through the file explorer's Edit action affects all windows opened after the save — no rebuild required. If the file is missing or throws, `window-manager.ts` falls back to `FALLBACK_WM_SETTINGS` and skips `setupWindow`.

## Window lifecycle

1. `WindowManager.createWindow(command, props)` creates the `.window` element, assigns a numeric `pid`, and writes `/proc/<pid>/meta.json`.
2. `appendWindow(contentArea, windowElement)` inserts it into `.windows` inside `.content-area`.
3. `draggable(container, header)` wires mouse-drag (with snap zones — see [window-snap.md](../features/window-snap.md)).
4. `addResizeHandles(container)` adds 8-direction resize handles (n, s, e, w, nw, ne, sw, se).
5. `/opt/window-manager.js` is read and `setupWindow(...)` is called.
6. The window starts with `class="hidden"` — the opener must call `props.setWindowView(true)` to show it.

## Process signals (SIGTERM / SIGKILL)

Every window is a "process" in the process registry. Two signals control termination:

### SIGTERM — graceful close

Triggered by the header close button, `props.close()`, or `platform.host.callCommand('process.kill', pid)`.

**Delivery order:**
1. `onSignal('SIGTERM', ...)` handlers (registered via `props.onSignal`)
2. `iframe.contentWindow.postMessage({ type: 'signal', name: 'SIGTERM' }, '*')`
3. `onDestroy(...)` callbacks (registered via `props.onDestroy`)
4. Window DOM removed; `/proc/<pid>/` deleted; process registry entry cleared

SIGTERM is not cancellable — the window always closes after handlers run.

### SIGKILL — force close

Triggered by `props.kill()` or `platform.host.callCommand('process.sigkill', pid)`.

All callbacks and signal handlers are cleared without being called. The window DOM is removed immediately.

### Listening for signals in an iframe HTML app

Apps loaded as HTML files (no `props` access) can handle SIGTERM via `postMessage`:

```javascript
window.addEventListener('message', (e) => {
  if (e.data?.type === 'signal' && e.data?.name === 'SIGTERM') {
    clearInterval(myTimer);
  }
});
```

See [../api/signals.md](../api/signals.md) for the full signal reference.

## The `/proc/<pid>/` filesystem

Created when a window opens, deleted when it closes. Contains:

- **`/proc/<pid>/meta.json`** — written on open and on every `props.setTitle()` call:
  ```json
  { "pid": 42, "name": "ui.notepad", "title": "notes.txt", "icon": "edit_note", "startedAt": 1718700000000 }
  ```
- **`/proc/<pid>/inbox.json`** — appended to by `process.send-message`. Capped at 50 entries:
  ```json
  [{ "message": "refresh", "receivedAt": 1718700060000 }]
  ```
  Apps can poll this file to read messages missed while no `onMessage` listener was active.

## `process.list()` return shape

The `process.list` command (used by `ps`, `htop`, and the task manager) returns one object per running window:

```typescript
{
  pid: number;        // process ID
  name: string;       // command name, e.g. 'ui.notepad'
  title: string;      // current window title
  icon: string;       // Material Symbols icon name from command meta
  minimized: boolean; // whether the window is currently minimized
  active: boolean;    // true if this is the frontmost window
  startedAt: number;  // Date.now() timestamp when the window was created
  services: string[]; // services requested by this process's Platform instance
}
```

## Fullscreen toggle

`toggleFullScreen(contentArea, win)` saves the window's current `left/top/width/height` into `data-prev-*` attributes, then sets them to the content area's `getBoundingClientRect()` dimensions. Toggling again restores from `data-prev-*`.

## Window ordering (z-index)

| Class / state | z-index |
|---|---|
| `.window` (default) | 9 |
| `.window.top` (focused, accent outline) | 10 |
| `.window.on-top` (pinned) | 100 |
| `.window.dragging` | 200 |
| `.snap-preview` | 99 |
| `.contextmenu` | 300 |
