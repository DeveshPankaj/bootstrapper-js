# Layout System

**Source:** `src/core/layout/index.tsx`

## Overview

The layout system is a CSS Grid–based desktop shell. It supports multiple named layout presets (stored in the VFS) and switches between them reactively without remounting any components.

## Grid areas

Each layout defines a `grid-template-areas` string with up to five named areas:

| Area | Role |
|---|---|
| `header` | Top taskbar |
| `left-nav` | Left sidebar |
| `right-nav` | Right sidebar |
| `footer` | Bottom bar |
| `content-area` | Window canvas — where app windows live |

`LayoutShell` renders only the `<div>` elements for areas that actually appear in the active layout's `areas` string (computed via `usedAreas`). Rendering unused grid-area divs creates implicit tracks that overflow the grid — this is why `usedAreas` is always computed from the actual template string.

## Layout config files

All layout config is stored in the VFS under `/etc/wm/`:

```
/etc/wm/layouts.json    Array of LayoutDef objects — all available layout presets
/etc/wm/config.json     { "layout": "<id>" } — which preset is currently active
```

If either file is missing or invalid, the code falls back to `DEFAULT_LAYOUTS` (defined inline in `layout/index.tsx`).

## Switching layouts

`layoutSubject` is an RxJS `BehaviorSubject<string>` that holds the active layout ID. Subscribing to it re-renders `LayoutShell` without unmounting. The `set-layout` command (registered as both a platform service and a host command) writes the new ID to `config.json` and pushes to the subject.

## CSS Grid gotcha

The `.content-area` must have:
```css
min-height: 0;
min-width: 0;
overflow: hidden;
```

Grid items default to `min-height: auto`, which lets content dictate track size and can push the grid beyond `1fr` bounds. `min-height: 0` overrides this.

## Desktop icons

`ListDirComponent` from `src/apps/file-explorer/desktop.tsx` renders the desktop icon grid inside `.content-area`. Its `.desktop-icons` wrapper must use `height: 100%` (not `100vh`) to stay inside the grid track.

## Wallpaper

The wallpaper is a CSS `background-image` on `.layout-default`. Because the constructable stylesheet's `url()` requests are not intercepted by the service worker, wallpaper files are read directly from the VFS and converted to blob URLs rather than using `/(sw)/...` URLs.

## Adding a layout preset

1. Add an entry to `docs/public/mount/etc/wm/layouts.json` with `id`, `name`, and a valid `grid` object (`areas`, `columns`, `rows`).
2. Reload — the Settings → Layout page lists all presets from that file.
