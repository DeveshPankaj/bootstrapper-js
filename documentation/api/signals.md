# Process Signal System

**Sources:** `src/core/window-manager.ts`

Bootstrapper-js implements a two-signal process model for managing window lifecycle. Every open window is a "process" with a numeric PID, and signals are the mechanism for requesting or forcing its termination.

---

## Signals

### `SIGTERM` — graceful close

**Triggered by:**
- Clicking the window header close button
- `props.close()` from within the app
- `platform.host.callCommand('process.kill', pid)` from any script

**Effect:**
1. All `onSignal('SIGTERM', ...)` handlers registered via `props.onSignal` are called.
2. A `postMessage({ type: 'signal', name: 'SIGTERM' }, '*')` is sent to the iframe's `contentWindow`.
3. All `onDestroy(...)` callbacks registered via `props.onDestroy` are called.
4. The window DOM element is removed.
5. The `/proc/<pid>/` directory is deleted from the VFS.
6. The process registry entry is cleared, and the window is removed from `windowsSubject`.

SIGTERM always closes the window — it is not cancellable.

### `SIGKILL` — force close

**Triggered by:**
- `props.kill()` from within the app
- `platform.host.callCommand('process.sigkill', pid)` from any script

**Effect:**
- All callbacks, signal handlers, and message queues are cleared immediately.
- The window DOM element is removed.
- `/proc/<pid>/` is deleted, process registry cleared.
- No `onSignal`, `onDestroy`, or postMessage events are emitted.

Use SIGKILL only when an app is unresponsive or SIGTERM has failed.

---

## Sending signals

### From any script with `platform` access

```javascript
// SIGTERM:
platform.host.callCommand('process.kill', pid);

// SIGKILL:
platform.host.callCommand('process.sigkill', pid);
```

### From a `.run` shell file (DSL context)

```javascript
// SIGTERM:
command('process.kill')(pid);

// SIGKILL:
command('process.sigkill')(pid);
```

### From the terminal shell

```bash
kill 42       # SIGTERM pid 42
# (no SIGKILL shell command; use process.sigkill via a script)
```

---

## Receiving signals

There are three methods for an app to react to SIGTERM before the window closes.

### Method 1 — `postMessage` (HTML iframe apps, no `props` needed)

Apps loaded as HTML files (e.g. via `ui.iframe`) receive their own `window` context and may not have access to `props`. They can listen for the signal message:

```javascript
window.addEventListener('message', (e) => {
  if (e.data?.type === 'signal' && e.data?.name === 'SIGTERM') {
    // Cleanup before the window is removed
    clearInterval(myRefreshTimer);
    saveCurrentDraft();
  }
});
```

This listener fires between step 1 (onSignal handlers) and step 3 (onDestroy callbacks) in the delivery order.

### Method 2 — `props.onSignal` (compiled TS apps and VFS apps with `exec` callback)

```javascript
platform.host.registerCommand('ui.my-app', (body, props) => {
  const unsubscribe = props.onSignal('SIGTERM', () => {
    // Runs first, before postMessage and onDestroy
    flushPendingWrites();
    analyticsTrack('window-closed');
  });

  // Cancel the handler before close if needed:
  // unsubscribe();
});
```

`props.onSignal` is available in compiled TypeScript commands and VFS JS commands that use the standard `(body, props, ...args)` exec signature.

### Method 3 — `props.onDestroy` (cleanup callbacks)

`onDestroy` runs after `onSignal` handlers and the iframe postMessage. Suitable for the bulk of cleanup work:

```javascript
platform.host.registerCommand('ui.my-app', (body, props) => {
  const timer = setInterval(render, 1000);
  const subscription = dataStream.subscribe(onData);

  props.onDestroy(() => {
    clearInterval(timer);
    subscription.unsubscribe();
  });
});
```

Multiple `onDestroy` callbacks can be registered; they run in registration order.

The `onDestroy` return value is an unsubscribe function:

```javascript
const cancel = props.onDestroy(() => cleanup());
// If you want to remove this specific callback before window closes:
cancel();
```

---

## Signal delivery order on SIGTERM

```
closeFunction() called
  │
  ├─ 1. props.onSignal('SIGTERM', ...) handlers  (registration order)
  │
  ├─ 2. iframe.contentWindow.postMessage({ type: 'signal', name: 'SIGTERM' }, '*')
  │
  ├─ 3. props.onDestroy(...) callbacks  (registration order)
  │
  ├─ 4. Window DOM element removed
  │
  ├─ 5. /proc/<pid>/ deleted from VFS
  │
  └─ 6. processRegistry.delete(pid), windowsSubject updated
```

### SIGKILL delivery order

```
killFunction() called
  │
  ├─ 1. onCloseCallbacks = [] (cleared without calling)
  ├─ 2. signalCallbacks.clear() (cleared without calling)
  └─ 3. closeWindow() — DOM removed, /proc/<pid>/ deleted
```

---

## The `/proc/` filesystem

The VFS directory `/proc/<pid>/` is created when a window opens and deleted when it closes. It contains:

### `/proc/<pid>/meta.json`

Written when the window is created and updated whenever `props.setTitle()` is called.

```json
{
  "pid": 42,
  "name": "ui.notepad",
  "title": "Notes — /home/user1/notes.txt",
  "icon": "edit_note",
  "startedAt": 1718700000000
}
```

### `/proc/<pid>/inbox.json`

Appended to by `process.send-message`. Capped at the 50 most recent messages.

```json
[
  { "message": "refresh", "receivedAt": 1718700060000 },
  { "message": { "type": "update", "data": "..." }, "receivedAt": 1718700120000 }
]
```

Apps can poll this file to read messages they may have missed if they were not subscribed via `props.onMessage` at the time of delivery.

---

## No-signal scenarios

| Action | SIGTERM | SIGKILL |
|---|---|---|
| Close button click | Yes | No |
| `props.close()` | Yes | No |
| `process.kill(pid)` command | Yes | No |
| `props.kill()` | No | Yes |
| `process.sigkill(pid)` command | No | Yes |
| Page reload / browser close | No | No — DOM destroyed directly |

---

## Example: app with full signal handling

```javascript
platform.host.registerCommand('ui.data-sync', (body, props) => {
  props.setTitle('Data Sync');
  props.setWindowView(true);

  let ws = new WebSocket('wss://example.com/stream');
  const pollTimer = setInterval(pollBackend, 5000);

  // Phase 1: flush before anything else
  props.onSignal('SIGTERM', () => {
    flushQueue();
  });

  // Phase 2: teardown
  props.onDestroy(() => {
    clearInterval(pollTimer);
    ws.close();
  });

  // For apps loaded as HTML pages (ui.iframe):
  // window.addEventListener('message', e => {
  //   if (e.data?.type === 'signal' && e.data?.name === 'SIGTERM') {
  //     ws.close();
  //   }
  // });
}, { icon: 'sync', title: 'Data Sync' });
```
