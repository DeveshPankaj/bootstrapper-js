const platform = window.platform;

const fmtUptime = (startedAt) => {
  const secs = Math.floor((Date.now() - startedAt) / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h}h ${m}m ${s}s`;
};

const run = (body, winApi) => {
  if (!body) {
    platform.host.execCommand("service('001-core.layout','open-window')(command('ui.task-manager'))", platform);
    return;
  }
  winApi.setTitle('Task Manager');
  winApi.setWindowView(true);

  const doc = body.ownerDocument;
  const style = doc.createElement('style');
  style.textContent = `
    html, body { margin: 0; padding: 0; font-family: sans-serif; height: 100%; background: #fff; }
    .task-manager { display: flex; flex-direction: column; height: 100%; box-sizing: border-box; }
    .task-manager table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    .task-manager th, .task-manager td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid #eee; vertical-align: top; }
    .task-manager th { background: #f5f5f5; position: sticky; top: 0; }
    .task-manager tbody tr:hover { background: #f9f9f9; }
    .task-manager .services { color: #666; font-size: 0.75rem; }
    .task-manager .kill-btn {
      cursor: pointer; border: none; background: #e74c3c; color: white;
      border-radius: 4px; padding: 0.25rem 0.6rem; font-size: 0.8rem;
    }
    .task-manager .kill-btn:hover { background: #c0392b; }
    .task-manager .empty { padding: 1rem; color: #888; }
  `;
  doc.head.appendChild(style);

  const container = doc.createElement('div');
  container.className = 'task-manager';
  body.appendChild(container);

  const render = () => {
    const processes = platform.host.getCommand('process.list')?.exec() ?? [];

    container.innerHTML = '';

    if (!processes.length) {
      const empty = doc.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No running processes.';
      container.appendChild(empty);
      return;
    }

    const table = doc.createElement('table');
    const thead = doc.createElement('thead');
    thead.innerHTML = '<tr><th>PID</th><th>Name</th><th>Title</th><th>Uptime</th><th>Services</th><th></th></tr>';
    table.appendChild(thead);

    const tbody = doc.createElement('tbody');
    processes.forEach(p => {
      const tr = doc.createElement('tr');

      const pidTd = doc.createElement('td');
      pidTd.textContent = p.pid;

      const nameTd = doc.createElement('td');
      nameTd.textContent = p.name;

      const titleTd = doc.createElement('td');
      titleTd.textContent = p.title;

      const uptimeTd = doc.createElement('td');
      uptimeTd.textContent = fmtUptime(p.startedAt);

      const servicesTd = doc.createElement('td');
      servicesTd.className = 'services';
      servicesTd.textContent = p.services.length ? p.services.join(', ') : '-';

      const actionTd = doc.createElement('td');
      const killBtn = doc.createElement('button');
      killBtn.className = 'kill-btn';
      killBtn.textContent = 'End task';
      killBtn.onclick = () => {
        platform.host.getCommand('process.kill')?.exec(p.pid);
      };
      actionTd.appendChild(killBtn);

      tr.append(pidTd, nameTd, titleTd, uptimeTd, servicesTd, actionTd);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    container.appendChild(table);
  };

  render();
  const interval = setInterval(render, 1000);
  winApi.onDestroy(() => clearInterval(interval));
};

platform.host.registerCommand('ui.task-manager', run, {
  callable: true,
  icon: 'monitoring',
  title: 'Task Manager',
  fullScreen: false,
});
