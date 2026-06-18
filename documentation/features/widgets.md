# Desktop Widgets

**Source:** `src/core/layout/index.tsx` (`WidgetsPanel`, `WidgetItem`)  
**Widget scripts:** `/etc/widgets/*.js` (VFS, `force_reload: false`)  
**Cron schedule:** `/etc/crontab` (VFS, `force_reload: false`)

## Overview

Desktop widgets are headless, draggable overlay panels rendered on the `.widgets-panel` layer. They sit above the wallpaper but below windows (z-index 5). The panel has `pointer-events: none`; individual widgets restore `pointer-events: auto`.

## Registering a widget

```javascript
platform.host.registerWidget(name, render, meta)
```

| Parameter | Type | Description |
|---|---|---|
| `name` | string | Unique identifier (used for enable/disable by the user) |
| `render` | `(container: HTMLElement, api: { platform, onDestroy }) => void` | Render function — populates `container` with widget DOM |
| `meta` | object | Optional metadata: `title`, `alwaysVisible` |

Returns `{ remove: () => void }` — calling `remove()` unmounts the widget from the panel.

## Widget visibility

The `WidgetsPanel` checks the user's enabled-widget list (stored in `/user-preferences.json`). A widget is shown if:

- Its name is in the user's `enabledWidgets` list, **or**
- Its `meta.alwaysVisible` flag is `true` (used by dashboard-spawned widgets — see [dashboard.md](../apps/dashboard.md))

Widgets not in `DEFAULT_HIDDEN_WIDGETS` are shown by default if no preference is set.

## Widget positioning

Each `WidgetItem` renders a `<div class="widget">` with `position: absolute` inside `.widgets-panel`. Position is persisted per widget name in `/user-preferences.json` under `widgetPositions`. Widgets are draggable (their own drag handler, separate from window drag).

## CSS variables

Widget appearance inherits from the window manager theme via CSS custom properties:

```css
.widgets-panel .widget {
    background: var(--wm-window-bg, rgba(255, 255, 255, 0.15));
    backdrop-filter: blur(var(--wm-blur, 10px));
    border-radius: var(--wm-radius, 8px);
    box-shadow: var(--wm-shadow, ...);
    color: var(--wm-header-color, #1d1d1f);
}
```

## Writing a widget script

Widget scripts live in `/etc/widgets/` and are loaded via the cron system or explicitly. A minimal widget:

```javascript
const platform = window.platform;

platform.host.registerWidget('my-widget', (container, api) => {
    container.textContent = 'Hello, world!';
    const interval = setInterval(() => {
        container.textContent = new Date().toLocaleTimeString();
    }, 1000);
    api.onDestroy(() => clearInterval(interval));
}, { title: 'My Widget' });
```

## Cron-driven widgets

`/etc/crontab` schedules widget loading. The cron system reads the file on boot and runs the referenced scripts at the specified intervals.

## Cleanup

`api.onDestroy(fn)` registers a teardown function called when the widget is removed (either by the user toggling it off or by the owning app closing). Always clean up `setInterval`, `setTimeout`, and event listeners here.
