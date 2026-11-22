const platform = window.platform;

const CONFIG_PATH = '/etc/widgets/toolbar.json';

const DEFAULT_CONFIG = {
  commands: [
    { command: 'explorer' },
    { command: 'ui.notepad' },
    { command: 'ui.terminal' },
    { command: 'ui.audioplayer' },
    { command: 'ui.settings' },
  ],
};

const readConfig = () => {
  try {
    const fs = platform.host.getFS();
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    if (Array.isArray(cfg.commands)) return cfg;
  } catch (err) { /* use default */ }
  return DEFAULT_CONFIG;
};

// `name` comes from the (app-writable) toolbar config, so it travels as a value —
// never spliced into DSL source (audit KRN-3). Unknown commands are ignored.
const openCommand = (name) => {
  if (typeof name !== 'string' || !platform.host.getCommand(name)) return;
  try { platform.host.openWindow(name); }
  catch (err) { console.warn('[toolbar] could not open', name, err); }
};

platform.host.registerWidget('toolbar', (container, api) => {
  const config = readConfig();

  const styles = platform.host.createCSSStyleSheet();
  styles.replaceSync(`
    .widget-toolbar {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 0.3rem;
        min-width: 0;
        padding: 0.4rem;
    }

    .widget-toolbar-item {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2.2rem;
        height: 2.2rem;
        border-radius: var(--wm-radius, 8px);
        cursor: pointer;
    }

    .widget-toolbar-item:hover {
        background: rgba(127, 127, 127, 0.2);
    }
  `);
  platform.host.addCSSStyleSheet(styles);
  api.onDestroy(() => platform.host.removeCSSStyleSheet(styles));

  const render = (commands) => {
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'widget-toolbar';

    config.commands.forEach(entry => {
      const command = commands.find(c => c.name === entry.command);
      if (!command && !entry.icon) return;

      const icon = entry.icon || (command.meta && command.meta.icon) || 'apps';
      const title = entry.title || (command.meta && command.meta.title) || entry.command;

      const btn = document.createElement('div');
      btn.className = 'widget-toolbar-item';
      btn.title = title;
      btn.setAttribute('aria-label', entry.command);

      const span = document.createElement('span');
      span.className = 'material-symbols-outlined';
      span.textContent = icon;
      btn.appendChild(span);

      btn.addEventListener('click', () => openCommand(entry.command));
      wrapper.appendChild(btn);
    });

    container.appendChild(wrapper);
  };

  const sub = platform.host.commands$.subscribe(render);
  api.onDestroy(() => sub.unsubscribe());
}, {
  title: 'Toolbar',
});
