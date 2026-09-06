# Platform Rings Refactor

Restructure bootstrapper-js into Linux-style privilege rings so apps are
fully isolated and all resource access is mediated by Platform.

---

## Architecture

```
Ring 0 — Kernel
  vfs         BrowserFS mount, sync mirror, path helpers
  sw-bridge   Service worker registration + /(sw)/ request routing
  ipc-bus     Raw postMessage router (send/reply/broadcast)

Ring 1 — Platform  (the only entry point rings 2-3 can call)
  process-manager   PID generator, namespace lifecycle
  namespace         Per-app context: pid, id, ACL, owned resources
  message-bus       Mediated send between namespaces via platform
  proxy-fs          FS API for apps — path ACL + segment-safe mkdir
  command-registry  Registered commands (moved out of Host)
  service-registry  Named service map (moved out of Host)
  exec-engine       execString / execCommand / exec (moved out of Host)
  platform          Platform class (thin — delegates to above)
  host              Host class (kept, delegates to platform)

Ring 2 — System  (system services, access platform via approved API)
  layout-manager    Grid areas, active layout, layout switching
  window-manager    Window open/close/minimize/focus/pid tracking
  desktop-manager   Desktop icons, context menu, wallpaper

Ring 3 — Apps  (access nothing below platform)
  Each app launch:
    1. platform creates Namespace (pid + id + ACL)
    2. platform creates iframe + postMessage IPC channel for that namespace
    3. app receives proxy-fs + message-bus handle only
    4. to reach another process: app → platform.send(targetPid, msg)
    5. platform routes the message (enforces ACL) → target namespace
```

---

## Tasks

### Phase 1 — Kernel layer  [ ]
- [ ] 1.1  Create `src/kernel/vfs.ts`
        Extract VFS init from `src/index.ts`:
        `initVFS()` → mounts BrowserFS (indexeddb / localstorage),
        `bootstrapMetaFiles()` → reads meta.json, copies force_reload files,
        `mkdirRecursive(fs, path)` → segment-by-segment mkdir helper (fixes BrowserFS bug)
        Export: `getFS()`, `mkdirRecursive`
- [ ] 1.2  Create `src/kernel/ipc-bus.ts`
        Move `initIpc`, `registerIpcHandler`, `broadcastIpcEvent` out of `src/core/ipc.ts`
        Add `IpcBus` class: `register(event, handler)`, `dispatch(event, data)`, `broadcast(event, data)`
        Keep WmBridge / DockBridge types here
- [ ] 1.3  Create `src/kernel/sw-bridge.ts`
        Extract SW registration from `src/index.ts`
        `registerServiceWorker()`, `getServiceWorker()`
- [ ] 1.4  Update `src/index.ts` to call kernel layer only (no inline VFS/SW code)

### Phase 2 — Platform core  [ ]
- [ ] 2.1  Create `src/platform/namespace.ts`
        `Namespace` class: `{ pid, id, appDir, acl: { paths: string[], read, write } }`
        ACL defaults: read `/opt/apps/<id>/`, `/home/user1/.local/share/<id>/`, write same
        `checkRead(path)`, `checkWrite(path)` → throws if denied
- [ ] 2.2  Create `src/platform/process-manager.ts`
        `ProcessManager`: PID counter, `Map<pid, Namespace>`, `spawn(id, opts)`, `kill(pid)`, `list()`
        Emits observable `processes$` (used by task-manager)
- [ ] 2.3  Create `src/platform/proxy-fs.ts`
        `ProxyFS` wraps kernel VFS with a `Namespace`
        All path args are checked via `ns.checkRead` / `ns.checkWrite` before calling real fs
        `mkdirRecursive(path)` uses segment-by-segment approach (no { recursive } flag)
        Exported to app as its only FS interface — no raw `getFS()` access
- [ ] 2.4  Create `src/platform/message-bus.ts`
        `MessageBus` singleton owned by Platform
        `subscribe(pid, handler)`, `unsubscribe(pid)`
        `send(fromPid, toPid, channel, payload)` — platform checks ACL then routes
        `broadcast(fromPid, channel, payload)` — sends to all subscribed pids
        IPC wire: wraps existing `ipc-bus` postMessage under the hood
- [ ] 2.5  Create `src/platform/command-registry.ts`
        Extract `Command` type, `registerCommand`, `getCommand`, `callCommand`,
        `getCommandsForExtension` from `Host` in `src/shared/index.ts`
        Backed by `BehaviorSubject<Command[]>` (same as today)
- [ ] 2.6  Create `src/platform/service-registry.ts`
        Extract `register`, `getServiceSync`, `getService` from `Platform` class
        `ServiceRegistry`: `Map<string, unknown>`, `register(name, value)`, `get(name)`
