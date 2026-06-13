const platform = window.platform;

platform.host.registerWidget('clock', (container, api) => {
  const time = document.createElement('div');
  time.className = 'widget-clock-time';
  const date = document.createElement('div');
  date.className = 'widget-clock-date';

  container.appendChild(time);
  container.appendChild(date);

  const update = () => {
    const now = new Date();
    time.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    date.textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  update();
  const interval = setInterval(update, 1000);
  api.onDestroy(() => clearInterval(interval));
}, {
  title: 'Clock',
});
