# bootstrapper-js — Core Feature Documentation

Browser-based web OS built with TypeScript + React + BrowserFS.

## Core systems

| Document | Topic |
|---|---|
| [core/vfs.md](core/vfs.md) | Virtual filesystem — BrowserFS, boot sequence, FHS layout, file execution |
| [core/layout.md](core/layout.md) | CSS Grid layout system — presets, areas, wallpaper, desktop icons |
| [core/window-manager.md](core/window-manager.md) | Window appearance (CSS vars, themes) and behavior (/opt/window-manager.js) |

## Apps

| Document | Topic |
|---|---|
| [apps/terminal.md](apps/terminal.md) | xterm.js terminal — sessions, command pipeline, I/O redirection, variables |
| [apps/file-explorer.md](apps/file-explorer.md) | File explorer — drag & drop, icons, navigation, two parallel implementations |
| [apps/dashboard.md](apps/dashboard.md) | Dashboard — bookmarks, headless widgets, config format |

## Features

| Document | Topic |
|---|---|
| [features/widgets.md](features/widgets.md) | Desktop widgets — registration, visibility, cron scheduling |
| [features/window-snap.md](features/window-snap.md) | Window snap — 4 quadrants + halves + maximize, snap zones, preview |

## API reference

| Document | Topic |
|---|---|
| [api/platform.md](api/platform.md) | Platform & Host classes — command registry, service registry, exec, FS access |
| [api/props.md](api/props.md) | UICallbackProps — window lifecycle, title, visibility, signals, messaging |
| [api/commands.md](api/commands.md) | All registered commands — process, layout, WM, system, UI apps |
| [api/shell.md](api/shell.md) | Terminal shell — built-ins, .run file commands, operators, history, tab completion |
| [api/signals.md](api/signals.md) | SIGTERM / SIGKILL — delivery order, /proc/ filesystem, receiving in iframes |
| [api/keybindings.md](api/keybindings.md) | Keyboard shortcut system — config file, modifiers, reload |
| [api/user-preferences.md](api/user-preferences.md) | UserPreference API — wallpaper, preferences file structure |
| [api/settings-sections.md](api/settings-sections.md) | Custom settings pages — registration, SettingsSectionApi |

## Build & dev

```bash
pnpm start        # dev server at http://localhost:8080
npx webpack       # production build → ./docs
```

Output goes to `./docs` (also the GitHub Pages root). The build always emits one pre-existing warning about `src/shared/babel.js` — this is expected and can be ignored.
