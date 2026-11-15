// Settings > Architecture — interactive diagram of WOS core subsystems
const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')
const { useState } = React

const STYLE_ID = 'arch-diagram-style'

const NODES = [
  {
    id: 'vfs', label: 'VFS', sub: 'BrowserFS / IndexedDB',
    icon: 'storage', color: '#30d158',
    x: 30, y: 40, w: 155, h: 70,
    info: [
      { k: 'MountableFileSystem', v: 'Mounts /, /tmp, /mnt as separate IndexedDB stores',
        children: [
          { k: '/', v: 'IndexedDB (default) or raw LocalStorage, user-selectable' },
          { k: '/tmp, /mnt', v: 'IndexedDB mirror, or InMemory (ephemeral) under the LocalStorage backend' },
          { k: 'resolveFsBackend()', v: 'Reads __app_fs_backend__ / ?fsBackend= query param at boot' },
        ] },
      { k: 'AsyncMirror', v: 'In-memory mirror for sync access over async IndexedDB or LocalStorage' },
      { k: 'readFileSync(path, enc)', v: 'Synchronous read from in-memory mirror' },
      { k: 'writeFileSync(path, data)', v: 'Write to mirror; persisted to IndexedDB asynchronously' },
      { k: 'readdirSync / existsSync / statSync', v: 'Standard sync filesystem operations' },
      { k: 'FHS-lite layout', v: '/etc (config), /opt (apps), /home/user1 (user), /bin (commands)',
        children: [
          { k: '/bin/*.run', v: 'Built-in shell commands, run via execCommand/the terminal' },
          { k: '/etc/wm, /etc/settings, /etc/widgets', v: 'Window manager, Settings pages, desktop widgets' },
          { k: '/opt/apps/<name>/', v: 'Every bundled app now lives here (force_reload: true)' },
        ] },
    ],
  },
  {
    id: 'platform', label: 'Platform / Host', sub: 'shared/index.ts',
    icon: 'hub', color: '#0a84ff',
    x: 285, y: 40, w: 160, h: 70,
    info: [
      { k: 'Platform.getInstance()', v: 'Per-module singleton backed by the shared Host object' },
      { k: 'host.getFS()', v: 'Returns the shared BrowserFS VFS instance' },
      { k: 'host.execString(src, alias)', v: 'Babel-transpiles JSX/TS and runs it in a sandboxed shim' },
      { k: 'host.execCommand(str, platform)', v: 'Runs a tiny DSL in scope with the running command',
        children: [
          { k: "service('mod','svc')", v: 'Looks up a cross-module registered service' },
          { k: "command('name')", v: 'Resolves a registered Command by name' },
          { k: '$args', v: "The caller's raw argument array, available inside the DSL string" },
        ] },
      { k: 'host.registerCommand(name, cb, meta)', v: 'Prepends a command; last registered wins on lookup' },
      { k: 'platform.register / getService', v: 'Cross-module service registry (React, ReactDOM, settings…)' },
    ],
  },
  {
    id: 'wm', label: 'Window Manager', sub: 'window-manager.ts',
    icon: 'web_asset', color: '#bf5af2',
    x: 548, y: 40, w: 155, h: 70,
    info: [
      { k: 'createWindow(cmd)', v: 'Creates a draggable/resizable iframe window from a Command' },
      { k: 'windowsSubject', v: 'BehaviorSubject<WindowState[]> — reactive window list for dock and IPC' },
      { k: '/opt/window-manager.js', v: 'Re-read + execString on every createWindow for live behavior edits' },
      { k: 'setupWindow({ container, head, iframe })', v: 'Per-window event wiring: drag, fullscreen, bring-to-front' },
      { k: 'WM themes: /etc/wm/themes/*.json', v: 'Presets applied as CSS vars: --wm-header-bg, --wm-accent, …' },
      { k: 'WM styles: /opt/wm/*.js', v: 'default, classic, minimal, ubuntu, glass, tiling, canvas',
        children: [
          { k: 'default / classic / minimal', v: 'Stock window chrome variants' },
          { k: 'ubuntu / glass', v: 'Themed chrome matching a desktop metaphor' },
          { k: 'tiling', v: 'Snap-to-grid behavior instead of free dragging' },
        ] },
    ],
  },
  {
    id: 'layout', label: 'Layout Shell', sub: 'Desktop Manager',
    icon: 'dashboard', color: '#ff9f0a',
    x: 100, y: 245, w: 165, h: 70,
    info: [
      { k: 'LayoutShell (React)', v: 'CSS Grid desktop — header / left-nav / content-area / footer slots',
        children: [
          { k: 'usedAreas', v: 'Computed from grid.areas — unused slot divs are never rendered' },
          { k: 'commands.slot', v: "'header'|'left-nav'|'right-nav'|'footer'|'toolbar' placement for the dock" },
        ] },
      { k: 'layoutSubject', v: 'BehaviorSubject<LayoutDef> — reactive layout switches without remount' },
      { k: 'openVfsDock(id)', v: 'Injects position:fixed sandboxed iframe into document.body' },
      { k: '/etc/wm/layouts.json', v: 'Layout presets (grid-template-areas, slot commands)' },
      { k: 'set-layout command', v: 'Writes /etc/wm/config.json + pushes to layoutSubject' },
      { k: 'Desktop context menu', v: 'Right-click content-area → React portal menu via onContextMenu' },
    ],
  },
  {
    id: 'ipc', label: 'IPC System', sub: 'ipc.ts + /usr/lib/ipc.js',
    icon: 'sync_alt', color: '#5ac8fa',
    x: 468, y: 245, w: 165, h: 70,
    info: [
      { k: 'initIpc(fs)', v: 'Attaches postMessage listener on main window for all sandboxed iframes' },
      { k: 'registerIpcHandler(event, fn)', v: 'Registers a handler in the main-window Map' },
      { k: 'broadcastIpcEvent(event, data, doc)', v: 'Pushes wos-ipc-event to every child iframe' },
      { k: 'WmBridge: window.__wosWmBridge', v: 'Cross-bundle delegation object set by the layout bundle' },
      { k: 'wm.* handlers', v: 'getWindows / getLaunchItems / toggleWindow / launch' },
      { k: 'fs.* handlers', v: 'read / write / list / exists / mkdir / rm / stat',
        children: [
          { k: 'fs.read / fs.write', v: 'Proxies readFileSync/writeFileSync for sandboxed iframes' },
          { k: 'fs.list / fs.stat', v: 'readdirSync/statSync equivalents over postMessage' },
          { k: 'fs.exists / fs.mkdir / fs.rm', v: 'Remaining VFS primitives exposed to the dock SDK' },
        ] },
    ],
  },
  {
    id: 'dock', label: 'Dock Widget', sub: 'Sandboxed Iframe',
    icon: 'dock_to_bottom', color: '#ff375f',
    x: 268, y: 438, w: 198, h: 70,
    info: [
      { k: 'Sandboxed iframe', v: 'No allow-same-origin — strict JS context isolation from host page' },
      { k: 'ipc.js SDK', v: 'Promise-based postMessage wrapper inlined into iframe srcdoc' },
      { k: 'wm.getLaunchItems()', v: 'Pinned app list: { name, label, icon } from /etc/taskbar.json' },
      { k: 'wm.getWindows()', v: 'Open window list: { pid, name, title, minimized, active }' },
      { k: 'wm.windowsChanged event', v: 'Pushed by broadcastIpcEvent whenever windows change' },
      { k: 'Variants', v: '/opt/apps/dock/default.html (dark pill) · macos.html (glass bar)',
        children: [
          { k: 'default.html', v: 'Dark pill dock, horizontal icon row' },
          { k: 'macos.html', v: 'Light glass bar with magnification-style hover' },
        ] },
    ],
  },
  {
    id: 'systemd', label: 'systemd', sub: 'core/systemd.ts',
    icon: 'dns', color: '#ffd60a',
    x: 290, y: 245, w: 165, h: 70,
    info: [
      { k: '/etc/systemd/system/*.service', v: 'Unit files: [Unit]/[Service]/[Install] ini sections' },
      { k: '/etc/systemd/enabled.json', v: 'Autostart list — stand-in for WantedBy= target symlinks' },
      { k: 'startSystemd()', v: 'Activates every enabled unit at boot (multi-user.target)' },
      { k: 'activate(unit)', v: 'Runs ExecStart in an isolated Platform via execString/execCommand' },
      { k: "platform.getService('systemd')", v: 'onStop(cb) / isStopRequested() / log(...) — per-activation context' },
      { k: 'systemd.* commands', v: 'start / stop / restart / enable / disable / status / list / journal',
        children: [
          { k: 'systemd.start / .stop / .restart', v: 'Lifecycle control for one named unit' },
          { k: 'systemd.enable / .disable', v: 'Toggles autostart membership in enabled.json' },
          { k: 'systemd.status / .list / .journal', v: 'Inspection — one unit, all units, or its log lines' },
        ] },
      { k: '/bin/systemctl.run · Settings > Services', v: 'Terminal command and GUI front ends over the same commands' },
    ],
  },
  {
    id: 'command-registry', label: 'Command Registry', sub: 'platform/command-registry.ts',
    icon: 'list_alt', color: '#6c5ce7',
    x: 30, y: 560, w: 165, h: 70,
    info: [
      { k: 'CommandRegistry.getInstance()', v: 'Singleton shared via window.top.__wosCommandRegistry' },
      { k: 'register(name, exec, meta, platformName)', v: 'Prepends command; newest registration wins on lookup',
        children: [
          { k: 'duplicate name', v: 'console.warn but still prepends — shadows the earlier command' },
          { k: 'Object.freeze(cmd)', v: 'Registered Command objects are immutable' },
          { k: 'remove()', v: 'Filters this exact frozen object instance out of the list' },
        ] },
      { k: 'get(name)', v: 'Finds a command by name in the current BehaviorSubject snapshot' },
      { k: 'call(name, ...args)', v: 'Looks up a command and invokes cmd.exec(...args)' },
      { k: 'all()', v: 'Returns the full current Command[] list' },
      { k: 'forExtension(ext)', v: 'Commands whose meta.fileExtensions matches ext, specific-first',
        children: [
          { k: 'dotExt normalization', v: "Lowercases ext, ensures a leading '.'" },
          { k: "wildcard '*'", v: "meta.fileExtensions including '*' matches any file" },
          { k: 'sort order', v: 'Non-wildcard matches sorted alphabetically before wildcard ones' },
        ] },
      { k: 'commands$', v: 'Observable<Command[]> BehaviorSubject for reactive consumers' },
    ],
  },
  {
    id: 'process-manager', label: 'Process Manager', sub: 'platform/process-manager.ts',
    icon: 'memory', color: '#b08968',
    x: 290, y: 560, w: 165, h: 70,
    info: [
      { k: 'ProcessManager.getInstance()', v: 'Singleton shared via window.top.__wosProcessManager' },
      { k: 'spawn(id, opts)', v: 'Allocates a PID, creates a Namespace, records a ProcessRecord',
        children: [
          { k: 'new Namespace({pid, id, appDir, extraAcl})', v: 'Per-process filesystem/ACL sandbox object' },
          { k: 'opts.label', v: "Human-readable title (e.g. 'Model Builder') for listings" },
          { k: 'processes$.next(...)', v: 'Republishes Array.from(this._processes.values())' },
        ] },
      { k: 'kill(pid)', v: 'Deletes the process record and republishes the list' },
      { k: 'get(pid) / list()', v: 'Looks up one or all current ProcessRecords' },
      { k: 'reset()', v: 'Clears all processes, resets PID counter back to 2' },
      { k: '_pidCounter starts at 2', v: 'PID 1 reserved for systemd, like real init' },
      { k: 'processes$', v: 'Observable<ProcessRecord[]> consumed by Task Manager etc.' },
    ],
  },
  {
    id: 'activity-registry', label: 'Activity Registry', sub: 'Host class — shared/index.ts',
    icon: 'bolt', color: '#2ec4b6',
    x: 550, y: 560, w: 165, h: 70,
    info: [
      { k: 'registerActivity(initial)', v: 'Registers in-progress work not tied to a window/process',
        children: [
          { k: 'update(patch)', v: 'Object.freeze({...current, ...patch}); swaps it into activities$' },
          { k: 'end()', v: 'Filters the frozen activity object out of the BehaviorSubject' },
        ] },
      { k: 'ActivityDef type', v: '{ id, pid?, kind, label, state, startedAt, meta, onKill? }' },
      { k: 'killActivity(id)', v: 'Calls onKill() if present; returns false if missing or not killable',
        children: [
          { k: 'lookup', v: 'this.activities.getValue().find(a => a.id === id)' },
          { k: 'no onKill', v: "Returns false — distinguishes 'not killable' from failure" },
          { k: 'try/catch', v: 'Swallows exceptions from onKill(), returns false' },
        ] },
      { k: 'activities$', v: 'Observable<ActivityDef[]> for Task Manager / CLI listings' },
      { k: 'pid field (optional)', v: "Nests an activity under its owning window's process entry" },
      { k: 'analogous to', v: 'registerWidget / registerSettingsSection — same Host pattern' },
    ],
  },
  {
    id: 'cron', label: 'Cron', sub: 'core/cron.ts + /etc/crontab',
    icon: 'schedule', color: '#ff6b6b',
    x: 30, y: 660, w: 165, h: 70,
    info: [
      { k: 'startCronScheduler()', v: 'Polls crontab every 15s; runs due jobs once per minute',
        children: [
          { k: 'tick()', v: 'Reads /etc/crontab, filters due jobs, calls runJob on each' },
          { k: 'minuteKey(now)', v: "'YYYY-M-D-H-M' string; skips tick if same minute already ran" },
        ] },
      { k: 'parseCrontab(content)', v: 'Parses standard 5-field crontab lines into CronJob objects' },
      { k: 'fieldMatches(field, value)', v: 'Matches *, N, N,M, N-M, */N against a calendar value' },
      { k: 'runJob(job)', v: 'Runs a /path via host.exec, or a DSL string via execCommand',
        children: [
          { k: "command starts with '/'", v: 'Split into filepath + args, run via host.exec' },
          { k: 'otherwise', v: 'Run via host.execCommand — the service()/command() DSL' },
          { k: 'try/catch', v: 'console.error(...) — a bad job never kills the scheduler' },
        ] },
      { k: '/etc/crontab', v: '#-comments and blank lines ignored; 5-field syntax, e.g. */15 * * * *' },
      { k: '/opt/cron/check-public-ip.js', v: 'Example job: fetches api.ipify.org, writes /var/log/public-ip.txt' },
    ],
  },
  {
    id: 'widgets', label: 'Widgets', sub: 'registerWidget + /etc/widgets',
    icon: 'widgets', color: '#f4a261',
    x: 290, y: 660, w: 165, h: 70,
    info: [
      { k: 'host.registerWidget(name, render, meta)', v: 'Registers a desktop widget; render(container, api)' },
      { k: 'host.registerWidgetType(typeId, renderer)', v: 'Registers a configurable type for persisted widget instances' },
      { k: '/etc/widgets/*.js', v: 'clock, rss, public-ip, memory, shortcuts, sticky-notes, toolbar, notifications' },
      { k: 'WidgetsPanel (layout/index.tsx)', v: 'Subscribes to widgets$ + enabled list, renders the visible set',
        children: [
          { k: 'visibleWidgets', v: 'Filters by enabled list, else falls back to DEFAULT_HIDDEN_WIDGETS' },
          { k: 'handleRemove(name)', v: 'Removes a persisted widget or disables a built-in one' },
          { k: 'WidgetItem', v: 'Per-widget wrapper handling saved drag position + removal UI' },
        ] },
      { k: 'DEFAULT_HIDDEN_WIDGETS', v: 'toolbar, public-ip, sticky-notes, rss, shortcuts hidden by default' },
      { k: 'clock.js example', v: "registerWidget('clock', render, {title}); setInterval(update, 1000)" },
    ],
  },
  {
    id: 'deeplink', label: 'Deep Links', sub: 'kernel/deeplink.ts + usr/bin/deeplink.js',
    icon: 'link', color: '#4ea8de',
    x: 550, y: 660, w: 165, h: 70,
    info: [
      { k: 'parseDeepLink(hash)', v: '#open=<cmd>&app=<id>&arg=<str>; validates name against NAME_RE',
        children: [
          { k: 'hash, not query', v: 'Never sent to the server — safe for IPs/session data' },
          { k: 'arg', v: 'Capped at MAX_ARG = 20000 chars; passed only as data, never interpolated' },
        ] },
      { k: 'tryHandoffDeepLink(timeoutMs=800)', v: 'Pre-boot: offers link to an already-open tab' },
      { k: "DEEPLINK_CHANNEL = 'wos-deeplink'", v: 'Shared BroadcastChannel name for handoff/ack' },
      { k: 'meta.deepLink: true', v: 'Required opt-in flag on registerCommand to allow deep linking' },
      { k: 'hasDeepLinkTarget() / onDeepLink(arg)', v: 'Optional meta hooks routing into an already-open window' },
      { k: 'openLocally(link) (deeplink.js)', v: 'Loads /opt/apps/<app>/main.js if needed, waits for layout, opens window',
        children: [
          { k: 'channel.onmessage (t:open)', v: 'Checks hasTarget(cmd) before claiming the link' },
          { k: 'ack race', v: 'Each candidate tab waits random 0-40ms; first to ack wins' },
        ] },
    ],
  },
  {
    id: 'settings-app', label: 'Settings App', sub: 'home/user1/settings.html',
    icon: 'settings', color: '#8e8e93',
    x: 30, y: 760, w: 165, h: 70,
    info: [
      { k: "platform.getService('settings')", v: 'Registered on root platform — reachable from any module' },
      { k: 'registerSection(name, render, meta)', v: 'Wraps host.registerSettingsSection; tracks a remover' },
      { k: 'loadDynamicSettingsScripts()', v: 'execStrings each unregistered /etc/settings/*.js on open',
        children: [
          { k: 'getRegisteredSectionNames()', v: 'Snapshots settingsSections$ to skip already-loaded ones' },
          { k: 'fs.readdirSync + sort()', v: "Scans /etc/settings, '.js' files only, alphabetical order" },
        ] },
      { k: '/etc/settings/NN-name.js', v: 'Numbered filename prefix controls sidebar order (this page is 21-)' },
      { k: 'settingsSections$', v: 'Observable<SettingsSectionDef[]> backing the nav list' },
      { k: 'DynamicSettingsPage', v: 'Renders a section into a container; collects onDestroy callbacks',
        children: [
          { k: 'meta.title / icon / color', v: "Controls the nav item's label, icon, badge color" },
          { k: "meta.marginTop: 'auto'", v: 'Pushes this section (and later ones) to sidebar bottom' },
        ] },
    ],
  },
  {
    id: 'mesh-bridge', label: 'Mesh Bridge', sub: 'webrtc/main.html pub-sub',
    icon: 'device_hub', color: '#118ab2',
    x: 290, y: 760, w: 165, h: 70,
    info: [
      { k: 'webrtc.mesh.available', v: 'Command returning true once the mesh bridge has loaded' },
      { k: 'webrtc.mesh.myId', v: 'Returns { id, name } identifying this peer' },
      { k: 'webrtc.mesh.groups', v: 'Returns [{ gid, name, members:[{id,name,online}] }]' },
      { k: 'webrtc.mesh.send(gid, channel, payload)', v: 'Relays payload to a group channel over existing peer conns',
        children: [
          { k: 'meshSend(gid, channel, payload)', v: "Looks up group members, sends over each one's connection" },
          { k: 'return value', v: '{ ok, sentTo } on success, or { ok:false, err } on failure' },
        ] },
      { k: 'webrtc.mesh.subscribe(channel, handler)', v: 'handler(gid, fromPeerId, fromName, payload)',
        children: [
          { k: 'meshSubscribers Map', v: 'channel -> Set<handler>, lazily created per channel' },
          { k: 'unsubscribe()', v: "Deletes this handler from the channel's Set" },
        ] },
      { k: 'Used by', v: 'distributed-compute and distributed-kv, piggybacking on open WebRTC groups' },
    ],
  },
  {
    id: 'file-explorer', label: 'File Explorer', sub: 'two parallel implementations',
    icon: 'folder', color: '#e63946',
    x: 30, y: 860, w: 165, h: 70,
    info: [
      { k: "main.js → registerCommand('explorer')", v: 'VFS-script implementation at /opt/apps/file-explorer' },
      { k: "index.tsx → registerCommand('ui.file-explorer')", v: 'Bundled TS/React implementation, kept in sync by hand' },
      { k: 'ListDirConponent (main.js)', v: 'Deliberate typo — keeps the two copies visually distinguishable' },
      { k: 'ListDirComponent (index.tsx)', v: 'Correctly spelled counterpart in the bundled implementation' },
      { k: 'DetailsPanel({ paths })', v: 'Stat/size/thumbnail panel for selection; multi-select summary',
        children: [
          { k: 'DETAILS_PREVIEW_EXTS', v: 'png/jpg/jpeg/gif/webp/svg/bmp/ico/avif get a thumbnail' },
          { k: 'thumbUrl via URL.createObjectURL', v: 'Revoked on path change/unmount to avoid leaks' },
          { k: 'multi-selection summary', v: "Totals file sizes, lists names, doesn't recurse into folders" },
        ] },
      { k: 'Per-instance `${k}.*` commands', v: 'zip-extract/compress, copy/cut/paste, rename, download, delete',
        children: [
          { k: '`${k}.zip-extract` / `.zip-compress`', v: 'fflate-based unzip/zip of VFS paths' },
          { k: '`${k}.copy-file` / `.cut-file` / `.paste-files`', v: 'Clipboard-style VFS copy/move' },
          { k: '`${k}.download-files`', v: 'Bulk-downloads a selection of VFS paths to the real disk' },
        ] },
    ],
  },
  {
    id: 'terminal', label: 'Terminal', sub: 'opt/apps/terminal/main.html',
    icon: 'terminal', color: '#06d6a0',
    x: 290, y: 860, w: 165, h: 70,
    info: [
      { k: 'class TerminalApp', v: 'Owns tabs/sessions: addTab/closeTab/activate/resizeActive',
        children: [
          { k: 'addTab()', v: 'Creates pane + TerminalSession + tab element, activates it' },
          { k: 'closeTab(session)', v: 'Disposes the session; refuses to close the last remaining tab' },
          { k: 'activate(session)', v: 'Shows one pane; only resizes/focuses already-opened terminals' },
        ] },
      { k: 'class TerminalSession', v: 'One xterm.js instance; owns cwd/env/aliases/history for its tab',
        children: [
          { k: 'initializeTerminal()', v: "Opens xterm, runs the 'info' neofetch command, shows prompt" },
          { k: "context { pwd, PATH, USER }", v: "Per-session shell state; PATH='/bin:/usr/bin'" },
        ] },
      { k: "new Terminal({...}) — xterm.js", v: 'cursorBlink, convertEol, green-on-black Courier New theme' },
      { k: 'processCommand(command)', v: 'Parses and executes one shell command line' },
      { k: 'HISTORY_FILE', v: 'Persists command history to /home/user1/.bash_history' },
      { k: 'window.__terminalApp', v: 'Test hook exposing the live TerminalApp instance' },
    ],
  },
]

