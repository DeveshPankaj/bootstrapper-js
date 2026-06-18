# Window Snap

**Source:** `src/shared/draggable.ts`

## Overview

When a window is dragged near the edges or corners of the content area, it snaps to one of seven preset positions on mouse release. A semi-transparent blue preview shows the target position while dragging.

## Snap zones

Snap zones are detected based on the mouse cursor's position relative to the `.content-area` element:

```
┌──────┬─────────────────────────┬──────┐
│      │                         │      │
│  TL  │       top edge          │  TR  │  ← CORNER_SIZE px from corner
│      │      (maximize)         │      │
├──────┤                         ├──────┤
│      │                         │      │
│ left │    (no snap zone)       │right │  ← EDGE_SIZE px from edge
│ half │                         │ half │
│      │                         │      │
├──────┤                         ├──────┤
│  BL  │                         │  BR  │
└──────┴─────────────────────────┴──────┘
```

| Zone | Mouse position | Result |
|---|---|---|
| `top-left` | Within `CORNER_SIZE` of top-left corner | Top-left quadrant (50% × 50%) |
| `top-right` | Within `CORNER_SIZE` of top-right corner | Top-right quadrant (50% × 50%) |
| `bottom-left` | Within `CORNER_SIZE` of bottom-left corner | Bottom-left quadrant (50% × 50%) |
| `bottom-right` | Within `CORNER_SIZE` of bottom-right corner | Bottom-right quadrant (50% × 50%) |
| `left` | Within `EDGE_SIZE` of left edge (not corner) | Left half (50% × 100%) |
| `right` | Within `EDGE_SIZE` of right edge (not corner) | Right half (50% × 100%) |
| `maximize` | Within `EDGE_SIZE` of top edge (not corner) | Full content area (100% × 100%) |

**Constants** (in `draggable.ts`):
- `CORNER_SIZE = 80` pixels — radius from each corner that triggers a quadrant snap.
- `EDGE_SIZE = 30` pixels — distance from a side edge that triggers a half/maximize snap.

Corner zones take priority over edge zones because they are checked first.

## How it works

### During drag (`elementDrag`)

1. On each mouse move, `detectSnapZone(mouseX, mouseY, contentAreaBounds)` checks whether the cursor is inside any snap zone.
2. If the zone changes, `updatePreview(zone)` shows or moves a `.snap-preview` div.
3. The `.snap-preview` is appended to `document.body` with `position: fixed`, positioned to match the target snap rectangle using `getBoundingClientRect()` coordinates.
4. The window continues to follow the mouse normally — the preview is purely visual.

### On mouse release (`closeDragElement`)

1. If `currentSnapZone` is non-null, `buildSnapRect(zone, contentAreaBounds)` computes the target rectangle.
2. The window's `style.left`, `style.top`, `style.width`, `style.height` are set to the snap rectangle values.
3. The preview is removed and `currentSnapZone` is cleared.
4. If no snap zone was active, the window stays wherever it was dragged.

### Coordinate system

`getBoundingClientRect()` returns viewport-relative coordinates. Since `<body>` has `margin: 0; padding: 0`, viewport coordinates equal body-relative coordinates. Windows use `position: absolute` with `document.body` as their offset parent, so the same coordinates apply directly to `style.left` / `style.top`.

## Snap preview CSS

```css
.snap-preview {
    position: fixed;
    z-index: 99;
    background: rgba(10, 132, 255, 0.12);
    border: 2px solid rgba(10, 132, 255, 0.45);
    border-radius: var(--wm-radius, 6px);
    pointer-events: none;
    transition: left 0.08s ease, top 0.08s ease,
                width 0.08s ease, height 0.08s ease;
}
```

The preview uses the WM theme's `--wm-radius` so it visually matches snapped windows. The `transition` gives it a subtle animation when moving between snap zones.

## Interaction with fullscreen

The snap mechanism is independent of the double-click fullscreen toggle (wired in `/opt/window-manager.js`). Snapping a window and then double-clicking the header will correctly save and restore the snapped dimensions via the `data-prev-*` attributes used by `toggleFullScreen`.

## Tuning

To adjust snap sensitivity, change `CORNER_SIZE` and `EDGE_SIZE` at the top of `src/shared/draggable.ts`. A larger `CORNER_SIZE` makes quadrant snapping easier to trigger; a larger `EDGE_SIZE` makes edge/maximize snapping easier.