- [ ] 2.7  Create `src/platform/exec-engine.ts`
        Extract `execString`, `execCommand`, `exec` from `Host`
        `ExecEngine` takes `CommandRegistry`, `ServiceRegistry`, `ProcessManager`
        `execString` creates a Namespace via ProcessManager before running the script
        Window shim passed to scripts: `{ platform: namespacedProxy, document, top }`
        namespacedProxy exposes only: `ProxyFS`, `MessageBus.send`, `CommandRegistry` (read-only)
- [ ] 2.8  Slim down `src/shared/index.ts`
        `Host` delegates all methods to the new modules above
        `Platform` becomes a thin proxy; constructor accepts registry + bus + exec refs
        Remove direct `getFS()` from Host public API (internal only via ProxyFS)
        Keep `execCommand` on Host for backward compat during transition

### Phase 3 — System layer  [ ]
- [ ] 3.1  Create `src/system/layout-manager.ts`
        Extract layout load/switch/config from `src/core/layout/index.tsx`
        `LayoutManager`: `layouts$`, `active$`, `setLayout(id)`, `readLayouts()`
- [ ] 3.2  Create `src/system/window-manager.ts`
        Extract window open/close/minimize/focus from `src/core/layout/index.tsx`
        Each window tracks its namespace pid
        `WindowManager`: `openWindow(cmd, pid, body, props)`, `closeWindow(pid)`,
        `minimizeWindow(pid)`, `focusWindow(pid)`, `windows$`
- [ ] 3.3  Create `src/system/desktop-manager.ts`
        Extract desktop icon rendering, right-click context menu from layout
        `DesktopManager`: `icons$`, `refresh()`, wallpaper apply
- [ ] 3.4  Slim `src/core/layout/index.tsx`
        Becomes a thin React shell that wires LayoutManager + WindowManager + DesktopManager
        No more direct VFS calls or business logic in the component

### Phase 4 — App launch flow  [ ]
- [ ] 4.1  Update `pkg-manager/loader.js` boot flow
        Each CORE_APPS entry: `ProcessManager.spawn(id)` → get namespace → `ExecEngine.exec`
        Script runs in namespace context, gets ProxyFS + MessageBus only
- [ ] 4.2  Update window open flow in `open-window` service
        `WindowManager.openWindow` calls `ProcessManager.spawn` for the new window pid
        Iframe gets its namespace pid injected; AppSDK injected = ProxyFS + MessageBus
- [ ] 4.3  Update AppSDK injection (in app main.js loaders)
        Replace raw `fs.*` with `ProxyFS` methods from the namespace
        Replace `iframe.contentWindow.AppSDK = { readText: fs... }` with
        `iframe.contentWindow.AppSDK = namespace.proxyFs` (same API shape)
- [ ] 4.4  Update snake + NN app loaders
        Same pattern: get namespace from ProcessManager, inject ProxyFS
- [ ] 4.5  IPC channel per app iframe
        Each iframe postMessage channel registered in MessageBus under its pid
        Apps call `AppSDK.send(channel, payload)` → platform routes via MessageBus

### Phase 5 — Tests + cleanup  [ ]
- [ ] 5.1  Update/add browser tests for new launch flow
- [ ] 5.2  Remove dead code from old Host (direct fs exposure, inline IPC handlers)
- [ ] 5.3  Verify task-manager still shows processes via `ProcessManager.list()`
- [ ] 5.4  Verify settings, spotlight, pkg-manager still work
- [ ] 5.5  Rebuild (`npx webpack`) and smoke-test in browser

---

## File map (new vs old)

| New file | Replaces / source |
|---|---|
| `src/kernel/vfs.ts` | inline in `src/index.ts` |
| `src/kernel/ipc-bus.ts` | `src/core/ipc.ts` |
| `src/kernel/sw-bridge.ts` | inline in `src/index.ts` |
| `src/platform/namespace.ts` | new |
| `src/platform/process-manager.ts` | new |
| `src/platform/proxy-fs.ts` | new (replaces raw `host.getFS()` in apps) |
| `src/platform/message-bus.ts` | new (wraps existing `ipc-bus`) |
| `src/platform/command-registry.ts` | extracted from `src/shared/index.ts` Host |
| `src/platform/service-registry.ts` | extracted from `src/shared/index.ts` Platform |
| `src/platform/exec-engine.ts` | extracted from `src/shared/index.ts` Host |
| `src/system/layout-manager.ts` | extracted from `src/core/layout/index.tsx` |
| `src/system/window-manager.ts` | extracted from `src/core/layout/index.tsx` |
| `src/system/desktop-manager.ts` | extracted from `src/core/layout/index.tsx` |

---

## Rules
- Apps MUST NOT import from `src/kernel/*` or call `host.getFS()` directly
- All FS access from apps goes through `ProxyFS` (enforced by namespace ACL)
- All inter-app messaging goes through `MessageBus.send(fromPid, toPid, ...)`
- Platform is the only layer that instantiates `Namespace` or calls kernel directly
- `src/shared/index.ts` is kept during transition; Host methods become thin delegators