const EDGES = [
  { from: 'vfs',      to: 'platform', fa: 'e', ta: 'w', label: 'getFS()' },
  { from: 'platform', to: 'wm',       fa: 'e', ta: 'w', label: 'exec / register' },
  { from: 'platform', to: 'layout',   fa: 's', ta: 'n', label: 'execString' },
  { from: 'platform', to: 'ipc',      fa: 's', ta: 'n', label: 'initIpc' },
  { from: 'layout',   to: 'ipc',      fa: 'e', ta: 'w', label: '__wosWmBridge' },
  { from: 'ipc',      to: 'dock',     fa: 's', ta: 'n', label: 'postMessage IPC' },
  { from: 'platform', to: 'systemd',  fa: 's', ta: 'n', label: 'execString (isolated)' },
  { from: 'platform', to: 'command-registry',  fa: 's', ta: 'n', label: 'registerCommand' },
  { from: 'platform', to: 'process-manager',   fa: 's', ta: 'n', label: 'getProcessManager()' },
  { from: 'platform', to: 'activity-registry', fa: 's', ta: 'n', label: 'registerActivity' },
]

function getAnchor(node, side) {
  const cx = node.x + node.w / 2
  const cy = node.y + node.h / 2
  if (side === 'n') return [cx, node.y]
  if (side === 's') return [cx, node.y + node.h]
  if (side === 'e') return [node.x + node.w, cy]
  if (side === 'w') return [node.x, cy]
  return [cx, cy]
}

