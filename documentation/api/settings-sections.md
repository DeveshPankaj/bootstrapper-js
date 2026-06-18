# Custom Settings Sections

**Sources:** `src/shared/index.ts` (`SettingsSectionDef`, `SettingsSectionApi`), `src/core/layout/index.tsx` (Settings rendering)

The Settings window (`/home/user1/settings.html`) supports dynamically registered sections. Each section appears as a nav item in the left sidebar and renders a custom panel when selected. Sections can be registered from any VFS script or compiled module.

---

## Registration API

### `platform.host.registerSettingsSection(name, render, meta?)` → `{ remove() }`

Register a new settings section. New sections are appended to the list (rendered in registration order in the nav sidebar).

```javascript
const { remove } = platform.host.registerSettingsSection(
  'my-section',                       // unique section name / nav ID
  (container, api) => {               // render function
    container.innerHTML = '<h2>My Settings</h2><p>Configure things here.</p>';

    const input = document.createElement('input');
    input.value = loadMyPref();
    input.onchange = () => saveMyPref(input.value);
    container.appendChild(input);

    api.onDestroy(() => {
      // Cleanup when the section is unloaded or the Settings window closes
    });
  },
  {
    label: 'My Section',              // display label in the nav sidebar
    icon: 'tune',                     // Material Symbols Outlined icon name
  }
);

// To unregister the section later:
remove();
```

**Arguments:**

| Argument | Type | Description |
|---|---|---|
| `name` | `string` | Unique identifier for the section. Used as the nav item ID. |
| `render` | `(container, api) => void` | Called when the section is selected. Render your UI into `container`. |
| `meta` | `object` | Optional. Shape: `{ label?: string, icon?: string }`. |

**`meta.label`** — The string shown in the Settings nav sidebar. Defaults to `name` if absent.

**`meta.icon`** — A Material Symbols Outlined ligature name shown next to the label (e.g. `'tune'`, `'palette'`, `'storage'`, `'settings'`).

---

## SettingsSectionApi

The `api` object passed to the render function:

| Property | Type | Description |
|---|---|---|
| `api.platform` | `Platform` | The Platform instance for this section. Use for service lookups, FS access, etc. |
| `api.onDestroy(cb)` | `(cb: Function) => void` | Register a cleanup callback called when the section is unloaded or the Settings window closes. |

```javascript
(container, api) => {
  const fs = api.platform.host.getFS();
  const prefs = JSON.parse(fs.readFileSync('/user-preferences.json', 'utf-8'));

  // ... render UI ...

  api.onDestroy(() => {
    // Dispose subscriptions, cancel timers, etc.
  });
}
```

---

## Registering from a VFS boot script

Settings sections registered at boot time (e.g. from scripts loaded by `initd.run`) are available as soon as the Settings window opens:

```javascript
// /home/user1/apps/my-settings-plugin.js
// (loaded via initd.run or /etc/widgets/ mechanism)

platform.host.registerSettingsSection(
  'developer',
  (container, api) => {
    container.style.padding = '1rem';
    container.innerHTML = `
      <h2 style="margin:0 0 1rem">Developer Tools</h2>
      <button id="clear-cache">Clear VFS Cache</button>
    `;
    container.querySelector('#clear-cache').onclick = () => {
      const fs = api.platform.host.getFS();
      // ... clear logic ...
      api.platform.host.callCommand('notify', { title: 'Cache cleared' });
    };
  },
  { label: 'Developer', icon: 'code' }
);
```

---

## Via the `'settings'` service (for runtime registration)

When the Settings window is open, it registers a `'settings'` service on the root platform. Scripts that load after Settings is open can use this service:

```javascript
const settings = platform.getServiceSync('settings');
if (settings) {
  settings.registerSection('my-section', render, meta);
  // settings.unregisterSection('my-section');
}
```

This service is unregistered when the Settings window closes. Scripts that need to register a section regardless of when Settings opens should use `platform.host.registerSettingsSection` (which persists in `settingsSections$` and is picked up whenever the Settings window renders).

---

## Built-in section names

The following section names are used by the built-in Settings app. Avoid reusing these names to prevent collision (the most recently registered name wins):

| Name | Label | Notes |
|---|---|---|
| `appearance` | Appearance | Window manager appearance (colors, blur, radius) |
| `layout` | Layout | Desktop layout presets |
| `wallpaper` | Wallpaper | Wallpaper picker and folder setting |
| `widgets` | Widgets | Enable/disable desktop widgets |
| `keybindings` | Keybindings | Keyboard shortcut editor |
| `storage` | Storage | IndexedDB vs. LocalStorage backend switch |

---

## How sections appear

The Settings sidebar lists one nav item per registered section. Each item shows:
- The `icon` (Material Symbols Outlined) from `meta`
- The `label` (or `name` if label is absent) from `meta`

Clicking a nav item calls the section's `render` function with a fresh container element. Navigating to a different section calls `api.onDestroy` on the previous section's render context.

Sections are rendered in the order they were registered (appended list). Built-in sections are registered first; dynamically registered sections appear after them.

---

## Full example: custom theme editor section

```javascript
// Register a section that allows picking a custom accent color
platform.host.registerSettingsSection(
  'custom-theme',
  (container, api) => {
    const fs = api.platform.host.getFS();
    const host = api.platform.host;

    container.style.cssText = 'padding:1.5rem;display:flex;flex-direction:column;gap:1rem;';

    const heading = document.createElement('h2');
    heading.textContent = 'Custom Theme';
    heading.style.margin = '0';
    container.appendChild(heading);

    const label = document.createElement('label');
    label.textContent = 'Accent color: ';
    const picker = document.createElement('input');
    picker.type = 'color';

    // Load current setting
    try {
      const current = JSON.parse(fs.readFileSync('/etc/wm/current.json', 'utf-8'));
      picker.value = current.appearance?.accent || '#007aff';
    } catch (_) {}

    picker.oninput = () => {
      host.callCommand('set-window-manager-settings', {
        appearance: { accent: picker.value }
      });
    };

    label.appendChild(picker);
    container.appendChild(label);

    api.onDestroy(() => {
      // Nothing to clean up — picker is in the DOM and will be removed automatically
    });
  },
  { label: 'Custom Theme', icon: 'palette' }
);
```
