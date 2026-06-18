# Command Reference

**Sources:** `src/core/window-manager.ts`, `src/core/layout/index.tsx`, `src/remote.ts`, `src/core/layout/commands.tsx`, compiled app modules

Commands are the primary IPC mechanism in bootstrapper-js. Any script with access to `platform.host` can register or call a command. Commands are identified by string names and stored in a prepended list — the most-recently-registered command with a given name wins.

---

## How to call a command

```javascript
// From any VFS script or compiled module:
platform.host.callCommand('notify', { title: 'Hello', body: 'World' });
platform.host.callCommand('set-layout', 'classic');
platform.host.callCommand('process.kill', 42);

// From a .run DSL file (command() is in scope):
command('notify')({ title: 'Hello', body: 'World' });

// Open a window from a .run DSL file:
service('001-core.layout', 'open-window')(command('ui.notepad'), '/home/user1/notes.txt');
```

---

## Process commands

Registered by `src/core/window-manager.ts` during `WindowManager` construction.

### `process.kill(pid)`

Send SIGTERM to a running window. Calls `onSignal('SIGTERM', ...)` handlers, posts a `message` event to the iframe, runs `onDestroy` callbacks, then removes the window DOM and its `/proc/<pid>/` directory.

```javascript
platform.host.callCommand('process.kill', 42);
```

### `process.sigkill(pid)`

Send SIGKILL to a running window. Immediately removes the window DOM with no callbacks, signal handlers, or cleanup. Used for force-terminating an unresponsive app.

```javascript
platform.host.callCommand('process.sigkill', 42);
```

### `process.send-message(pid, message)`

Send an arbitrary message to a running process. The message is:
1. Appended to `/proc/<pid>/inbox.json` (kept capped at 50 entries) for polling.
2. Emitted live to any `onMessage` listener the process registered via `props.onMessage`.

```javascript
platform.host.callCommand('process.send-message', 42, { type: 'refresh', data: 'new' });
```

### `process.list()` → `ProcessListEntry[]`

Return a snapshot of all running windows. Used by `ps` and `htop` shell commands and the task manager app.

**Return shape:**
```typescript
type ProcessListEntry = {
  pid: number;
  name: string;           // command name (e.g. 'ui.notepad')
  title: string;          // current window title
  icon: string;           // Material Symbols icon name from command meta
  minimized: boolean;
  active: boolean;        // true if this is the frontmost window
  startedAt: number;      // Date.now() timestamp when the window was opened
  services: string[];     // services requested by this process's Platform
};
```

```javascript
const procs = platform.host.callCommand('process.list');
// or from a .run file:
const processes = command('process.list').exec();
```

### `add-desktop`

Add a new virtual desktop (Spaces). The new desktop becomes immediately active. Desktop state is persisted to `/etc/wm/desktops.json`.

```javascript
platform.host.callCommand('add-desktop');
```

---

## Layout & window manager commands

Registered by `src/core/layout/index.tsx`.

### `set-layout(layoutId)`

Switch to a named layout preset. Writes `{ "layout": layoutId }` to `/etc/wm/config.json` and pushes to `layoutSubject` (reactive — no page reload needed). Layout definitions come from `/etc/wm/layouts.json`.

```javascript
platform.host.callCommand('set-layout', 'classic');
platform.host.callCommand('set-layout', 'fullscreen');
```

### `set-window-manager-settings(settings)`

Write partial or full WM settings to `/etc/wm/current.json` and immediately reapply as CSS custom properties on `:root`. Merges with existing settings (does not require a full object).

```javascript
platform.host.callCommand('set-window-manager-settings', {
  appearance: {
    headerBg: '#1a1a2e',
    headerColor: '#ffffff',
    accent: '#e94560',
    radius: '12px',
    blur: '16px',
    shadow: '0 8px 32px rgba(0,0,0,0.4)',
  },
  behavior: {
    dblClickHeaderFullscreen: true,
    bringToFrontOnClick: true,
  },
});
```

