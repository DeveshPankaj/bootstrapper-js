# Terminal

**Source:** `docs/public/mount/home/user1/apps/xtermjs.html`  
**Opened via:** `command('ui.xtermjs')` or Alt+T shortcut

## Architecture

The terminal is a self-contained HTML app running inside a `ui.iframe` window. It uses **xterm.js 5.3.0** (DOM renderer) and supports multiple tabbed sessions.

### Session lifecycle

Each `TerminalSession` calls `initializeTerminal()` which is async:
1. `terminal.open(element)` — must happen before any resize call.
2. `resizeTerminal()` — called after `open()` to size correctly.
3. `await processCommand('info')` — displays the boot banner.
4. `displayPrompt()` — shows the prompt and accepts input.

`terminal.resize()` must **never** be called before `terminal.open()`. Doing so corrupts the buffer once it scrolls (overlapping rows from earlier lines reappear). `activate(session)` guards resize behind `if (session.terminal.element)`.

## Command processing pipeline

```
user input  →  processEnterKey()
            →  runWithRedirects(raw)      (handles >, >>, < operators)
            →  parseRedirects(raw)        (tokenizes redirects)
            →  processCommand(cmd)
            →  parseArgs(cmd)             (splits on whitespace, respects quotes)
            →  findCommandFile(name)      (looks in PATH for <name>.run)
            →  platform.host.exec(...)   (runs the .run file)
```

If no `.run` file is found, `handleInternalCommands()` handles built-ins.

## Built-in commands

| Command | Description |
|---|---|
| `cd [path]` | Change working directory |
| `export VAR=value` | Set an environment variable |
| `env` | List all exported variables |
| `alias [name=value]` | Define or list aliases |
| `unalias name` | Remove an alias |
| `exit` | Close the current tab (or the window if last tab) |

## I/O redirection

`parseRedirects(raw)` tokenizes the command line into command tokens and redirect operators:

| Operator | Behavior |
|---|---|
| `> file` | Redirect stdout to file (overwrite) |
| `>> file` | Redirect stdout to file (append) |
| `< file` | Pass file path as last argument (simulates stdin) |

When output is redirected, `runWithRedirects` monkey-patches `terminal.write` to capture text (ANSI codes stripped), then writes to the VFS file.

## Variable expansion

Shell variables are expanded inside `.run` command files using context passed via `platform.register('context', {...env})`. The terminal merges `this.context` and `this.env` (from `export` commands) into this context before each command runs.

Variable substitution syntax (in scripts like echo.run):
- `$VAR`, `${VAR}`, `$(VAR)` → expanded from context

## Environment

- `PWD` — current working directory
- `HOME` — `/home/user1`
- `PATH` — colon-separated list of directories to search for `.run` files (e.g. `/bin:/usr/bin`)
- Exported variables from `export VAR=value` are merged into context per command

## Testing

`window.__terminalApp` exposes the `TerminalApp` instance. For testing xterm.js output, use the buffer API:

```javascript
const session = window.__terminalApp.sessions[0];
const buf = session.terminal.buffer.active;
for (let i = 0; i < buf.length; i++) {
    console.log(buf.getLine(i)?.translateToString(true));
}
```

Do **not** read `.xterm-rows` innerText — it breaks if a non-DOM renderer is ever used.
