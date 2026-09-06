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
      { k: 'MountableFileSystem', v: 'Mounts /, /tmp, /mnt as separate IndexedDB stores' },
      { k: 'AsyncMirror', v: 'In-memory mirror for sync access over async IndexedDB or LocalStorage' },
      { k: 'readFileSync(path, enc)', v: 'Synchronous read from in-memory mirror' },
      { k: 'writeFileSync(path, data)', v: 'Write to mirror; persisted to IndexedDB asynchronously' },
      { k: 'readdirSync / existsSync / statSync', v: 'Standard sync filesystem operations' },
      { k: 'FHS-lite layout', v: '/etc (config), /opt (apps), /home/user1 (user), /bin (commands)' },
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
      { k: 'host.execCommand(str, platform)', v: 'Runs DSL: service("mod","svc") / command("name") / $args' },
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
      { k: 'WM styles: /opt/wm/*.js', v: 'default, classic, minimal, ubuntu, glass, tiling, canvas' },
    ],
  },
  {
    id: 'layout', label: 'Layout Shell', sub: 'Desktop Manager',
    icon: 'dashboard', color: '#ff9f0a',
    x: 100, y: 245, w: 165, h: 70,
    info: [
      { k: 'LayoutShell (React)', v: 'CSS Grid desktop — header / left-nav / content-area / footer slots' },
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
      { k: 'fs.* handlers', v: 'read / write / list / exists / mkdir / rm / stat' },
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
      { k: 'Variants', v: '/opt/apps/dock/default.html (dark pill) · macos.html (glass bar)' },
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
    viewBox: '0 0 735 530',
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

function ArchitectureSettings() {
  const [selected, setSelected] = useState(null)
  const selectedNode = NODES.find(function(n) { return n.id === selected })

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
        }, 'Click any subsystem to see its key interfaces and classes. Arrows show primary data and control flow between components.'),
        React.createElement(ArchDiagram, {
          nodes: NODES, edges: EDGES,
          selected: selected, onSelect: setSelected,
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
          ),
          React.createElement('div', { className: 'settings-group-body', style: { display: 'block', padding: '0.5rem 1rem 1rem' } },
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
              selectedNode.info.map(function(item) {
                return React.createElement('div', {
                  key: item.k,
                  style: {
                    background: 'rgba(128,128,128,0.07)', borderRadius: 6,
                    padding: '6px 10px',
                    borderLeft: '3px solid ' + selectedNode.color,
                  },
                },
                  React.createElement('div', {
                    style: { fontWeight: 600, fontSize: 12, marginBottom: 2, fontFamily: 'monospace' },
                  }, item.k),
                  React.createElement('div', {
                    style: { fontSize: 11, opacity: 0.65, lineHeight: 1.45 },
                  }, item.v),
                )
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
                  onClick: function() { setSelected(n.id) },
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
