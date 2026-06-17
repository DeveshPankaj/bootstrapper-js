# bootstrapper-js — Feature TODO

Each task is a self-contained feature. Check off when done.

---

## System / Window Manager

- [x] **Remove widget clamp logic** (`src/core/layout/index.tsx`)
  - Remove the `clampToBounds` / `ResizeObserver` added to `WidgetItem`

- [x] **Resize handles** (`src/core/window-manager.ts`, `src/core/layout/index.tsx`)
  - 8 drag handles (N/S/E/W + corners) on every window via `addResizeHandles()`
  - CSS in layout.tsx; pointer-capture based resize with 200×120 minimum size

- [x] **Window snapping** (`/opt/window-manager.js`)
  - Snap zones at screen edges (left/right halves, fullscreen, quarters)
  - Translucent blue overlay shown while dragging; applied on pointerup

- [x] **Minimize to taskbar** (`src/core/layout/commands.tsx`, `src/core/layout/index.tsx`)
  - Already wired: minimize button + taskbar toggle working
  - Added `.minimized` CSS class on taskbar icon (small grey dot indicator)

---

## File Explorer

- [x] **File search** — search icon in toolbar, recursive filter, results list
- [x] **CSV viewer** (`/home/user1/apps/csv-viewer.js`) — sortable table; opens on double-click of `.csv` in explorer
- [x] **Diff viewer** (`/home/user1/apps/diff.js`) — side-by-side LCS diff; "Compare with…" in explorer right-click
- [x] **ZIP / archive support** (`explorer.js`, `usr/lib/fflate.min.js`)
  - Bundled `fflate` v0.8.2 at `/usr/lib/fflate.min.js` (bootstrapped via meta.json)
  - Double-click `.zip` → confirm + extract into current directory
  - Right-click `.zip` → "Extract here" via platform service `zip-extract`
  - Right-click any file/folder → "Compress to ZIP" via platform service `zip-compress`


---

## Terminal

- [x] **Multiple shell environments + env vars** (`xtermjs.html`)
  - Each `TerminalSession` has its own `this.env` map
  - `export VAR=value` sets env var; `env` lists all env vars

- [x] **Command aliases** (`xtermjs.html`)
  - `alias name='cmd'` sets alias; `alias` lists all; `unalias name` removes
  - Aliases loaded from `/home/user1/.aliases` on session init
  - Aliases resolved before PATH lookup in `processCommand`

- [x] **Inline images** (`xtermjs.html`)
  - `cat image.png` (and .jpg, .gif, .webp, .svg, .bmp) renders `<img>` preview in terminal pane

---

## Widgets

- [x] **RSS reader widget** (`/etc/widgets/rss.js`)
  - Widget shows a feed title + list of clickable headlines (open URL in `ui.iframe`)
  - Saves list of feed URLs to `/home/user1/rss-feeds.json`
  - "+" / "×" buttons in widget header to add/remove feed URLs
  - Fetches via `fetch()` + DOMParser (CORS-permitting feeds) or a CORS proxy

---

## Apps

- [x] **URL launcher / bookmarks** (`/home/user1/apps/bookmarks.js`, registered as `ui.bookmarks`)
  - Saved list of `{title, url}` entries in `/home/user1/bookmarks.json`
  - Clicking entry opens URL in `ui.iframe`; add/edit/delete inline; favicon preview

- [x] **Image viewer** — zoom/pan viewer registered as `ui.imageviewer`
- [x] **Spotlight launcher** — Alt+Space overlay

---

## Settings

- [x] **Theme builder** (`/etc/settings/14-theme-builder.js`)
  - Live color pickers + range sliders for all `--wm-*` CSS vars; applies instantly
  - "Save as new theme" writes `/etc/wm/themes/<name>.json`

- [x] **Font settings** (`/etc/settings/15-fonts.js`)
  - UI font + mono font pickers (Google Fonts); live preview; saved to `/user-preferences.json`

- [x] **App manager** (`/etc/settings/16-app-manager.js`)
  - Lists all registered commands; "Pin" saves to preferences; "Launch" opens the app

- [x] **Startup apps** (`/etc/settings/17-startup.js`)
  - Checkbox list for boot-time auto-launch; raw editor for `/home/user1/initd.run`

- [x] **Cron job editor** (`/etc/settings/18-cron.js`)
  - Visual time-field editor for `/etc/crontab`; add/edit/delete entries

- [x] **Keyboard shortcuts** — `/etc/settings/09-keybindings.js`
- [x] **Boot log** — `/etc/settings/10-bootlog.js`
- [x] **VFS snapshot** — `/etc/settings/11-vfs-snapshot.js`
- [x] **Storage backend** — `/etc/settings/08-storage.js`
- [x] **Notifications demo** — `/etc/settings/13-notifications.js`

---

## Desktop / Platform

- [x] **All apps listing** (`/home/user1/apps/app-launcher.js`, registered as `ui.app-launcher`)
  - Searchable icon grid of all registered commands; Enter launches first match

---

## Done

- [x] **Shell history persistence** — `xtermjs.html` (`HISTORY_FILE`, `loadHistory`, `appendHistory`)
- [x] **Tab completion** — `xtermjs.html`: Tab key handler
- [x] **Keyboard shortcuts manager** — `/etc/settings/09-keybindings.js` + `src/remote.ts`
- [x] **Boot log** — `src/index.ts` + `/etc/settings/10-bootlog.js`
- [x] **VFS snapshot** — `/etc/settings/11-vfs-snapshot.js`
- [x] **File search** — `explorer.js` search icon, recursive filter
- [x] **Notification / toast system** — `src/remote.ts` `notify` command
- [x] **Spotlight launcher** — `/opt/spotlight.js`, Alt+Space keybinding
- [x] **Sticky notes widget** — `/etc/widgets/sticky-notes.js`
- [x] **Image viewer** — `/home/user1/apps/imageviewer.js`
- [x] **Force reload meta.json files** — Settings → Storage page
- [x] **Storage backend switch** — `src/index.ts` + Settings → Storage
- [x] **Query-param app launcher** — `src/remote.ts` `?app=` / `?apps=`
- [x] **Alt-based keybindings** — `src/remote.ts` + `09-keybindings.js`
- [x] **Exit command** — `xtermjs.html`
- [x] **Widget clamp removed** — `src/core/layout/index.tsx`
- [x] **Notifications demo** — `/etc/settings/13-notifications.js`
