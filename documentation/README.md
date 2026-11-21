# bootstrapper-js — Core Feature Documentation

Browser-based web OS built with TypeScript + React + BrowserFS.

## Core systems

| Document | Topic |
|---|---|
| [core/vfs.md](core/vfs.md) | Virtual filesystem — BrowserFS, boot sequence, FHS layout, file execution |
| [core/layout.md](core/layout.md) | CSS Grid layout system — presets, areas, wallpaper, desktop icons |
| [core/window-manager.md](core/window-manager.md) | Window appearance (CSS vars, themes) and behavior (/opt/window-manager.js) |

## Security

| Document | Topic |
|---|---|
| [security/README.md](security/README.md) | Security model — trust levels, attackers, invariants I1–I8, target sandbox architecture |
| [security/audit.md](security/audit.md) | Audit findings (KRN / BOOT / WIN / NET / APP) with locations, exploits, fixes, test ideas |
| [security/decisions.md](security/decisions.md) | Design decisions D1–D16 — opaque-origin sandboxes, capability broker, code delivery on GitHub Pages |

The plan and progress live in the root [TODO.md](../TODO.md); regression tests in `testing/scripts/security/`.

## Apps

| Document | Topic |
|---|---|
| [apps/terminal.md](apps/terminal.md) | xterm.js terminal — sessions, command pipeline, I/O redirection, variables |
| [apps/file-explorer.md](apps/file-explorer.md) | File explorer — drag & drop, icons, navigation, two parallel implementations |
| [apps/dashboard.md](apps/dashboard.md) | Dashboard — bookmarks, headless widgets, config format |
| [apps/remote-machines.md](apps/remote-machines.md) | Remote Machines — SSH through a bridge: connections, terminals (also in LXD containers), remote file browser |

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
