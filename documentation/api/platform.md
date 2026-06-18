# Platform & Host API

**Sources:** `src/shared/index.ts`

The `Platform` and `Host` classes form the backbone of the bootstrapper-js module system. Every compiled bundle and every VFS script gets a `Platform` instance. All `Platform` instances share a single `Host` singleton that owns the command registry, widget registry, and the virtual filesystem.

---

## Platform class

Accessed as `window.platform` inside any VFS script, or via `Platform.getInstance()` in compiled TS modules.

```javascript
// Inside a VFS script (e.g. /etc/widgets/clock.js or /home/user1/apps/explorer.js):
const platform = window.platform;
// or equivalently:
const platform = Platform.getInstance();
```

### Properties

| Property | Type | Description |
|---|---|---|
| `platform.host` | `Host` | The shared Host singleton. Same instance across all Platform objects in the page. |
| `platform.window` | `Window` | The browser Window object this Platform was created in. For VFS scripts run via `execString`, this is the *real* top-level window. |
| `platform.userPref` | `UserPreference` | User preferences helper (wallpaper, etc.). See [user-preferences.md](user-preferences.md). |
| `platform.name` | `string` | Unique module name string (e.g. `"root"`, `"001-core.layout"`, or the VFS filepath alias for dynamically executed scripts). |
| `platform.cwd` | `string` | Current working directory for this platform context. Used by `require()` to resolve `./` relative paths. |
| `platform.events$` | `Observable<PlatformEvent>` | RxJS observable emitting platform lifecycle events. |
| `platform.requestedServices` | `Set<string>` | Services this platform has requested via `getService`. Read by the task manager to show per-process service usage. |

### Methods

#### `platform.register(serviceName, value)`

Register a named value so other modules can look it up via `getService`.

```javascript
platform.register('terminal', terminalInstance);
platform.register('myService', { doThing() { ... } });
```

#### `platform.getService<T>(serviceName)` → `T | undefined`

Look up a service by name. Checks this Platform's own map first, then falls back to the root platform's map (via `host.getService('root', serviceName)`). Logs the lookup to console. Marks `serviceName` in `requestedServices`.

```javascript
const fs = platform.host.getFS();
const terminal = platform.getService('terminal');
```

#### `platform.getServiceSync<T>(serviceName)` → `T | undefined`

Synchronous service lookup in this Platform's own map only — does not check other modules. Used internally for cross-module resolution without logging.

#### `platform.getServiceList()` → `string[]`

Returns an array of service names registered on this Platform instance.

#### `platform.require(filepath, by?, _platform?)` → `module.exports`

Load and execute a VFS JS/TS/TSX file, returning its `module.exports`. Supports:
- Absolute VFS paths: `platform.require('/usr/lib/ui/menuItem.js')`
- Relative paths (resolved from `cwd`): `platform.require('./utils.js')`
- `/(sw)/` prefix (stripped automatically): `platform.require('/(sw)/usr/lib/ui/menuItem.js')`
- HTTPS URLs (fetched, Babel-transformed, executed): `platform.require('https://example.com/lib.js')`

The file is Babel-transpiled (env + react + typescript, commonjs modules) before execution. The returned value is `module.exports` from the executed module.

```javascript
const { menuItem } = platform.require('/usr/lib/ui/menuItem.js');
```

---

## Host class

Accessed as `platform.host`. The Host is a singleton shared by all Platform instances — every command/widget/settings-section registered anywhere is visible everywhere.

### Observable properties

| Property | Type | Description |
|---|---|---|
| `platform.host.commands$` | `Observable<Command[]>` | Emits the full command array whenever any command is registered or removed. |
| `platform.host.widgets$` | `Observable<WidgetDef[]>` | Emits when widgets are registered or removed. |
| `platform.host.settingsSections$` | `Observable<SettingsSectionDef[]>` | Emits when settings sections are registered or removed. |

### Command methods

#### `platform.host.registerCommand(name, callback, meta?)` → `{ remove() }`

