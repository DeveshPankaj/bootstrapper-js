# User Preferences API

**Sources:** `src/shared/index.ts` (`UserPreference` class), `src/core/layout/index.tsx` (wallpaper commands)

User preferences are stored in `/user-preferences.json` in the VFS. This file has `force_reload: false` (absent in `meta.json`), meaning it is written on first boot but never overwritten by app updates — user settings persist across sessions.

The `UserPreference` class is instantiated automatically when a Platform's `setHost()` is called, and is accessible as `platform.userPref`.

---

## Accessing preferences

```javascript
// In any VFS script:
const wallpaper = platform.userPref.getWallpaper();

// In compiled TS:
const wallpaper = Platform.getInstance().userPref.getWallpaper();
```

---

## API reference

### `platform.userPref.getWallpaper()` → `string | undefined`

Return the currently active wallpaper URL. Returns `undefined` if no wallpaper is set.

```javascript
const url = platform.userPref.getWallpaper();
// e.g. '/(sw)/home/user1/photos/bg.jpg'
```

### `platform.userPref.setWallpaper(url: string)`

Set the active wallpaper. Reads the preferences file first (to pick up any changes from other calls), updates `wallpaper`, and writes back.

```javascript
platform.userPref.setWallpaper('/(sw)/home/user1/photos/bg.jpg');
```

Also available as a command: `platform.host.callCommand('set-wallpaper', url)`.

### `platform.userPref.addWallpaper(url: string)`

Append a URL to the `wallpapers` list. Does not change the active wallpaper.

```javascript
platform.userPref.addWallpaper('/(sw)/home/user1/photos/new.jpg');
```

Also available as a command: `platform.host.callCommand('add-wallpaper', url)`.

### `platform.userPref.removeWallpaper(url: string)` → `string | undefined`

Remove a URL from the `wallpapers` list. If the removed URL was the active wallpaper:
- Falls back to `default_wallpaper` if set.
- Otherwise falls back to the first remaining item in `wallpapers`.
- If the list is now empty, `wallpaper` becomes `undefined`.

Returns the new active wallpaper URL (after potential fallback), or `undefined`.

```javascript
const newActive = platform.userPref.removeWallpaper('/(sw)/home/user1/photos/old.jpg');
```

Also available as a command: `platform.host.callCommand('remove-wallpaper', url)`.

### `platform.userPref.getWallpapersDir()` → `string | undefined`

Return the extra wallpapers folder path, if set. The Settings → Wallpaper page scans this directory for image files and shows them in the wallpaper picker alongside the `wallpapers` list.

```javascript
const dir = platform.userPref.getWallpapersDir();
// e.g. '/home/user1/wallpapers'
```

### `platform.userPref.setWallpapersDir(vfsPath: string)`

Set the wallpapers folder path. Stored as `wallpapers_dir` in `/user-preferences.json`.

```javascript
platform.userPref.setWallpapersDir('/home/user1/wallpapers');
```

Also available as a command: `platform.host.callCommand('set-wallpapers-dir', vfsPath)`.

### `platform.userPref.require(key: string)` → `any`

Get a preference by key, throwing an `Error` if the key is not present (or its value is falsy).

```javascript
try {
  const enabled = platform.userPref.require('enabledWidgets');
} catch (e) {
  // Key not set
}
```

---

## Preferences file structure

`/user-preferences.json` is a flat JSON object. Core fields:

```json
{
  "wallpaper": "/(sw)/home/user1/photos/bg.jpg",
  "wallpapers": [
    "/(sw)/home/user1/photos/bg.jpg",
    "/(sw)/home/user1/photos/alt.jpg"
  ],
  "default_wallpaper": "/(sw)/home/user1/photos/bg.jpg",
  "wallpapers_dir": "/home/user1/wallpapers",
  "enabledWidgets": ["clock", "shortcuts"],
  "widgetPositions": {
    "clock": { "top": "1rem", "right": "1rem" },
    "shortcuts": { "bottom": "2rem", "left": "1rem" }
  }
}
```

### Field descriptions

| Field | Type | Description |
|---|---|---|
| `wallpaper` | `string` | Active wallpaper URL shown on the desktop |
| `wallpapers` | `string[]` | User's saved wallpaper list shown in the Wallpaper picker |
| `default_wallpaper` | `string` | Fallback wallpaper used when the active one is removed |
| `wallpapers_dir` | `string` | Extra VFS folder scanned for wallpaper images |
| `enabledWidgets` | `string[]` | Widget names currently shown on the desktop |
| `widgetPositions` | `object` | Per-widget CSS position overrides |

Additional keys can be stored using direct VFS read/write.

---

## Read/write patterns for custom preferences

The `UserPreference` class only covers wallpaper-related fields natively. For other preferences, read and write the file directly:

```javascript
const fs = platform.host.getFS();
const PREFS_FILE = '/user-preferences.json';

// Read
let prefs = {};
try { prefs = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf-8')); } catch (_) {}

// Modify
prefs.myCustomSetting = 'value';

// Write
fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2));
```

---

## Notes

- Every `setWallpaper`, `addWallpaper`, `removeWallpaper`, and `setWallpapersDir` call re-reads the file before writing, so concurrent calls from different contexts (e.g. two open Settings windows) do not clobber each other's changes.
- Wallpaper URLs use the `/(sw)/` prefix so they are served through the service worker from the VFS. Web URLs (starting with `https://`) are supported as well.
- Folder-sourced images (from `wallpapers_dir`) are referenced as `/(sw)<dir>/<filename>` in the picker but are never added to the `wallpapers` list — they have no "Delete" action because they are not stored in preferences.
