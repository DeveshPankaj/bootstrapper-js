# Dashboard

**Source:** `docs/public/mount/home/user1/apps/dashboard.html` (VFS, `force_reload: true`)  
**Launcher script:** `docs/public/mount/home/user1/apps/dashboard.js` (VFS, `force_reload: true`)  
**Config:** `docs/public/mount/home/user1/dashboard.json` (VFS, `force_reload: false` — user-editable)  
**Command:** `ui.dashboard`

## Overview

The dashboard is a personal bookmark and card manager. It opens as a standard windowed app (via `ui.iframe`) with two tabs:

1. **Bookmarks** — grouped link cards with emoji, title, URL, and description.
2. **Widgets** — headless desktop widgets spawned and owned by the dashboard.

## Config format (`dashboard.json`)

```json
{
  "groups": [
    {
      "id": "unique-id",
      "name": "Group Name",
      "color": "#hexcolor",
      "bookmarks": [
        {
          "id": "unique-id",
          "emoji": "🔗",
          "title": "Link title",
          "url": "https://...",
          "description": "Optional description"
        }
      ]
    }
  ]
}
```

Config is read from and written to `/home/user1/dashboard.json` on the VFS. Changes are saved automatically on edit.

## Bookmarks tab

- Groups display as colored sections with an accent bar.
- Cards are clickable and open the URL in a new tab.
- Search bar filters cards across all groups by title, URL, or description.
- Edit mode (pencil button) enables adding/renaming groups, adding/editing/deleting bookmarks.

## Widgets tab

Dashboard widgets are **headless** — they have no window chrome of their own. They appear as draggable overlay panels (the same style as system widgets) on the desktop.

### Launching a widget

```javascript
window.platform.host.registerWidget('dash-widget-<id>', (container, api) => {
    // container is a DOM element in the main document
    // api.onDestroy(fn) registers cleanup
    container.textContent = 'Hello';
}, { alwaysVisible: true, title: 'My Widget' });
```

The `alwaysVisible: true` meta flag causes `WidgetsPanel` to show the widget regardless of the user's enabled-widget settings.

### Widget types

| Type | Description |
|---|---|
| Clock | Shows current time and date, updated every second |
| iframe | Embeds a URL in an iframe panel |
| Note | Displays static text |
| Custom | Runs user-provided JavaScript with `body`, `platform`, `document`, `api` in scope |

### Widget lifetime

Widgets are tied to the dashboard window:
- `setupCleanup()` calls `window.platform.getServiceSync('props')?.onDestroy(cb)` to register a teardown callback.
- On dashboard close, the callback calls `remove()` on every active widget via `activeWidgetRemovers`.
- The widget's `api.onDestroy(fn)` is called by `WidgetItem` on React unmount.

### Clock widget internals

The clock render function uses `container.ownerDocument` (main document) for DOM creation, since `container` is a main-document element. It sets up a `setInterval` and registers `api.onDestroy(() => clearInterval(...))` for cleanup.

## Opening the dashboard

From the desktop context menu: right-click → **Dashboard**.  
Programmatically: `platform.host.callCommand('ui.dashboard')`.

## Adding the dashboard to initd

`/home/user1/initd.run` contains:
```
service('root', 'exec')('/home/user1/apps/dashboard.js');
```

This registers the `ui.dashboard` command at boot so the desktop context menu entry works immediately.
