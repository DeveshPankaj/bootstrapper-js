# File Explorer

**Runtime file:** `docs/public/mount/opt/apps/file-explorer/main.js` (VFS, `force_reload: true`, loaded as a `CORE_APP` by `pkg-manager/loader.js`)  
**Compiled counterpart:** `src/apps/file-explorer/index.tsx` (kept in sync, registers `ui.file-explorer` — reached via `src/remote.ts`'s `'explorer'` fallback and direct calls)  
**Desktop icons:** `src/apps/file-explorer/desktop.tsx` (separate usage, compiled)

## Architecture

There are **three parallel implementations** — each is a distinct copy:

| File | Usage |
|---|---|
| `opt/apps/file-explorer/main.js` | Active runtime explorer opened as a window (registers `explorer`, prepended so it takes precedence) |
| `src/apps/file-explorer/index.tsx` | Fallback/structural reference (compiled TS, registers `ui.file-explorer`) |
| `src/apps/file-explorer/desktop.tsx` | Desktop icon grid rendered by `LayoutShell` |

When changing behavior in one, mirror the change in the other two.

## UI structure

The explorer renders a macOS Finder–style UI:

- **Toolbar** — gradient header with back/forward/up nav arrows and a clickable breadcrumb bar.
- **Sidebar** — "FAVORITES" section with shortcuts to Home (`/home/user1`), Mounted (`/mnt`), Root (`/`).
- **Content** — icon grid; single-click selects, double-click opens.
- **Status bar** — item count, pinned to the bottom via `margin-top: auto` on `.file-explorer-status`.

## File-type icons

Icons live in the VFS under `/usr/share/icons/` (bootstrapped via `meta.json` with `force_reload: true`). In `main.js` and `index.tsx`, icons are read via `fs.readFileSync` and converted to blob URLs (revoked on unmount) — this is required because those files run inside `about:blank` iframes where `/(sw)/...` URLs are not intercepted by the service worker. `desktop.tsx` uses `/(sw)/usr/share/icons/...` directly since it runs in the main document.

## Drag and drop

### Within or between explorer windows (VFS move)

Every `.file-item` is `draggable`. `onDragStart` sets `dataTransfer` with MIME type `application/x-vfs-path` containing the source path. On drop, `handleDrop` detects this MIME type and calls `fs.renameSync(src, dest)`.

Guards:
- `isDescendantOrSame(src, dest)` — prevents moving a folder into itself.
- Overwrite confirmation if the destination name already exists.

### From the user's computer (import)

If `dataTransfer` has no `application/x-vfs-path`, `importExternalDrop` reads `dataTransfer.items` using `webkitGetAsEntry()` for file/directory entries, recursing into directories via `createReader().readEntries()`. Falls back to `dataTransfer.files` if `webkitGetAsEntry` is unavailable.

### Drop target highlighting

`.file-item.drag-over` and the main content area get a dashed blue outline (`drag-over` class) during hover. Drop targets call `event.preventDefault()` and `stopPropagation()` so dropping on a folder item doesn't also trigger the background drop handler.

## Navigation

Navigation uses a history stack (back/forward/up). `getBreadcrumbs(path)` splits the path into clickable segments for the path bar.

## File operations (context menu)

Right-clicking a file or empty area shows a context menu with: Open, Edit (notepad), Rename, Delete, Copy, Paste, New File, New Folder.

## Service worker path note

`/(sw)/<path>` URLs in `<iframe src>` navigations are intercepted by the service worker (`src/sw.ts`). The SW **must** `decodeURIComponent()` the path slice before VFS lookup — `URL.pathname` keeps percent-encoding (e.g. `%20` for spaces) but VFS paths use literal characters.
