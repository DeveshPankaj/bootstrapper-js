# Virtual Filesystem (VFS)

## Overview

The VFS is powered by **BrowserFS 2.0** using a `MountableFileSystem` that mounts three separate stores:

| Mount point | Description |
|---|---|
| `/` | Main filesystem — user data, apps, config |
| `/tmp` | Ephemeral scratch space |
| `/mnt` | Local folder mounts (OPFS/File System Access API) |

Each mount is an **AsyncMirror** pairing an IndexedDB backend (persistent, GB-scale) with an InMemory backend (sync-access layer). Writes go to both; reads come from the in-memory copy.

## Boot sequence

1. `src/index.ts` calls `resolveFsBackend()` to pick a backend (IndexedDB or LocalStorage).
2. Mounts are initialized with `createIndexedDBMirror()` per mount point.
3. Default directories from `defaultDirs` are created with `mkdirSync(..., { recursive: true })`.
4. `docs/public/mount/meta.json` is fetched; each entry is written to the VFS:
   - `force_reload: true` → always overwrite from server (system/app files).
   - `force_reload: false` / absent → only write if path doesn't already exist (user-editable files).

## FHS-lite layout

```
/bin/*.run          Built-in shell commands (ls, cp, cat, echo, …)
/usr/bin/*.js       Standalone scripts (e.g. fullscreen.js)
/usr/lib/ui/*.js    Shared UI fragments consumed by other VFS scripts
/usr/share/icons/*  File-type icons for the file explorer
/etc/wm/            Window manager config (layouts, themes, current state)
/etc/crontab        Cron schedule (user-editable)
/etc/widgets/*.js   Desktop widget scripts (user-editable)
/opt/window-manager.js  Per-window behavior — re-read on every createWindow()
/opt/cron/*.js      Cron job scripts (user-editable)
/home/user1/        User home: apps/, settings.html, initd.run, content dirs
/tmp                Ephemeral space (InMemory, not in meta.json)
/mnt                Mounted local folders (not in meta.json)
```

## Path normalization

`normalizePath()` resolves `.` / `..` / `//` manually. **Do not** use `fs.realpathSync` — under `MountableFileSystem` it returns paths relative to the mounted sub-root, not the global path (e.g. `realpathSync('/tmp')` → `/`, not `/tmp`).

## Storage backend switch

The backend is selected at boot via the `__app_fs_backend__` localStorage key, overridable with `?fsBackend=indexeddb|localstorage`. The Settings → Storage page lets the user switch and reload. The two backends are completely separate filesystems — switching does not migrate data.

**LocalStorage gotcha**: the LocalStorage backend may contain a stale `/home/user1/apps/explorer.js` that doesn't register the `'explorer'` command. A fallback is registered in `src/remote.ts` to handle this.

## File execution

`platform.host.exec(platform, filepath, ...args)` dispatches by extension:

| Extension | Handler |
|---|---|
| `.js` | `execString()` — Babel-transpile + run via `new Function` |
| `.run` | `execCommand()` — DSL runner with `service`, `command`, `$args` in scope |
| `.html`, images, etc. | Opens in the appropriate registered app via `appExtMap` |

`execString` provides a shim `window = { platform, document, top }` — the real browser `window` is not directly accessible, but `Buffer` is available as a bare global via webpack's Node polyfill.
