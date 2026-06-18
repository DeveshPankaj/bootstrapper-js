# Shell Command Reference

**Sources:** `docs/public/mount/home/user1/apps/xtermjs.html` (built-ins, parsing, history), `docs/public/mount/bin/*.run` (all file commands)

The bootstrapper-js terminal is an xterm.js 5.3.0 session that executes commands in two ways:
1. **Built-in commands** — handled directly by `handleInternalCommands` in the terminal app.
2. **File commands** — `.run` files found in `PATH` directories (`/bin:/usr/bin`) are executed via `platform.host.exec`.

---

## Built-in commands

These are handled before any file lookup and cannot be overridden by `.run` files.

### `cd [path]`

Change the current working directory for this terminal session. Updates the prompt display.

- `cd /home/user1` — absolute path
- `cd projects` — relative to current directory
- `cd ..` — go up one level
- `cd` with no argument: prints "cd: missing operand" (unlike bash, does not go to `$HOME`)

```
root@pankajdevesh.com: ~/home/user1$ cd projects
root@pankajdevesh.com: ~/home/user1/projects$
```

### `export VAR=value`

Set an environment variable for this terminal session. Variables set with `export` are available for `echo` expansion and passed into `.run` scripts via the `context` service.

```
root@pankajdevesh.com: ~/home/user1$ export API_URL=https://example.com
```

### `env`

List all environment variables set with `export` in the current session.

```
root@pankajdevesh.com: ~/home/user1$ env
API_URL=https://example.com
MY_VAR=hello
```

### `alias [name[=value]]`

Define or list aliases. Aliases are stored in `/home/user1/.aliases` (format: `alias name=value` per line) and reloaded on each new terminal session.

- `alias` — list all defined aliases
- `alias gs` — show value of alias `gs`
- `alias gs=git status` — define alias `gs` (note: no need to quote for single words)

Aliases are expanded at command dispatch time: if the first token of a command matches an alias, it is replaced before execution.

### `unalias name`

Remove an alias from the current session.

```
root@pankajdevesh.com: ~/home/user1$ unalias gs
```

### `exit`

- If multiple tabs are open: closes the current tab.
- If this is the last tab: clicks the window's close button (sends SIGTERM to the terminal window process).

---

## Shell operators

Parsed by `parseRedirects()` before command dispatch. These work on any command, including `.run` file commands.

### `command > file`

Redirect stdout to a file (overwrite). The terminal output is captured (with ANSI codes stripped) and written to the resolved VFS path.

```
root@pankajdevesh.com: ~/home/user1$ ls > /tmp/listing.txt
```

### `command >> file`

Redirect stdout to a file (append). Existing content is preserved.

```
root@pankajdevesh.com: ~/home/user1$ date >> /tmp/log.txt
```

### `command < file`

Pass file path as last argument (stdin simulation). Resolves to an absolute VFS path and appends it to the command's argument list. Used to feed a file to commands that accept a path.

```
root@pankajdevesh.com: ~/home/user1$ cat < myfile.txt
```

---

## Quoting and argument parsing

`parseArgs()` handles quoted strings so filenames with spaces work correctly:

- `"double quoted string"` — strip quotes, preserve spaces inside
- `'single quoted string'` — strip quotes, preserve spaces inside

```
root@pankajdevesh.com: ~/home/user1$ edit "my notes.txt"
root@pankajdevesh.com: ~/home/user1$ cp 'source file.txt' destination.txt
```

---

## Variable expansion

Available in `.run` scripts via `echo.run`'s `resolveVariable`. The `context` service is passed to `.run` scripts as a flat object containing session variables, `PWD`, `HOME`, and any `export`-ed variables.

| Syntax | Expands to |
|---|---|
| `$VAR` | Value of `VAR` from context |
| `${VAR}` | Value of `VAR` from context |
| `$(VAR)` | Value of `VAR` from context |

Unset variables expand to an empty string.

---

## File system commands

All sourced from `/bin/*.run`.

### `ls [path]`

List directory contents. Directories are shown in blue (ANSI `\x1b[34m`), files in default color. Output format: `<type>rwxr-xr-x 1 user group <size> <mtime> <name>`.

- `ls` — list current directory
- `ls /home/user1` — list a specific path

```
root@pankajdevesh.com: ~/home/user1$ ls
-rwxr-xr-x 1 user group 1234  6/18/2026 apps
-rwxr-xr-x 1 user group  512  6/18/2026 settings.html
```

### `cat file`

