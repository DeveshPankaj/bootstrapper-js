const platform = window.platform;

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

platform.host.registerWidget('memory', (container, api) => {
  const label = document.createElement('div');
  label.className = 'widget-memory-label';
  label.textContent = 'Storage used';
  const value = document.createElement('div');
  value.className = 'widget-memory-value';
  value.textContent = '...';
  const bar = document.createElement('div');
  bar.className = 'widget-memory-bar';
  const barFill = document.createElement('div');
  barFill.className = 'widget-memory-bar-fill';
  bar.appendChild(barFill);
  const sub = document.createElement('div');
  sub.className = 'widget-memory-sub';

  container.appendChild(label);
  container.appendChild(value);
  container.appendChild(bar);
  container.appendChild(sub);

  const update = async () => {
    if (!navigator.storage || !navigator.storage.estimate) {
      value.textContent = 'unavailable';
      sub.textContent = '';
      return;
    }
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const pct = quota ? (usage / quota) * 100 : 0;
    value.textContent = formatBytes(usage);
    sub.textContent = `of ${formatBytes(quota)} (${pct.toFixed(1)}%)`;
    barFill.style.width = `${Math.min(100, pct)}%`;
  };

  update();
  const interval = setInterval(update, 5000);
  api.onDestroy(() => clearInterval(interval));
}, {
  title: 'Memory',
});
