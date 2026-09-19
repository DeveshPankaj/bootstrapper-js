const platform = window.platform;
const React = platform.getService('React');
const ReactDOM = platform.getService('ReactDOM');

const fmtUptime = (startedAt) => {
  if (!startedAt) return '—';
  const secs = Math.floor((Date.now() - startedAt) / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
};

const fmtMemory = (bytes) => {
  if (bytes == null) return '—';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Google-Material-ish palette: green/blue/yellow/red/grey, reused from the
// same dot-status idiom as Settings > Services (22-services.js) so the two
// process-facing surfaces read consistently.
const STATE_COLORS = {
  active: '#1e8e3e',
  minimized: '#5f6368',
  background: '#1a73e8',
  activating: '#f9ab00',
  deactivating: '#f9ab00',
  inactive: '#5f6368',
  failed: '#d93025',
};

const STATE_LABELS = {
  active: 'Active',
  minimized: 'Minimized',
  background: 'Background',
  activating: 'Starting…',
  deactivating: 'Stopping…',
  inactive: 'Stopped',
  failed: 'Failed',
};

// Merges systemd itself (`systemd.self`, PID 1 - the reserved pid no GUI
// window can ever get, see ProcessManager in src/platform/process-manager.ts),
// GUI window processes (`process.list`), and systemd-managed units
// (`systemd.list`, see src/core/systemd.ts) into one row shape so all three
// can be sorted/grouped together - cron/widgets/shell now boot as real
// units (see /etc/systemd/system/), so they show up here as systemd's own
// children rather than invisible hardcoded boot steps.
const buildRows = () => {
  const self = platform.host.getCommand('systemd.self')?.exec();
  const systemd = self ? [{
    id: 'systemd-1',
    kind: 'system',
    pid: self.pid,
    name: self.name,
    title: self.name,
    icon: 'dns',
    state: 'active',
    memory: null,
    startedAt: self.startedAt,
    detail: self.description,
  }] : [];

  const processes = platform.host.getCommand('process.list')?.exec() ?? [];
  const apps = processes.map(p => ({
    id: `app-${p.pid}`,
    kind: 'app',
    pid: p.pid,
    name: p.name,
    title: p.title || p.name,
    icon: p.icon || 'apps',
    state: p.active ? 'active' : (p.minimized ? 'minimized' : 'background'),
    memory: p.memory,
    startedAt: p.startedAt,
    detail: p.services && p.services.length ? p.services.join(', ') : '—',
  }));

  const units = platform.host.getCommand('systemd.list')?.exec() ?? [];
  const services = units.map(u => ({
    id: `svc-${u.name}`,
    kind: 'service',
    pid: u.mainPid,
    name: u.name,
    title: u.description || u.name,
    icon: 'dns',
    state: u.status,
    memory: null,
    startedAt: u.startedAt,
    detail: `Restart=${u.restart}${u.enabled ? ' · enabled at boot' : ''}`,
  }));

  return { systemd, apps, services };
};

const COLUMNS = [
  { key: 'title', label: 'Name', sortable: true },
  { key: 'kind', label: 'Type', sortable: true },
  { key: 'pid', label: 'PID', sortable: true },
  { key: 'state', label: 'Status', sortable: true },
  { key: 'memory', label: 'Memory', sortable: true },
  { key: 'startedAt', label: 'Uptime', sortable: true },
  { key: 'detail', label: 'Details', sortable: false },
];

const sortRows = (rows, sortKey, sortDir) => {
  const mul = sortDir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'string') return av.localeCompare(bv) * mul;
    return (av - bv) * mul;
  });
};

const StatePill = ({ state }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: STATE_COLORS[state] || '#5f6368' }}>
    <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATE_COLORS[state] || '#5f6368', flexShrink: 0 }}></span>
    {STATE_LABELS[state] || state}
  </span>
);