Register a named command. New registrations are **prepended** to the command list, so the most-recently-registered command with a given name wins (intentional shadowing — used for the `'explorer'` fallback). A console warning is emitted if a command with the same name is already registered.

```javascript
const { remove } = platform.host.registerCommand('my-command', (arg1, arg2) => {
  // handle the command
}, { icon: 'star', title: 'My Command' });

// To unregister:
remove();
```

The `meta` object is stored on the command and used by the window manager (e.g. `meta.icon`, `meta.title`, `meta.fullScreen`).

#### `platform.host.getCommand(name)` → `Command | undefined`

Look up a command by name. Uses `.find()` on the prepended list, so returns the most recently registered one.

```javascript
const cmd = platform.host.getCommand('ui.notepad');
if (cmd) cmd.exec(body, props, '/path/to/file.txt');
```

#### `platform.host.callCommand(name, ...args)`

Call a command by name with arguments. Logs a warning and returns if the command is not found.

```javascript
platform.host.callCommand('notify', { title: 'Hello', body: 'World' });
platform.host.callCommand('set-layout', 'classic');
platform.host.callCommand('process.kill', 42);
```

### Widget methods

#### `platform.host.registerWidget(name, render, meta?)` → `{ remove() }`

Register a desktop widget. Widgets are rendered onto the desktop by the layout system.

```javascript
const { remove } = platform.host.registerWidget(
  'clock',
  (container, api) => {
    container.textContent = new Date().toLocaleTimeString();
    const id = setInterval(() => {
      container.textContent = new Date().toLocaleTimeString();
    }, 1000);
    api.onDestroy(() => clearInterval(id));
  },
  { label: 'Clock', icon: 'schedule' }
);
```

The `render` function receives:
- `container` — `HTMLElement` to render into
- `api` — `WidgetApi` with `api.platform` and `api.onDestroy(cb)`

#### `platform.host.registerSettingsSection(name, render, meta?)` → `{ remove() }`

Register a custom settings page. See [settings-sections.md](settings-sections.md) for full details.

### Execution methods

#### `platform.host.exec(platform, filepath, ...args)`

Execute a VFS file by its extension. Routing table:

| Extension | Action |
|---|---|
| `.js` | `execString(source, '/(sw)' + filepath)` |
| `.run` | `execCommand(source, platform, ...args)` |
| `.html`, `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.bmp`, `.ico`, `.avif` | Opens with `ui.iframe` |
| `.txt`, `.ts` (no ext) | Opens with `ui.notepad` |
| `.md` | Opens with `ui.markdown` |
| directory | Opens with `explorer` |

```javascript
platform.host.exec(platform, '/home/user1/apps/explorer.js');
platform.host.exec(platform, '/home/user1/initd.run');
```

#### `platform.host.execString(source, filenameAlias?, _platform?)` → `module.exports`

Babel-transpile (env + react + typescript, commonjs) and execute a JS/TS/TSX source string. Returns the `module.exports` of the executed code.

**The `window` shim:** Inside the executed code, `window` is `{ platform: newPlatform, document, top }` — not the real `window`. Use `window.platform` to get the Platform for the current script. `top` is the real top-level window.