function makeBezier(x1, y1, x2, y2, fa, ta) {
  const dx = Math.abs(x2 - x1) * 0.5
  const dy = Math.abs(y2 - y1) * 0.5
  let cpx1 = x1, cpy1 = y1, cpx2 = x2, cpy2 = y2
  if (fa === 'e') cpx1 = x1 + dx
  else if (fa === 'w') cpx1 = x1 - dx
  else if (fa === 's') cpy1 = y1 + dy
  else if (fa === 'n') cpy1 = y1 - dy
  if (ta === 'w') cpx2 = x2 - dx
  else if (ta === 'e') cpx2 = x2 + dx
  else if (ta === 'n') cpy2 = y2 - dy
  else if (ta === 's') cpy2 = y2 + dy
  return `M${x1},${y1} C${cpx1},${cpy1} ${cpx2},${cpy2} ${x2},${y2}`
}

function ArchDiagram(props) {
  const nodeMap = {}
  props.nodes.forEach(function(n) { nodeMap[n.id] = n })

  const edges = props.edges.map(function(e, i) {
    const fn = nodeMap[e.from], tn = nodeMap[e.to]
    const a1 = getAnchor(fn, e.fa), a2 = getAnchor(tn, e.ta)
    const x1 = a1[0], y1 = a1[1], x2 = a2[0], y2 = a2[1]
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
    const d = makeBezier(x1, y1, x2, y2, e.fa, e.ta)
    return React.createElement('g', { key: 'e' + i },
      React.createElement('path', {
        d: d, fill: 'none',
        stroke: 'rgba(150,150,160,0.5)', strokeWidth: 1.5,
        markerEnd: 'url(#arch-arrowhead)',
      }),
      React.createElement('text', {
        x: mx, y: my - 5, textAnchor: 'middle',
        fontSize: 8, fontFamily: 'system-ui, sans-serif',
        fill: 'rgba(120,120,130,0.9)',
      }, e.label)
    )
  })

  const nodes = props.nodes.map(function(n) {
    const sel = props.selected === n.id
    return React.createElement('g', {
      key: n.id, style: { cursor: 'pointer' },
      onClick: function() { props.onSelect(sel ? null : n.id) },
    },
      sel && React.createElement('rect', {
        x: n.x - 4, y: n.y - 4, width: n.w + 8, height: n.h + 8, rx: 14,
        fill: n.color, opacity: 0.18,
      }),
      React.createElement('rect', {
        x: n.x, y: n.y, width: n.w, height: n.h, rx: 10,
        fill: sel ? n.color : 'var(--arch-node-bg)',
        stroke: n.color, strokeWidth: sel ? 2 : 1.5,
      }),
      React.createElement('text', {
        x: n.x + 16, y: n.y + n.h / 2 + 7,
        fontFamily: 'Material Symbols Outlined', fontSize: 22,
        fill: sel ? 'rgba(255,255,255,0.95)' : n.color,
        fontVariationSettings: "'FILL' 1, 'wght' 300, 'GRAD' 0, 'opsz' 22",
        style: { userSelect: 'none' },
      }, n.icon),
      React.createElement('text', {
        x: n.x + 46, y: n.y + n.h / 2 - 4,
        fontSize: 11, fontWeight: '600',
        fill: sel ? '#fff' : 'var(--arch-text)',
        fontFamily: 'system-ui, sans-serif',
        style: { userSelect: 'none' },
      }, n.label),
      React.createElement('text', {
        x: n.x + 46, y: n.y + n.h / 2 + 11,
        fontSize: 8.5,
        fill: sel ? 'rgba(255,255,255,0.75)' : 'var(--arch-text)',
        opacity: sel ? 1 : 0.55,
        fontFamily: 'system-ui, sans-serif',
        style: { userSelect: 'none' },
      }, n.sub),
    )
  })

  return React.createElement('svg', {
    viewBox: '0 0 735 960',
    style: { width: '100%', display: 'block' },
    'aria-label': 'WOS Architecture Diagram',
  },
    React.createElement('defs', null,
      React.createElement('marker', {
        id: 'arch-arrowhead', viewBox: '0 0 10 10',
        markerWidth: 6, markerHeight: 6,
        refX: 9, refY: 5, orient: 'auto',
      },
        React.createElement('path', {
          d: 'M 0 0 L 10 5 L 0 10 z',
          fill: 'rgba(150,150,160,0.6)',
        })
      )
    ),
    React.createElement('g', null, ...edges),
    React.createElement('g', null, ...nodes),
  )
}

