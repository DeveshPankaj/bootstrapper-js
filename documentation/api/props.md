# Window App Props (`UICallbackProps`)

**Sources:** `src/shared/index.ts` (type definition), `src/core/window-manager.ts` (implementation)

Every UI command's `exec` function receives two positional arguments followed by any extra args:

```javascript
command.exec(body, props, ...extraArgs)
```

- `body` — `HTMLBodyElement` of the window's iframe. Render your app's UI into this element.
- `props` — `UICallbackProps` — the window control object documented here.
- `...extraArgs` — additional arguments passed when the command was invoked (e.g. a file path).

The `props` object is created by `WindowManager.createWindow()` and provides everything a window app needs to manage its own lifecycle, title, visibility, and communication.

---

## Props reference

### Identity

#### `props.pid` — `number`

The process ID assigned to this window by the window manager. Unique per running window, allocated sequentially. Use it to:
- Namespace temp files: `fs.writeFileSync('/proc/' + props.pid + '/state.json', ...)`
- Allow other scripts to target this window: `platform.host.callCommand('process.kill', props.pid)`

---

### Visibility

#### `props.setWindowView(show: boolean)`

Show or hide the window container. Windows start with `class="hidden"` — **call `props.setWindowView(true)` to make the window visible** after your app has finished its initial render.

```javascript
// Standard pattern: render first, then show
ReactDOM.render(<App />, body);
props.setWindowView(true);
```

---

### Title bar

#### `props.setTitle(title: string)`

Update the window's title bar text and the corresponding taskbar entry. Also writes the new title into `/proc/<pid>/meta.json`.

```javascript
props.setTitle('Notes — /home/user1/notes.txt');
```

#### `props.toggleHeader(flag?: boolean)`

Show or hide the window title bar / header element.
- `toggleHeader()` — toggle current state
- `toggleHeader(true)` — show header
- `toggleHeader(false)` — hide header (useful for fullscreen-by-default apps)

#### `props.appendActionButton({ icon, title, onClick })` → `{ remove() }`

Add a button to the window header (inserted after the title, before window-control buttons). `icon` is a Material Symbols Outlined ligature name (e.g. `'save'`, `'refresh'`). Returns an object with a `remove()` method to remove the button.

```javascript
const { remove } = props.appendActionButton({
  icon: 'save',
  title: 'Save file',
  onClick: () => saveCurrentFile(),
});
// Later: remove();
```

#### `props.setHeaderStyles(styles: Record<string, string>)`

Apply CSS properties directly to the header element.

```javascript
props.setHeaderStyles({ backgroundColor: '#1a1a2e', color: '#e94560' });
```

---

### Lifecycle

#### `props.close()`

Send SIGTERM to this window. Runs all `onSignal('SIGTERM', ...)` handlers, posts a `message` event to the iframe, runs all `onDestroy(...)` callbacks, then removes the window from the DOM and the process registry. This is what the header close button does.

#### `props.kill()`

Send SIGKILL to this window. Immediately removes the window DOM — no callbacks or signal handlers are called. Use only when a forced close is required.

#### `props.onDestroy(cb: Function)` → `() => void`

Register a cleanup callback that runs when the window is closed via SIGTERM (`props.close()` or the header close button). Does NOT run on SIGKILL.

Returns an unsubscribe function that removes this specific callback if called before the window closes.

```javascript
const unsubscribe = props.onDestroy(() => {
  clearInterval(refreshTimer);
  saveState();
});
// If you need to cancel: unsubscribe();
```

#### `props.onSignal(name: string, cb: Function)` → `() => void`

Register a named signal handler. Currently `'SIGTERM'` is the only signal emitted by the window manager. Called before `onDestroy` callbacks on SIGTERM.

Returns an unsubscribe function.

```javascript
const unsubscribe = props.onSignal('SIGTERM', () => {
  // First cleanup step — runs before onDestroy
  flushPendingWrites();
});
```

#### `props.onMessage(cb: (message: unknown) => void)` → `() => void`

Register a listener for messages sent to this process via `process.send-message`. Messages are also appended to `/proc/<pid>/inbox.json` for polling.

Returns an unsubscribe function.