### `set-window-manager-theme(themeId)`

Copy `/etc/wm/themes/<themeId>.json` into `/etc/wm/current.json` and reapply CSS vars. `themeId` is the filename without `.json` extension (e.g. `'ocean'`, `'dark'`, `'light'`, `'sunset'`).

```javascript
platform.host.callCommand('set-window-manager-theme', 'ocean');
```

### `get-window-manager-themes()` → `ThemeEntry[]`

List all available theme files in `/etc/wm/themes/`. Returns an array of `{ id, name, appearance }` objects.

```javascript
const themes = platform.host.callCommand('get-window-manager-themes');
// [{ id: 'ocean', name: 'Ocean', appearance: { headerBg: '...', ... } }, ...]
```

### `set-wallpaper(url)`

Set the active wallpaper. Writes to `/user-preferences.json`. The URL should be a `/(sw)/...` VFS path or a web URL.

```javascript
platform.host.callCommand('set-wallpaper', '/(sw)/home/user1/photos/bg.jpg');
```

### `add-wallpaper(url)`

Add a URL to the `wallpapers` array in `/user-preferences.json`.

```javascript
platform.host.callCommand('add-wallpaper', '/(sw)/home/user1/photos/extra.jpg');
```

### `remove-wallpaper(url)`

Remove a URL from the `wallpapers` array. If it was the active wallpaper, falls back to `default_wallpaper` or the first remaining entry.

```javascript
platform.host.callCommand('remove-wallpaper', '/(sw)/home/user1/photos/old.jpg');
```

### `set-wallpapers-dir(vfsPath)`

Set an additional VFS folder to scan for wallpaper images. Images in this folder appear in the wallpaper picker alongside the `wallpapers` list (de-duplicated). The path is stored as `wallpapers_dir` in `/user-preferences.json`.

```javascript
platform.host.callCommand('set-wallpapers-dir', '/home/user1/wallpapers');
```

### `set-enabled-widgets(names[])`

Update which widget names are shown on the desktop. Writes the list to `enabledWidgets` in `/user-preferences.json`.

```javascript
platform.host.callCommand('set-enabled-widgets', ['clock', 'shortcuts']);
```

### `core.toggle-navbar`

Toggle the visibility of the left or right navbar panel (registered in `src/core/layout/commands.tsx`).

```javascript
platform.host.callCommand('core.toggle-navbar');
```

---

## System commands

Registered by `src/remote.ts` at boot.

### `notify({ title?, body?, duration? })`

Show a desktop notification toast. Appears in the bottom-right corner with a slide-in animation.

| Option | Type | Default | Description |
|---|---|---|---|
| `title` | `string` | `''` | Bold title line |
| `body` | `string` | `''` | Secondary text line |
| `duration` | `number` | `4000` | Auto-dismiss delay in milliseconds |

Toasts can also be dismissed by clicking them.

```javascript
platform.host.callCommand('notify', { title: 'File saved', body: 'notes.txt', duration: 2000 });
platform.host.callCommand('notify', { title: 'Error', body: 'Could not read file' });
```

### `reload-keybindings`

Re-read `/etc/keybindings.json` and rewire the `keydown` event listener. Called automatically when keybindings are saved in Settings. The old listener is aborted via `AbortController` before the new one is wired.

```javascript
platform.host.callCommand('reload-keybindings');
```

### `explorer(...args)`

Open the file explorer. This is a fallback registration — `/home/user1/apps/explorer.js` registers a higher-priority `explorer` command on boot via `initd.run`. The fallback ensures the command always resolves even if `explorer.js` is missing or stale.

- Called with no args: opens a new explorer window at the default path via `open-window`.
- Called with a path arg: delegates to `ui.file-explorer`.

```javascript
platform.host.callCommand('explorer');           // open file explorer window
platform.host.callCommand('explorer', '/home/user1/projects');
```

### `spotlight`

Open the Spotlight search overlay. Implemented by `/opt/spotlight.js` (a VFS script). Bound to `Alt+Space` by default.

