const platform = window.platform;

const LOG_PATH = '/var/log/notifications.json';

const relativeTime = (timestamp) => {
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.round(diffHour / 24);
  return `${diffDay}d ago`;
};

platform.host.registerWidget('notifications', (container, api) => {
  const styles = platform.host.createCSSStyleSheet();
  styles.replaceSync(`
    .widget-notifications {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 0;
        padding: 0.25rem;
    }

    .widget-notifications-bell {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2.2rem;
        height: 2.2rem;
        border-radius: var(--wm-radius, 8px);
        cursor: pointer;
    }

    .widget-notifications-bell:hover {
        background: rgba(127, 127, 127, 0.2);
    }

    .widget-notifications-badge {
        position: absolute;
        top: -2px;
        right: -2px;
        min-width: 16px;
        height: 16px;
        padding: 0 4px;
        border-radius: 8px;
        background: #ff3b30;
        color: #fff;
        font-size: 10px;
        font-weight: 700;
        line-height: 16px;
        text-align: center;
        pointer-events: none;
    }

    .widget-notifications-badge.hidden {
        display: none;
    }

    .widget-notifications-dropdown {
        position: absolute;
        top: calc(100% + 0.5rem);
        right: 0;
        width: 280px;
        max-height: 340px;
        display: flex;
        flex-direction: column;
        background: var(--wm-window-bg, rgba(30, 30, 30, 0.92));
        backdrop-filter: blur(var(--wm-blur, 12px));
        border-radius: var(--wm-radius, 8px);
        box-shadow: var(--wm-shadow, 0 8px 32px rgba(0, 0, 0, 0.45));
        color: var(--wm-header-color, #1d1d1f);
        cursor: default;
        z-index: 20;
        overflow: hidden;
    }

    .widget-notifications-dropdown.hidden {
        display: none;
    }

    .widget-notifications-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.6rem 0.75rem;
        font-size: 0.8rem;
        font-weight: 600;
        border-bottom: 1px solid rgba(127, 127, 127, 0.25);
    }

    .widget-notifications-clear {
        background: none;
        border: none;
        color: var(--wm-accent, #0a84ff);
        font-size: 0.75rem;
        cursor: pointer;
        padding: 0;
    }

    .widget-notifications-clear:hover {
        text-decoration: underline;
    }

    .widget-notifications-list {
        overflow-y: auto;
        flex: 1;
    }

    .widget-notifications-empty {
        padding: 1rem 0.75rem;
        font-size: 0.8rem;
        opacity: 0.7;
        text-align: center;
    }

    .widget-notifications-item {
        padding: 0.5rem 0.75rem;
        border-bottom: 1px solid rgba(127, 127, 127, 0.15);
    }

    .widget-notifications-item:last-child {
        border-bottom: none;
    }

    .widget-notifications-item-title {
        font-size: 0.8rem;
        font-weight: 600;
        margin-bottom: 0.15rem;
    }

    .widget-notifications-item-body {
        font-size: 0.75rem;
        opacity: 0.85;
        line-height: 1.35;
        margin-bottom: 0.2rem;
        word-break: break-word;
    }

    .widget-notifications-item-time {
        font-size: 0.65rem;
        opacity: 0.6;
    }
  `);
  platform.host.addCSSStyleSheet(styles);
  api.onDestroy(() => platform.host.removeCSSStyleSheet(styles));

  const wrapper = document.createElement('div');
  wrapper.className = 'widget-notifications';

  const bell = document.createElement('div');
  bell.className = 'widget-notifications-bell';
  bell.title = 'Notifications';
  const bellIcon = document.createElement('span');
  bellIcon.className = 'material-symbols-outlined';
  bellIcon.textContent = 'notifications';
  bell.appendChild(bellIcon);

  const badge = document.createElement('div');
  badge.className = 'widget-notifications-badge hidden';
  bell.appendChild(badge);

  const dropdown = document.createElement('div');
  dropdown.className = 'widget-notifications-dropdown hidden';

  const dropdownHeader = document.createElement('div');
  dropdownHeader.className = 'widget-notifications-header';
  const dropdownTitle = document.createElement('span');
  dropdownTitle.textContent = 'Notifications';
  const clearBtn = document.createElement('button');
  clearBtn.className = 'widget-notifications-clear';
  clearBtn.textContent = 'Clear all';
  dropdownHeader.appendChild(dropdownTitle);
  dropdownHeader.appendChild(clearBtn);

  const list = document.createElement('div');
  list.className = 'widget-notifications-list';

  dropdown.appendChild(dropdownHeader);
  dropdown.appendChild(list);

  wrapper.appendChild(bell);
  wrapper.appendChild(dropdown);
  container.appendChild(wrapper);

  let entries = [];
  let isOpen = false;

  const renderBadge = () => {
    const unread = entries.filter(e => !e.read).length;
    if (unread > 0) {
      badge.textContent = unread > 99 ? '99+' : String(unread);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  };

  const renderList = () => {
    list.innerHTML = '';
    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'widget-notifications-empty';
      empty.textContent = 'No notifications yet';
      list.appendChild(empty);
      return;
    }
    entries.forEach(entry => {
      const item = document.createElement('div');
      item.className = 'widget-notifications-item';

      if (entry.title) {
        const title = document.createElement('div');
        title.className = 'widget-notifications-item-title';
        title.textContent = entry.title;
        item.appendChild(title);
      }

      if (entry.body) {
        const body = document.createElement('div');
        body.className = 'widget-notifications-item-body';
        body.textContent = entry.body;
        item.appendChild(body);
      }

      const time = document.createElement('div');
      time.className = 'widget-notifications-item-time';
      time.textContent = relativeTime(entry.timestamp);
      item.appendChild(time);

      list.appendChild(item);
    });
  };

  const refresh = async () => {
    try {
      entries = (await platform.host.callCommand('notifications.list')) || [];
    } catch (err) {
      entries = [];
    }
    renderBadge();
    if (isOpen) renderList();
  };

  const openDropdown = async () => {
    isOpen = true;
    dropdown.classList.remove('hidden');
    renderList();
    try {
      entries = (await platform.host.callCommand('notifications.mark-all-read')) || [];
    } catch (err) { /* ignore */ }
    renderBadge();
    renderList();
  };

  const closeDropdown = () => {
    isOpen = false;
    dropdown.classList.add('hidden');
  };

  bell.addEventListener('click', (event) => {
    event.stopPropagation();
    if (isOpen) closeDropdown();
    else openDropdown();
  });

  dropdown.addEventListener('click', (event) => event.stopPropagation());

  clearBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    try {
      const fs = platform.host.getFS();
      fs.writeFileSync(LOG_PATH, JSON.stringify([]));
    } catch (err) { console.error('[notifications widget] failed to clear log:', err); }
    entries = [];
    renderBadge();
    renderList();
  });

  // Close on an outside interaction. Listening on `pointerdown` (not `click`)
  // matters here: the widgets panel's drag handling (WidgetItem in
  // src/core/layout/index.tsx) calls `el.setPointerCapture()` on pointerdown,
  // which redirects the *native* click that follows to the outer `.widget`
  // container rather than the actual element the user pressed - so a `click`
  // listener on `document` would see every click on this widget (including
  // the bell itself) as "outside" and immediately re-close the dropdown.
  // `pointerdown`'s `event.target` is unaffected by that capture redirect
  // (capture only changes where *later* events in the same gesture are
  // targeted), so it reliably reflects what was actually pressed.
  const onDocumentPointerDown = (event) => {
    if (isOpen && !wrapper.contains(event.target)) closeDropdown();
  };
  document.addEventListener('pointerdown', onDocumentPointerDown);

  refresh();
  const interval = setInterval(refresh, 4000);
  api.onDestroy(() => {
    clearInterval(interval);
    document.removeEventListener('pointerdown', onDocumentPointerDown);
  });
}, {
  title: 'Notifications',
});
