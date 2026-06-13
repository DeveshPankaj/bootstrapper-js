const platform = window.platform;

const LOG_PATH = '/var/log/public-ip.txt';

platform.host.registerWidget('public-ip', (container, api) => {
  const label = document.createElement('div');
  label.className = 'widget-public-ip-label';
  label.textContent = 'Public IP';
  const value = document.createElement('div');
  value.className = 'widget-public-ip-value';
  value.textContent = '...';

  container.appendChild(label);
  container.appendChild(value);

  const read = () => {
    const fs = platform.host.getFS();
    if (fs.existsSync(LOG_PATH)) {
      const [ip] = fs.readFileSync(LOG_PATH, 'utf-8').toString().split('\n');
      value.textContent = ip || '-';
    } else {
      // Nothing logged yet (cron hasn't run this minute) - trigger a check now.
      platform.host.exec(platform, '/opt/cron/check-public-ip.js');
      value.textContent = 'checking...';
    }
  };

  read();
  const interval = setInterval(read, 30000);
  api.onDestroy(() => clearInterval(interval));
}, {
  title: 'Public IP',
});