// Recursively collects every path string under `items` that HAS children —
// used by "Expand all" to open a whole subtree in one click.
function collectExpandablePaths(items, prefix, out) {
  items.forEach(function(item, i) {
    const path = prefix ? prefix + '.' + i : String(i)
    if (item.children && item.children.length) {
      out.push(path)
      collectExpandablePaths(item.children, path, out)
    }
  })
  return out
}

// One level of the info tree. Each row with `children` is click-to-expand
// (chevron rotates, nested rows render indented below it); rows without
// children are plain, non-interactive detail lines.
function InfoTree(props) {
  return React.createElement(React.Fragment, null,
    props.items.map(function(item, i) {
      const path = props.pathPrefix ? props.pathPrefix + '.' + i : String(i)
      const hasChildren = !!(item.children && item.children.length)
      const isOpen = props.expandedPaths.has(path)
      return React.createElement('div', { key: path },
        React.createElement('div', {
          style: {
            background: 'rgba(128,128,128,0.07)', borderRadius: 6,
            padding: '6px 10px', marginBottom: 6,
            marginLeft: props.depth * 18,
            borderLeft: '3px solid ' + props.color,
            cursor: hasChildren ? 'pointer' : 'default',
            display: 'flex', alignItems: 'flex-start', gap: 6,
          },
          onClick: hasChildren ? function() { props.onToggle(path) } : undefined,
        },
          hasChildren
            ? React.createElement('span', {
                className: 'material-symbols-outlined',
                style: {
                  fontSize: 14, marginTop: 2, flexShrink: 0, opacity: 0.6,
                  transform: isOpen ? 'rotate(90deg)' : 'none',
                  transition: 'transform 0.15s',
                },
              }, 'chevron_right')
            : React.createElement('span', { style: { width: 14, flexShrink: 0 } }),
          React.createElement('div', { style: { flex: 1, minWidth: 0 } },
            React.createElement('div', {
              style: { fontWeight: 600, fontSize: 12, marginBottom: 2, fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 6 },
            },
              item.k,
              hasChildren ? React.createElement('span', {
                style: { fontSize: 9, opacity: 0.5, fontWeight: 400, fontFamily: 'system-ui, sans-serif' },
              }, '(' + item.children.length + ')') : null
            ),
            React.createElement('div', { style: { fontSize: 11, opacity: 0.65, lineHeight: 1.45 } }, item.v),
          )
        ),
        hasChildren && isOpen
          ? React.createElement(InfoTree, {
              items: item.children, color: props.color, depth: props.depth + 1,
              expandedPaths: props.expandedPaths, onToggle: props.onToggle, pathPrefix: path,
            })
          : null
      )
    })
  )
}