```javascript
platform.host.callCommand('spotlight');
```

### `core.add-module(namespace, config)`

Dynamically register a new JS module bundle. The module is loaded into an isolated iframe-based context. Used internally and rarely needed from user scripts.

---

## UI app commands

These commands open windowed applications. All follow the signature `(body, props, ...args)` — `body` and `props` are provided by the window manager; callers only need to supply `...args` via the DSL or `callCommand`.

The standard way to open a UI app is through the `open-window` service:

```javascript
// From a .run file or execCommand string:
service('001-core.layout', 'open-window')(command('ui.notepad'), '/path/to/file.txt');

// From compiled TS (direct callCommand does NOT set up body/props):
platform.host.execCommand(
  "service('001-core.layout', 'open-window') (command('ui.notepad'), '/path/to/file.txt')",
  platform
);
```

### `ui.iframe(body, props, url, ...args)`

Open a URL or VFS HTML file in a sandboxed iframe window. The `url` can be:
- A web URL: `'https://example.com'`
- A VFS path served via the service worker: `'/(sw)/home/user1/apps/myapp.html'` or `'/cache/home/user1/apps/myapp.html'`

Source: `src/core/iframe/index.tsx`

### `ui.notepad(body, props, file?)`

Plain text editor. Opens an empty buffer if no file is given. Supports viewing and editing any text file in the VFS.

Source: `src/apps/notepad/index.tsx`

### `ui.file-explorer(body, props, path?)`

The compiled file explorer (TypeScript counterpart of `explorer.js`). Opens at `path` or defaults to `/home/user1`.

Source: `src/apps/file-explorer/index.tsx`

### `ui.terminal`

Open a new terminal window (xterm.js). Registered in `src/remote.ts`. Bound to `Alt+T` by default.

### `ui.settings`

Open the Settings window. Registered in `src/remote.ts`. Bound to `Alt+S` by default.

### `ui.markdown(body, props, path?)`

Markdown reader. Renders a `.md` file from the VFS.

Source: VFS app (markdown.js)

### `ui.dashboard(body, props)`

Dashboard bookmark and widget manager.

Source: VFS apps (dashboard.html / dashboard.js)

### `ui.python(body, props, filePath?)`

Python REPL powered by Pyodide. If `filePath` is given, runs the file on open.

Source: VFS app (python.html / python.js)

### `ui.task-manager(body, props)`

Interactive process/task manager. Shows running processes, uptime, and services. Equivalent of a GUI `htop`.

Source: VFS app (task-manager.js)

### `ui.csv-viewer(body, props, path?)`

CSV file viewer with a grid/table layout.

Source: VFS app (csv-viewer.js)

### `ui.diff(body, props)`

Diff viewer for comparing two files or text inputs.

Source: VFS app (diff.js)

### `ui.bookmarks(body, props)`

Bookmarks manager for browser-style bookmarks stored in the VFS.

Source: VFS app (bookmarks.js)

### `ui.app-launcher(body, props)`

All-apps launcher grid — shows all registered UI commands with their icons and titles.

Source: VFS app (app-launcher.js)

### `ui.imageviewer(body, props, path?)`

Image viewer. Opens an image file from the VFS.

Source: VFS app (imageviewer.js)

### `ui.xml-parser(body, props)`

XML parser and tree viewer.

Source: `src/apps/xml-parser/index.tsx`

### `ui.vs-code(body, props)`

VS Code-style editor (Monaco-based or similar).

Source: `src/apps/vs-code/index.tsx`

### `ui.game-of-life(body, props)`

Conway's Game of Life simulation.

Source: `src/apps/game-of-life/index.tsx`

### `ui.view-commands(body, props)`

Lists all currently registered commands with their names, icons, and titles.

Source: `src/modules/index.tsx`

### `ui.wamp(body, props)`

WAMP (WebSocket Application Messaging Protocol) client.

Source: VFS app (`/home/user1/apps/wamp.js`)