Print file contents to the terminal. For image files (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.bmp`), the terminal renders an inline image preview (blob URL converted from VFS bytes) instead of binary output.

```
root@pankajdevesh.com: ~/home/user1$ cat notes.txt
root@pankajdevesh.com: ~/home/user1$ cat photo.jpg    # shows inline image
```

### `cp src dest`

Copy a file within the current directory. Paths are relative to the current directory (`pwd`).

```
root@pankajdevesh.com: ~/home/user1$ cp notes.txt notes-backup.txt
```

### `mv src dest`

Move or rename a file or directory within the current directory. Uses `fs.renameSync`.

```
root@pankajdevesh.com: ~/home/user1$ mv draft.txt final.txt
```

### `rm file`

Delete a file from the VFS. File path is relative to the current directory.

```
root@pankajdevesh.com: ~/home/user1$ rm temp.txt
```

### `pwd`

Print the current working directory.

```
root@pankajdevesh.com: ~/home/user1$ pwd
/home/user1
```

### `echo [args...]`

Print arguments to the terminal with variable expansion (`$VAR`, `${VAR}`, `$(VAR)`). Outputs with `\r\n`.

```
root@pankajdevesh.com: ~/home/user1$ echo Hello $USER
Hello root
```

### `head file [n]`

Print the first `n` lines of a file (default: 10). File path is relative to `pwd`.

```
root@pankajdevesh.com: ~/home/user1$ head notes.txt 5
```

### `tail file [n]`

Print the last `n` lines of a file (default: 10). File path is relative to `pwd`.

```
root@pankajdevesh.com: ~/home/user1$ tail log.txt 20
```

### `tree [path]`

Print a recursive directory tree. Directories are shown in blue. Summary line shows directory and file counts.

```
root@pankajdevesh.com: ~/home/user1$ tree
/home/user1
├── apps/
│   ├── explorer.js
│   └── xtermjs.html
└── notes.txt
1 directories, 3 files
```

### `edit file`

Open a file in the Notepad editor app. Opens a new window. File path relative to `pwd`.

```
root@pankajdevesh.com: ~/home/user1$ edit notes.txt
```

### `editor file`

Alias for `edit` — opens a file in the Notepad editor.

### `clear`

Clear the terminal screen. Sends `\x1b[2J\x1b[0;0H` (erase screen + home cursor).

---

## Process & system commands

### `ps`

List running processes in a table. Output columns: `PID`, `NAME`, `TITLE`, `UPTIME`, `SERVICES`. Calls `process.list`.

```
root@pankajdevesh.com: ~/home/user1$ ps
PID  NAME              TITLE       UPTIME    SERVICES
1    ui.file-explorer  Files       0h 2m 14s fs, terminal
2    ui.notepad        notes.txt   0h 0m 5s  fs
```

### `kill pid`

Send SIGTERM to a process by PID. Checks `/proc/<pid>` exists before calling `process.kill`.

```
root@pankajdevesh.com: ~/home/user1$ kill 2
Terminated process 2
```

### `htop`

Interactive process monitor. Refreshes every 1 second. Press `q` or `Q` or `Ctrl+C` to quit. Shows the same columns as `ps` but live-updating.

### `sleep secs`

Pause execution for the given number of seconds. Supports decimals. The command is async — the terminal's `busy` flag prevents other input while it waits.

```
root@pankajdevesh.com: ~/home/user1$ sleep 2.5
```

### `msg pid message...`

Send a message to a running process by PID. Calls `process.send-message`. The message is delivered live to any `onMessage` handler and appended to `/proc/<pid>/inbox.json`.

```
root@pankajdevesh.com: ~/home/user1$ msg 3 refresh
Sent message to process 3
```

---

## Network & info commands

### `ifconfig`

Show network information. Fetches the public IP from `https://api.ipify.org?format=json` and displays it.

```
root@pankajdevesh.com: ~/home/user1$ ifconfig
Public IP: 123.456.78.90
```

### `date`

Print the current date and time using `new Date().toLocaleString()`.

```
root@pankajdevesh.com: ~/home/user1$ date
6/18/2026, 10:30:00 AM
```

### `info`

Print an animated system info banner. Shows an ASCII art icon with color-cycling animation alongside personal/system info lines. Runs automatically on terminal session start (boot banner).

### `help`

Display a formatted table of available commands with descriptions. Output is framed in a box using ASCII art borders.

---

## Python

### `python [file.py]`

Open the Python (Pyodide) REPL window. If a `.py` file path is given, the file is loaded on open. The path can be absolute or relative to `pwd`.

```
root@pankajdevesh.com: ~/home/user1$ python
root@pankajdevesh.com: ~/home/user1$ python scripts/hello.py
```

Requires the `ui.python` command to be registered (i.e. the Python module must be loaded). Prints an error if it is not.

---

## Command history

Command history is persisted to `/home/user1/.bash_history`, one command per line. New commands are appended on each Enter.

### `history`

Print all commands in history with line numbers.

```
root@pankajdevesh.com: ~/home/user1$ history
1  ls
2  cd projects
3  cat notes.txt
```

### Arrow key navigation

- `↑` (Up arrow) — recall the previous command in history.
- `↓` (Down arrow) — move forward in history; clears input when past the end.

History navigation works while the terminal is not busy.

---

## Tab completion

Press `Tab` to complete the current token:

- **First token (command name):** Completes against command names found in `PATH` directories (files ending in `.run`, stripped of the extension), plus built-in commands (`cd`, `export`, `env`, `alias`, `unalias`, `exit`) and any defined alias names.
- **Subsequent tokens (file paths):** Completes against VFS entries in the relevant directory. Directories get a trailing `/`.

If there is exactly one match, it is completed in-place. If there are multiple matches, they are listed below the current line and the prompt is redrawn.