const SortHeader = ({ col, sortKey, sortDir, onSort }) => {
  const active = sortKey === col.key;
  return (
    <th
      onClick={() => col.sortable && onSort(col.key)}
      className={col.sortable ? 'tm-sortable' : ''}
      style={active ? { color: '#1a73e8' } : undefined}
    >
      {col.label}{active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );
};

const KIND_LABELS = { app: 'App', service: 'Service', system: 'System' };

const Row = ({ row, onAction, indent }) => {
  const isRunning = row.state === 'active' || row.state === 'activating' || row.kind === 'app';
  const actionLabel = row.kind === 'app' ? 'End task' : (isRunning ? 'Stop' : 'Start');
  return (
    <tr className="tm-row">
      <td className="tm-name-cell" style={indent ? { paddingLeft: 14 + indent } : undefined}>
        <span className="material-symbols-outlined tm-row-icon">{row.icon}</span>
        <span className="tm-row-title">{row.title}</span>
        {row.title !== row.name ? <span className="tm-row-subname">{row.name}</span> : null}
      </td>
      <td className="tm-muted tm-capitalize">{KIND_LABELS[row.kind] || row.kind}</td>
      <td className="tm-muted tm-tabular">{row.pid ?? '—'}</td>
      <td><StatePill state={row.state} /></td>
      <td className="tm-muted tm-tabular">{fmtMemory(row.memory)}</td>
      <td className="tm-muted tm-tabular">{fmtUptime(row.startedAt)}</td>
      <td className="tm-muted tm-detail">{row.detail}</td>
      <td>{row.kind !== 'system' && <button className="tm-action" onClick={() => onAction(row)}>{actionLabel}</button>}</td>
    </tr>
  );
};

const GroupHeader = ({ label, count, collapsed, onToggle, indent }) => (
  <tr className="tm-group-row" onClick={onToggle}>
    <td colSpan={8} style={indent ? { paddingLeft: 14 + indent } : undefined}>
      <span className="material-symbols-outlined tm-chevron">{collapsed ? 'chevron_right' : 'expand_more'}</span>
      <span className="tm-group-label">{label}</span>
      <span className="tm-group-count">{count}</span>
    </td>
  </tr>
);

const HeaderRow = ({ sortKey, sortDir, onSort }) => (
  <thead>
    <tr>
      {COLUMNS.map(col => <SortHeader key={col.key} col={col} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />)}
      <th></th>
    </tr>
  </thead>
);

const TaskManagerShell = ({ view, setView, totalMemory, isEmpty, children }) => (
  <div className="task-manager">
    <div className="tm-toolbar">
      <div className="tm-title">
        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>monitoring</span>
        Task Manager
      </div>
      <div className="tm-toolbar-right">
        {totalMemory != null && (
          <span className="tm-mem-chip" title="Approximate: same-origin windows commonly share one JS heap, so this isn't a true per-process figure.">
            {fmtMemory(totalMemory)} JS heap
          </span>
        )}
        <div className="tm-segmented">
          <button className={view === 'flat' ? 'active' : ''} onClick={() => setView('flat')}>Flat</button>
          <button className={view === 'tree' ? 'active' : ''} onClick={() => setView('tree')}>Tree</button>
        </div>
      </div>
    </div>
    <div className="tm-table-wrap">
      {isEmpty
        ? <div className="tm-empty">No running processes or services.</div>
        : <table className="tm-table">{children}</table>}
    </div>
  </div>
);

const TaskManagerApp = () => {
  const [rows, setRows] = React.useState({ systemd: [], apps: [], services: [] });
  const [view, setView] = React.useState('flat');
  // Default sort is PID ascending, not name: with systemd reserved as PID 1
  // (see ProcessManager in src/platform/process-manager.ts), this puts it
  // first the way it would appear in a real `ps`/`htop` PID-ordered list.
  const [sortKey, setSortKey] = React.useState('pid');
  const [sortDir, setSortDir] = React.useState('asc');
  const [collapsed, setCollapsed] = React.useState({});

  const refresh = () => setRows(buildRows());

  React.useEffect(() => {
    refresh();
    const id = setInterval(refresh, 1500);
    return () => clearInterval(id);
  }, []);

  const onSort = (key) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const onAction = (row) => {
    if (row.kind === 'app') {
      platform.host.getCommand('process.kill')?.exec(row.pid);
    } else {
      const running = row.state === 'active' || row.state === 'activating';
      platform.host.getCommand(running ? 'systemd.stop' : 'systemd.start')?.exec(row.name);
    }
    setTimeout(refresh, 200);
  };

  const all = [...rows.systemd, ...rows.apps, ...rows.services];
  const memReading = all.find(r => r.memory != null);
  const totalMemory = memReading ? memReading.memory : null;

  if (view === 'flat') {
    const sorted = sortRows(all, sortKey, sortDir);
    return (
      <TaskManagerShell view={view} setView={setView} totalMemory={totalMemory} isEmpty={!all.length}>
        <HeaderRow sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
        <tbody>
          {sorted.map(row => <Row key={row.id} row={row} onAction={onAction} />)}
        </tbody>
      </TaskManagerShell>
    );
  }

  // Tree view: systemd (PID 1) is the root - everything else boots under it
  // (cron/widgets/shell as real units, GUI apps as windows it didn't
  // directly spawn but which couldn't exist before it started IPC/services).
  // Apps/Background Services render as indented, collapsible groups beneath it.
  const groups = [
    { key: 'apps', label: 'Apps', rows: sortRows(rows.apps, sortKey, sortDir) },
    { key: 'services', label: 'Background Services (systemd)', rows: sortRows(rows.services, sortKey, sortDir) },
  ];

  return (
    <TaskManagerShell view={view} setView={setView} totalMemory={totalMemory} isEmpty={!all.length}>
      <HeaderRow sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
      <tbody>
        {rows.systemd.map(row => <Row key={row.id} row={row} onAction={onAction} />)}
        {groups.map(g => (
          <React.Fragment key={g.key}>
            <GroupHeader
              label={g.label} count={g.rows.length} indent={18}
              collapsed={!!collapsed[g.key]}
              onToggle={() => setCollapsed(c => ({ ...c, [g.key]: !c[g.key] }))}
            />
            {!collapsed[g.key] && g.rows.map(row => <Row key={row.id} row={row} onAction={onAction} indent={18} />)}
          </React.Fragment>
        ))}
      </tbody>
    </TaskManagerShell>
  );
};

const FONT_URL = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0';

const CSS = `
.material-symbols-outlined {
  font-family: 'Material Symbols Outlined';
  font-weight: normal; font-style: normal; line-height: 1;
  letter-spacing: normal; text-transform: none; display: inline-block;
  white-space: nowrap; word-wrap: normal; direction: ltr;
  -webkit-font-smoothing: antialiased;
}
html, body { margin: 0; padding: 0; height: 100%; background: #fff; }
* { box-sizing: border-box; }
.task-manager {
  display: flex; flex-direction: column; height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
  color: #202124;
}
.tm-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px; border-bottom: 1px solid #e8eaed; flex-shrink: 0;
}
.tm-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 500; color: #202124; }
.tm-toolbar-right { display: flex; align-items: center; gap: 10px; }
.tm-mem-chip {
  font-size: 12px; color: #5f6368; background: #f1f3f4;
  border-radius: 12px; padding: 4px 10px; cursor: default;
}
.tm-segmented { display: flex; border: 1px solid #dadce0; border-radius: 8px; overflow: hidden; }
.tm-segmented button {
  border: none; background: #fff; color: #5f6368; font-size: 12px;
  padding: 5px 14px; cursor: pointer; font-family: inherit;
}
.tm-segmented button + button { border-left: 1px solid #dadce0; }
.tm-segmented button.active { background: #e8f0fe; color: #1a73e8; font-weight: 500; }
.tm-table-wrap { flex: 1; min-height: 0; overflow: auto; }
.tm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.tm-table thead th {
  position: sticky; top: 0; background: #fff; text-align: left;
  padding: 10px 14px; font-size: 11px; font-weight: 500; color: #5f6368;
  text-transform: uppercase; letter-spacing: 0.03em;
  border-bottom: 1px solid #e8eaed; white-space: nowrap;
}
.tm-table th.tm-sortable { cursor: pointer; user-select: none; }
.tm-table th.tm-sortable:hover { color: #202124; }
.tm-row td { padding: 9px 14px; border-bottom: 1px solid #f1f3f4; vertical-align: middle; }
.tm-row:hover { background: #f8f9fa; }
.tm-name-cell { display: flex; align-items: center; white-space: nowrap; }
.tm-row-icon { font-size: 17px; color: #5f6368; margin-right: 10px; }
.tm-row-title { font-weight: 500; }
.tm-row-subname { color: #80868b; font-size: 11px; margin-left: 6px; }
.tm-muted { color: #5f6368; }
.tm-capitalize { text-transform: capitalize; }
.tm-tabular { font-variant-numeric: tabular-nums; }
.tm-detail { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tm-action {
  border: none; background: none; color: #d93025; font-size: 12px; font-weight: 500;
  cursor: pointer; padding: 5px 10px; border-radius: 6px; font-family: inherit;
}
.tm-action:hover { background: #fce8e6; }
.tm-group-row { cursor: pointer; background: #f8f9fa; }
.tm-group-row:hover { background: #f1f3f4; }
.tm-group-row td { padding: 7px 14px; border-bottom: 1px solid #e8eaed; }
.tm-chevron { font-size: 16px; vertical-align: middle; color: #5f6368; }
.tm-group-label { font-weight: 600; margin-left: 4px; font-size: 12px; }
.tm-group-count { color: #80868b; margin-left: 6px; font-size: 11px; }
.tm-empty { padding: 2rem; color: #80868b; text-align: center; font-size: 13px; }
`;

const run = (body, winApi) => {
  if (!body) {
    platform.host.execCommand("service('001-core.layout','open-window')(command('ui.task-manager'))", platform);
    return;
  }
  winApi.setTitle('Task Manager');
  winApi.setWindowView(true);

  const doc = body.ownerDocument;
  const style = doc.createElement('style');
  style.textContent = CSS;
  doc.head.appendChild(style);
  const fontLink = doc.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = FONT_URL;
  doc.head.appendChild(fontLink);

  const root = ReactDOM.createRoot(body);
  root.render(React.createElement(TaskManagerApp));
  winApi.onDestroy(() => setTimeout(() => root.unmount(), 0));
};

platform.host.registerCommand('ui.task-manager', run, {
  callable: true,
  icon: 'monitoring',
  title: 'Task Manager',
  fullScreen: false,
});
