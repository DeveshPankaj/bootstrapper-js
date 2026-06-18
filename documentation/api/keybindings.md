# Keyboard Shortcut System

**Sources:** `src/remote.ts` (`wireKeybindings`, `DEFAULT_KEYBINDINGS`, `reload-keybindings` command)

Keyboard shortcuts are read from a JSON config file in the VFS and wired as a `keydown` event listener on the top-level `document`. They can be reconfigured without a rebuild.

---

## Default keybindings

Defined in `src/remote.ts` as `DEFAULT_KEYBINDINGS`. Used when `/etc/keybindings.json` does not exist.

| Shortcut | Command | Action |
|---|---|---|
| `Alt+Space` | `spotlight` | Open Spotlight search overlay |
| `Alt+F` | `explorer` | Open file explorer window |
| `Alt+T` | `ui.terminal` | Open new terminal window |
| `Alt+S` | `ui.settings` | Open Settings window |

---

## Config file: `/etc/keybindings.json`

Format: a JSON array of binding objects.

```json
[
  { "code": "Space", "modifiers": ["Alt"], "command": "spotlight" },
  { "code": "KeyF",  "modifiers": ["Alt"], "command": "explorer" },
  { "code": "KeyT",  "modifiers": ["Alt"], "command": "ui.terminal" },
  { "code": "KeyS",  "modifiers": ["Alt"], "command": "ui.settings" }
]
```

### Binding object fields

| Field | Type | Description |
|---|---|---|
| `code` | `string` | `KeyboardEvent.code` value — layout-independent key identifier. Preferred. Examples: `"Space"`, `"KeyA"`, `"KeyF"`, `"F1"`, `"ArrowUp"`, `"Enter"`, `"Digit1"`. |
| `key` | `string` | (Legacy) `KeyboardEvent.key` value. Used as fallback if `code` is absent. Avoid for letter keys on Mac, where `Alt+letter` generates Unicode characters (e.g. `Alt+F` → `'ƒ'`, not `'f'`). |
| `modifiers` | `string[]` | Any combination of `"Alt"`, `"Ctrl"`, `"Shift"`, `"Meta"`. All listed modifiers must be pressed; unlisted modifiers must not be pressed. |
| `command` | `string` | Any registered command name to call when the binding fires. |

### Modifier matching

All modifiers listed in `modifiers` must be active, and all modifiers not listed must be inactive. For example, `{ "modifiers": ["Alt"] }` fires on `Alt+key` but NOT on `Alt+Shift+key`.

```json
{ "code": "KeyN", "modifiers": ["Ctrl", "Shift"], "command": "ui.notepad" }
```

### `code` values for common keys

| Key | `code` |
|---|---|
| Letter A–Z | `"KeyA"` – `"KeyZ"` |
| Digit 0–9 | `"Digit0"` – `"Digit9"` |
| F1–F12 | `"F1"` – `"F12"` |
| Space | `"Space"` |
| Enter | `"Enter"` |
| Backspace | `"Backspace"` |
| Escape | `"Escape"` |
| Arrow keys | `"ArrowUp"`, `"ArrowDown"`, `"ArrowLeft"`, `"ArrowRight"` |
| Tab | `"Tab"` |
| Numpad 0–9 | `"Numpad0"` – `"Numpad9"` |

Use `e.code` in the browser console to discover the code for any key.

---

## Reloading keybindings

The `reload-keybindings` command re-reads `/etc/keybindings.json` and replaces the active `keydown` listener. The old listener is aborted via `AbortController` before the new one is wired. This is called automatically after saving in the Settings → Keybindings page.

```javascript
// From any VFS script or compiled module:
platform.host.callCommand('reload-keybindings');

// From a .run file:
command('reload-keybindings')();
```

---

## Boot behavior

`wireKeybindings()` is called once at boot with a 3-second delay (after the VFS is ready and `initd.run` has executed). If `/etc/keybindings.json` does not exist or cannot be parsed, the built-in `DEFAULT_KEYBINDINGS` array is used silently.

---

## Settings UI

Settings → Keybindings page provides a GUI to add and remove bindings. Changes are written to `/etc/keybindings.json` and `reload-keybindings` is called automatically.

---

## Adding a custom keybinding

### Method 1: edit `/etc/keybindings.json` directly

Open the file in the Notepad editor, add a new entry, save, then reload:

```json
[
  { "code": "Space", "modifiers": ["Alt"], "command": "spotlight" },
  { "code": "KeyF",  "modifiers": ["Alt"], "command": "explorer" },
  { "code": "KeyT",  "modifiers": ["Alt"], "command": "ui.terminal" },
  { "code": "KeyS",  "modifiers": ["Alt"], "command": "ui.settings" },
  { "code": "KeyD",  "modifiers": ["Alt"], "command": "ui.dashboard" }
]
```

Then: `platform.host.callCommand('reload-keybindings')`

### Method 2: via Settings UI

Open Settings → Keybindings → click "Add Binding" → fill in code, modifiers, and command name → save.

### Method 3: from a VFS script

```javascript
const fs = platform.host.getFS();
const KEYBINDINGS_FILE = '/etc/keybindings.json';

let bindings = [];
try {
  bindings = JSON.parse(fs.readFileSync(KEYBINDINGS_FILE, 'utf-8'));
} catch (_) {}

bindings.push({ code: 'KeyD', modifiers: ['Alt'], command: 'ui.dashboard' });
fs.writeFileSync(KEYBINDINGS_FILE, JSON.stringify(bindings, null, 2));
platform.host.callCommand('reload-keybindings');
```

---

## Limitations

- Bindings fire on `keydown` on the top-level `document`. Keypresses captured exclusively inside an iframe (e.g. a focused xterm.js canvas) may not bubble to the top-level document and therefore will not trigger keybindings while the iframe has keyboard focus.
- No chord (multi-step) sequences — each binding is a single key press with optional modifiers.
- Keybindings are not cancellable: `e.preventDefault()` is called when a binding matches, but there is no per-binding way to suppress the default.