```javascript
const unsubscribe = props.onMessage((msg) => {
  console.log('Received:', msg);
  if (msg === 'refresh') loadData();
});
```

---

### Window geometry

#### `props.toggleFullScreen()`

Toggle fullscreen state. Saves the current `left/top/width/height` into `data-prev-*` attributes and expands the window to fill the content area. Toggles again restores from saved attributes.

#### `props.getBoundingClientRect()` → `DOMRect`-like object

Get the window container's current bounding rect (`{ top, left, bottom, right, width, height }`).

#### `props.setBoundingClientRect(rect: Record<string, number>)`

Programmatically set the window's position and/or size. All values are interpreted as pixels.

```javascript
props.setBoundingClientRect({ left: 100, top: 50, width: 800, height: 600 });
```

---

### Host dimensions

#### `props.host` — `{ innerWidth: number, innerHeight: number }`

The host (top-level) window's current inner dimensions. Updated in-place on `resize` events, so reading `props.host.innerWidth` always returns the current value without re-subscribing.

```javascript
const { innerWidth, innerHeight } = props.host;
```

---

### Extra arguments

#### `props.$args` — `any[]`

Extra arguments passed when the command was invoked. For example, a file path argument passed to `ui.notepad` would appear here as `props.$args[0]`, and also as the third argument to `exec`:

```javascript
// Both of these are equivalent:
platform.host.registerCommand('my-app', (body, props, filePath) => {
  // filePath === props.$args[0]
});
```

---

## Receiving signals inside an iframe app (no props)

Apps loaded as HTML files via `ui.iframe` receive their own `window` context and have no direct access to `props`. They can still handle SIGTERM via `postMessage`:

```javascript
// Inside an HTML app's <script> (e.g. /home/user1/apps/myapp.html)
window.addEventListener('message', (e) => {
  if (e.data?.type === 'signal' && e.data?.name === 'SIGTERM') {
    // Cleanup before the window is removed
    clearInterval(myTimer);
    saveDraft();
  }
});
```

The postMessage is sent to `iframe.contentWindow` with `{ type: 'signal', name: 'SIGTERM' }` before `onDestroy` callbacks run.

---

## Examples

### Minimal app pattern

```javascript
platform.host.registerCommand('ui.my-app', (body, props) => {
  props.setTitle('My App');

  // Render content
  body.innerHTML = '<h1>Hello from My App</h1>';

  // Show the window
  props.setWindowView(true);

  // Cleanup on close
  props.onDestroy(() => {
    // e.g. cancel pending fetches, timers, etc.
  });
}, { icon: 'apps', title: 'My App' });
```

### Cleanup pattern with timer and message handler

```javascript
platform.host.registerCommand('ui.poller', (body, props, targetUrl) => {
  props.setTitle('Poller');
  props.setWindowView(true);

  const id = setInterval(async () => {
    const res = await fetch(targetUrl);
    body.textContent = await res.text();
  }, 5000);

  const unsubMsg = props.onMessage((msg) => {
    if (msg === 'stop') clearInterval(id);
  });

  props.onDestroy(() => {
    clearInterval(id);
    unsubMsg();
  });
});
```

### Dynamic title based on file being edited

```javascript
platform.host.registerCommand('ui.editor', (body, props, filePath) => {
  props.setTitle(filePath ? `Edit — ${filePath}` : 'Untitled');
  props.appendActionButton({
    icon: 'save',
    title: 'Save',
    onClick: () => {
      const fs = platform.host.getFS();
      fs.writeFileSync(filePath, body.querySelector('textarea').value);
      props.setTitle(`Edit — ${filePath}`); // remove any unsaved indicator
    },
  });
  props.setWindowView(true);
});
```

---

## Signal delivery order on SIGTERM

When `props.close()` is called (or the header close button is clicked):

1. All `props.onSignal('SIGTERM', ...)` handlers run (in registration order).
2. `iframe.contentWindow.postMessage({ type: 'signal', name: 'SIGTERM' }, '*')` is sent to the iframe.
3. All `props.onDestroy(...)` callbacks run (in registration order).
4. Window DOM is removed; `/proc/<pid>/` directory is deleted; process registry entry is cleaned up.

SIGKILL (`props.kill()`) skips all of the above — the window is removed immediately.