**`Buffer` availability:** `Buffer` is available as a bare global (resolves via webpack's Node polyfill) even though it is not in the `window` shim. Use `Buffer.from(arrayBuffer)` when writing binary data with `fs.writeFileSync`.

**Source maps:** Source maps are generated and embedded as base64 data URIs so errors in VFS scripts point to their filename alias in browser devtools.

```javascript
const source = fs.readFileSync('/opt/window-manager.js', 'utf-8');
const exports = platform.host.execString(source, '/opt/window-manager.js');
exports.setupWindow({ container, head, iframe, command, settings });
```

#### `platform.host.execCommand(commandStr, platform, ...args)` → `Promise`

Execute a DSL command string in an async IIFE context. The following identifiers are in scope:

| Identifier | Value |
|---|---|
| `service(moduleName, serviceName)` | Look up a service from another module |
| `command(commandName)` | Look up a registered command by name |
| `$args` | The `args` array passed to `execCommand` |
| `platform` | The `Platform` instance passed as second argument |

The command string runs as an async IIFE so it can `await` — callers can await the returned Promise for async commands.

```javascript
// Open a window:
platform.host.execCommand(
  "service('001-core.layout', 'open-window') (command('ui.notepad'), '/etc/wm/config.json')",
  platform
);

// Open the file explorer for a directory:
platform.host.execCommand(
  `service('001-core.layout', 'open-window') (command('explorer'), '/home/user1')`,
  platform
);
```

#### `platform.host.getFS()` → `typeof fs`

Returns the BrowserFS filesystem instance (the `AsyncMirror`-backed synchronous API). Also marks `'fs'` in the calling platform's `requestedServices`.

```javascript
const fs = platform.host.getFS();
const contents = fs.readFileSync('/home/user1/.bash_history', 'utf-8');
fs.writeFileSync('/tmp/output.txt', 'hello world');
```

#### `platform.host.getModulePlatform(name)` → `Platform | undefined`

Look up a module's Platform instance by its module name. Used by the task manager to inspect `requestedServices` for a running process.

```javascript
const proc = platform.host.getModulePlatform('001-core.layout');
console.log(proc?.requestedServices);
```

---

## Type definitions

### `PlatformEvent`

```typescript
type PlatformEvent = {
  type: string;        // e.g. 'loaded', 'core.module-loaded'
  service?: { namespace: string; name: string };
  payload: any;
  module?: Module;
};
```

### `Command`

```typescript
type Command = {
  name: string;
  exec: (...args: unknown[]) => void;
  servicePlatformName: string;   // module name of the registering platform
  meta: Record<string, unknown>; // e.g. { icon, title, fullScreen }
};
```

### `WidgetDef`

```typescript
type WidgetDef = {
  name: string;
  render: (container: HTMLElement, api: WidgetApi) => void | (() => void);
  servicePlatformName: string;
  meta: Record<string, unknown>;
};
```

### `WidgetApi`

```typescript
type WidgetApi = {
  platform: Platform;
  onDestroy: (cb: Function) => void;
};
```

### `SettingsSectionDef`

```typescript
type SettingsSectionDef = {
  name: string;
  render: (container: HTMLElement, api: SettingsSectionApi) => void | (() => void);
  servicePlatformName: string;
  meta: Record<string, unknown>; // { label, icon }
};
```

### `SettingsSectionApi`

```typescript
type SettingsSectionApi = {
  platform: Platform;
  onDestroy: (cb: Function) => void;
};
```

### `UICallbackProps`

See [props.md](props.md) for the full props object passed to window app exec callbacks.

---

## Usage examples

### Widget script (`/etc/widgets/clock.js`)

```javascript
// This file is loaded by remote.ts's loadWidgets() via execString.
// window.platform is the Platform for this script.

const { remove } = platform.host.registerWidget(
  'clock',
  (container, api) => {
    container.style.cssText = 'font-size:1.2rem;color:#fff;padding:0.5rem;';
    const update = () => { container.textContent = new Date().toLocaleTimeString(); };
    update();
    const id = setInterval(update, 1000);
    api.onDestroy(() => clearInterval(id));
  },
  { label: 'Clock', icon: 'schedule' }
);
```

### Reading user preferences in a VFS script

```javascript
const wallpaper = platform.userPref.getWallpaper();
platform.userPref.setWallpaper('/(sw)/home/user1/photos/bg.jpg');
```

### Registering a command from `initd.run` or a boot script

```javascript
// /home/user1/apps/explorer.js (loaded by initd.run)
const { remove } = platform.host.registerCommand('explorer', (body, props, path) => {
  // render file explorer into body
}, { icon: 'folder', title: 'Files' });
```

### Cross-module service lookup

```javascript
// Get the 'open-window' service registered by 001-core.layout:
const openWindow = platform.host.getService('001-core.layout', 'open-window');
const notepadCmd = platform.host.getCommand('ui.notepad');
openWindow(notepadCmd, '/home/user1/notes.txt');
```