function ArchitectureSettings() {
  const [selected, setSelected] = useState(null)
  const [expandedPaths, setExpandedPaths] = useState(function() { return new Set() })
  const selectedNode = NODES.find(function(n) { return n.id === selected })

  function selectNode(id) {
    setSelected(id)
    setExpandedPaths(new Set())
  }

  function toggleExpanded(path) {
    setExpandedPaths(function(prev) {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function expandAll() {
    if (!selectedNode) return
    setExpandedPaths(new Set(collectExpandablePaths(selectedNode.info, '', [])))
  }

  function collapseAll() {
    setExpandedPaths(new Set())
  }

  const anyExpandable = selectedNode ? collectExpandablePaths(selectedNode.info, '', []).length > 0 : false

  return React.createElement('div', { className: 'settings-page' },
    React.createElement('h1', { className: 'settings-page-title' }, 'Architecture'),

    React.createElement('div', { className: 'settings-group' },
      React.createElement('div', {
        style: {
          fontSize: 11, fontWeight: 600, opacity: 0.5, letterSpacing: '0.06em',
          textTransform: 'uppercase', padding: '10px 14px 4px',
        },
      }, 'System Overview'),
      React.createElement('div', { className: 'settings-group-body', style: { display: 'block', padding: '0 1rem 1rem' } },
        React.createElement('p', {
          style: { fontSize: 12, opacity: 0.6, marginBottom: 12, lineHeight: 1.6 },
        }, 'Click any subsystem to see its key interfaces and classes. Rows with a (count) badge expand into sub-components — click to drill in. Arrows show primary data and control flow between components.'),
        React.createElement(ArchDiagram, {
          nodes: NODES, edges: EDGES,
          selected: selected, onSelect: selectNode,
        }),
      )
    ),

    selectedNode
      ? React.createElement('div', { className: 'settings-group' },
          React.createElement('div', {
            style: {
              fontSize: 11, fontWeight: 600, opacity: 0.5, letterSpacing: '0.06em',
              textTransform: 'uppercase', padding: '10px 14px 4px',
              display: 'flex', alignItems: 'center', gap: 6,
            },
          },
            React.createElement('span', {
              className: 'material-symbols-outlined',
              style: { fontSize: 14, color: selectedNode.color, opacity: 1 },
            }, selectedNode.icon),
            selectedNode.label + ' — Interfaces',
            React.createElement('span', { style: { flex: 1 } }),
            anyExpandable ? React.createElement('button', {
              onClick: expandAll,
              style: {
                fontSize: 10, fontWeight: 500, textTransform: 'none', letterSpacing: 0,
                border: 'none', background: 'transparent', color: selectedNode.color,
                cursor: 'pointer', padding: '2px 6px',
              },
            }, 'Expand all') : null,
            anyExpandable ? React.createElement('button', {
              onClick: collapseAll,
              style: {
                fontSize: 10, fontWeight: 500, textTransform: 'none', letterSpacing: 0,
                border: 'none', background: 'transparent', opacity: 0.6,
                cursor: 'pointer', padding: '2px 6px',
              },
            }, 'Collapse all') : null,
          ),
          React.createElement('div', { className: 'settings-group-body', style: { display: 'block', padding: '0.5rem 1rem 1rem' } },
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column' } },
              React.createElement(InfoTree, {
                items: selectedNode.info, color: selectedNode.color, depth: 0,
                expandedPaths: expandedPaths, onToggle: toggleExpanded, pathPrefix: '',
              })
            )
          )
        )
      : React.createElement('div', { className: 'settings-group' },
          React.createElement('div', {
            style: {
              fontSize: 11, fontWeight: 600, opacity: 0.5, letterSpacing: '0.06em',
              textTransform: 'uppercase', padding: '10px 14px 4px',
            },
          }, 'Subsystems'),
          React.createElement('div', { className: 'settings-group-body', style: { display: 'block', padding: '0.5rem 1rem 1rem' } },
            React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
              NODES.map(function(n) {
                return React.createElement('button', {
                  key: n.id,
                  style: {
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 12px', borderRadius: 20,
                    border: '1.5px solid ' + n.color,
                    background: n.color + '1a',
                    cursor: 'pointer', fontSize: 12, fontWeight: 500,
                  },
                  onClick: function() { selectNode(n.id) },
                },
                  React.createElement('span', {
                    className: 'material-symbols-outlined',
                    style: { fontSize: 14, color: n.color },
                  }, n.icon),
                  n.label,
                )
              })
            ),
            React.createElement('p', {
              style: { fontSize: 11, opacity: 0.45, marginTop: 10, lineHeight: 1.5 },
            }, 'Select a subsystem above or click a node in the diagram to explore its interface.'),
          )
        ),
  )
}

platform.getService('settings').registerSection('21-architecture', function(container, api) {
  // Inject theme-aware CSS vars for the diagram nodes
  var ownerDoc = container.ownerDocument
  if (!ownerDoc.getElementById(STYLE_ID)) {
    var s = ownerDoc.createElement('style')
    s.id = STYLE_ID
    s.textContent = [
      ':root { --arch-node-bg: #f2f2f7; --arch-text: #1c1c1e; }',
      '@media (prefers-color-scheme: dark) {',
      '  :root { --arch-node-bg: #2c2c2e; --arch-text: #f2f2f7; }',
      '}',
      ':root[data-theme="dark"] { --arch-node-bg: #2c2c2e !important; --arch-text: #f2f2f7 !important; }',
      ':root[data-theme="light"] { --arch-node-bg: #f2f2f7 !important; --arch-text: #1c1c1e !important; }',
    ].join('\n')
    ownerDoc.head.appendChild(s)
  }
  var root = ReactDOM.createRoot(container)
  root.render(React.createElement(ArchitectureSettings))
  return function() { setTimeout(function() { root.unmount() }, 0) }
}, {
  title: 'Architecture',
  icon: 'account_tree',
  color: '#636366',
})
