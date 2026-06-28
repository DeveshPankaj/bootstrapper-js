const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')
const { utils } = platform.getService('settings')
const { fs, DEFAULT_WM_SETTINGS, WM_SETTINGS_PATH, WM_THEMES_DIR, ColorAlphaInput } = utils

const DE_PREVIEWS = {
  macos: {
    icon: 'laptop_mac',
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    preview: { taskbar: 'bottom-center', buttons: 'left-circles' },
  },
  windows: {
    icon: 'desktop_windows',
    gradient: 'linear-gradient(135deg, #0078d4 0%, #005a9e 100%)',
    preview: { taskbar: 'bottom-full', buttons: 'right-icons' },
  },
  linux: {
    icon: 'terminal',
    gradient: 'linear-gradient(135deg, #3584e4 0%, #1c71d8 100%)',
    preview: { taskbar: 'top-full', buttons: 'right-circles' },
  },
}

const PreviewCard = ({ de, isActive, onClick }) => {
  const preview = DE_PREVIEWS[de.id] || DE_PREVIEWS.macos
  const { taskbar, buttons } = preview.preview

  const circle = (color) => React.createElement('div', { style: { width: 5, height: 5, borderRadius: '50%', background: color } })
  const square = () => React.createElement('div', { style: { width: 6, height: 6, borderRadius: de.id === 'linux' ? '50%' : '1px', background: 'rgba(255,255,255,0.3)' } })

  return React.createElement('div', {
    onClick,
    style: {
      cursor: 'pointer', borderRadius: '12px',
      border: isActive ? '2px solid #0a84ff' : '2px solid rgba(255,255,255,0.08)',
      overflow: 'hidden', background: '#1a1a1a',
      transition: 'border-color 0.2s ease',
    },
  },
    React.createElement('div', {
      style: {
        height: '130px', background: preview.gradient, position: 'relative',
        display: 'flex', flexDirection: 'column', padding: '8px',
      },
    },
      taskbar === 'top-full' && React.createElement('div', {
        style: {
          height: '16px', background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', padding: '0 6px', gap: '3px', fontSize: '7px', color: 'rgba(255,255,255,0.7)',
        },
      }, 'Activities', React.createElement('span', { style: { flex: 1 } })),

      React.createElement('div', {
        style: { flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '8px' },
      },
        React.createElement('div', {
          style: {
            width: '70%', height: '80%', background: 'rgba(255,255,255,0.15)',
            borderRadius: de.id === 'linux' ? '8px' : de.id === 'windows' ? '4px' : '6px',
            overflow: 'hidden', display: 'flex', flexDirection: 'column',
          },
        },
          React.createElement('div', {
            style: {
              height: '14px', background: 'rgba(0,0,0,0.4)', display: 'flex',
              alignItems: 'center', padding: '0 4px',
              justifyContent: buttons === 'left-circles' ? 'flex-start' : 'flex-end', gap: '2px',
            },
          },
            buttons === 'left-circles'
              ? [circle('#ff5f57'), circle('#febc2e'), circle('#28c840')]
              : [square(), square(), square()]
          ),
        )
      ),

      (taskbar === 'bottom-center' || taskbar === 'bottom-full') && React.createElement('div', {
        style: {
          height: '18px', background: 'rgba(0,0,0,0.4)',
          borderRadius: taskbar === 'bottom-center' ? '8px' : '0',
          margin: taskbar === 'bottom-center' ? '0 auto' : '0',
          width: taskbar === 'bottom-center' ? '50%' : '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '0 6px',
        },
      },
        [1,2,3,4].map(i => React.createElement('div', {
          key: i, style: { width: 8, height: 8, borderRadius: '2px', background: 'rgba(255,255,255,0.4)' },
        }))
      ),
    ),

    React.createElement('div', {
      style: { padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px' },
    },
      React.createElement('span', {
        className: 'material-symbols-outlined',
        style: { fontSize: '24px', background: preview.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
      }, preview.icon),
      React.createElement('div', {},
        React.createElement('div', { style: { fontWeight: 600, fontSize: '0.9rem', color: '#fff' } }, de.name),
        React.createElement('div', { style: { fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginTop: '2px' } }, de.description),
      ),
      isActive && React.createElement('span', {
        className: 'material-symbols-outlined',
        style: { marginLeft: 'auto', color: '#0a84ff', fontSize: '20px' },
      }, 'check_circle'),
    ),
  )
}

const LayoutSection = () => {
  const readLayouts = () => {
    try { return JSON.parse(fs.readFileSync('/etc/wm/layouts.json', 'utf-8')).layouts ?? [] }
    catch (err) { return [] }
  }
  const readCurrentLayout = () => {
    try { return JSON.parse(fs.readFileSync('/etc/wm/config.json', 'utf-8')).layout ?? 'default' }
    catch (err) { return 'default' }
  }

  const [layouts] = React.useState(readLayouts)
  const [currentLayout, setCurrentLayout] = React.useState(readCurrentLayout)

  const onSelectLayout = (layoutId) => {
    setCurrentLayout(layoutId)
    platform.host.callCommand('set-layout', layoutId)
  }

  return React.createElement(React.Fragment, null,
    React.createElement('h3', { className: 'settings-section-title' }, 'Layout'),
    React.createElement('div', { className: 'settings-group' },
      React.createElement('div', { className: 'settings-group-body' },
        ...layouts.map(layout =>
          React.createElement('div', {
            key: layout.id, className: 'settings-row',
            style: { cursor: 'pointer' }, onClick: () => onSelectLayout(layout.id),
          },
            React.createElement('div', { className: 'settings-row-text' },
              React.createElement('div', { className: 'settings-row-title' }, layout.name),
            ),
            layout.id === currentLayout && React.createElement('span', {
              className: 'material-symbols-outlined', style: { color: '#0a84ff' },
            }, 'check'),
          )
        ),
      ),
    ),
  )
}

const AppearanceSection = ({ settings, setAppearance, setBehavior, resetToDefaults }) => {
  const readThemes = () => {
    try {
      if (!fs.existsSync(WM_THEMES_DIR)) return []
      return fs.readdirSync(WM_THEMES_DIR).filter(f => f.endsWith('.json')).map(file => {
        const id = file.replace(/\.json$/, '')
        let raw = {}
        try { raw = JSON.parse(fs.readFileSync(`${WM_THEMES_DIR}/${file}`, 'utf-8')) } catch (err) {}
        return { id, name: raw.name || id, appearance: { ...DEFAULT_WM_SETTINGS.appearance, ...raw.appearance } }
      })
    } catch (err) { return [] }
  }

  const [themes] = React.useState(readThemes)
  const [currentThemeId, setCurrentThemeId] = React.useState(() => {
    try { return JSON.parse(fs.readFileSync(WM_SETTINGS_PATH, 'utf-8')).name?.toLowerCase() }
    catch (err) { return undefined }
  })

  const selectTheme = (theme) => {
    platform.host.callCommand('set-window-manager-theme', theme.id)
    setCurrentThemeId(theme.id)
  }

  return React.createElement(React.Fragment, null,
    React.createElement('h3', { className: 'settings-section-title' }, 'Theme'),
    React.createElement('div', { className: 'settings-group' },
      React.createElement('div', { className: 'settings-group-body', style: { padding: '0.6rem 0.8rem', display: 'block' } },
        ...themes.map(theme =>
          React.createElement('div', {
            key: theme.id,
            style: {
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.6rem 0.8rem', margin: '0.4rem 0',
              border: theme.id === currentThemeId ? '2px solid #0a84ff' : '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px', cursor: 'pointer',
              background: theme.id === currentThemeId ? 'rgba(10,132,255,0.1)' : 'transparent',
            },
            onClick: () => selectTheme(theme),
          },
            React.createElement('div', {
              style: {
                width: '2.5rem', height: '1.6rem',
                borderRadius: `${Math.min(theme.appearance.borderRadius, 8)}px`,
                background: theme.appearance.windowBackground,
                border: `2px solid ${theme.appearance.headerBackground}`,
                outline: `2px solid ${theme.appearance.accentColor}`,
                flexShrink: 0,
              },
            }),
            React.createElement('strong', {}, theme.name),
            theme.id === currentThemeId ? React.createElement('span', { style: { marginLeft: 'auto', color: '#0a84ff' } }, '(active)') : null,
          )
        ),
      ),
    ),

    React.createElement('h3', { className: 'settings-section-title' }, 'Appearance'),
    React.createElement('div', { className: 'settings-group' },
      React.createElement('div', { className: 'settings-group-body' },
        React.createElement('div', { className: 'settings-row' },
          React.createElement('span', { className: 'settings-row-label' }, 'Title bar background'),
          React.createElement('input', { type: 'color', value: settings.appearance.headerBackground, onChange: e => setAppearance('headerBackground', e.target.value) }),
        ),
        React.createElement('div', { className: 'settings-row' },
          React.createElement('span', { className: 'settings-row-label' }, 'Title bar text color'),
          React.createElement('input', { type: 'color', value: settings.appearance.headerColor, onChange: e => setAppearance('headerColor', e.target.value) }),
        ),
        React.createElement('div', { className: 'settings-row' },
          React.createElement('span', { className: 'settings-row-label' }, 'Window background'),
          React.createElement(ColorAlphaInput, { value: settings.appearance.windowBackground, onChange: v => setAppearance('windowBackground', v) }),
        ),
        React.createElement('div', { className: 'settings-row' },
          React.createElement('span', { className: 'settings-row-label' }, 'Taskbar background'),
          React.createElement(ColorAlphaInput, { value: settings.appearance.taskbarBackground, onChange: v => setAppearance('taskbarBackground', v) }),
        ),
        React.createElement('div', { className: 'settings-row' },
          React.createElement('span', { className: 'settings-row-label' }, `Taskbar size (${settings.appearance.taskbarSize}px)`),
          React.createElement('input', { type: 'range', min: '40', max: '96', value: settings.appearance.taskbarSize, onChange: e => setAppearance('taskbarSize', Number(e.target.value)) }),
        ),
        React.createElement('div', { className: 'settings-row' },
          React.createElement('span', { className: 'settings-row-label' }, 'Accent color'),
          React.createElement('input', { type: 'color', value: settings.appearance.accentColor, onChange: e => setAppearance('accentColor', e.target.value) }),
        ),
        React.createElement('div', { className: 'settings-row' },
          React.createElement('span', { className: 'settings-row-label' }, `Corner radius (${settings.appearance.borderRadius}px)`),
          React.createElement('input', { type: 'range', min: '0', max: '24', value: settings.appearance.borderRadius, onChange: e => setAppearance('borderRadius', Number(e.target.value)) }),
        ),
        React.createElement('div', { className: 'settings-row' },
          React.createElement('span', { className: 'settings-row-label' }, `Background blur (${settings.appearance.blur}px)`),
          React.createElement('input', { type: 'range', min: '0', max: '40', value: settings.appearance.blur, onChange: e => setAppearance('blur', Number(e.target.value)) }),
        ),
        React.createElement('div', { className: 'settings-row' },
          React.createElement('span', { className: 'settings-row-label' }, 'Drop shadow'),
          React.createElement('input', { type: 'checkbox', checked: settings.appearance.shadow, onChange: e => setAppearance('shadow', e.target.checked) }),
        ),
      ),
    ),

    React.createElement('h3', { className: 'settings-section-title' }, 'Behavior'),
    React.createElement('div', { className: 'settings-group' },
      React.createElement('div', { className: 'settings-group-body' },
        React.createElement('div', { className: 'settings-row' },
          React.createElement('span', { className: 'settings-row-label' }, 'Double-click title bar to toggle fullscreen'),
          React.createElement('input', { type: 'checkbox', checked: settings.behavior.dblClickHeaderFullscreen, onChange: e => setBehavior('dblClickHeaderFullscreen', e.target.checked) }),
        ),
        React.createElement('div', { className: 'settings-row' },
          React.createElement('span', { className: 'settings-row-label' }, 'Bring window to front on click'),
          React.createElement('input', { type: 'checkbox', checked: settings.behavior.bringToFrontOnClick, onChange: e => setBehavior('bringToFrontOnClick', e.target.checked) }),
        ),
      ),
    ),

    React.createElement('div', { style: { marginTop: '1rem' } },
      React.createElement('button', { className: 'settings-btn', onClick: resetToDefaults }, 'Reset to defaults'),
    ),
  )
}

const DesktopEnvSettings = () => {
  const envs = platform.host.callCommand('get-desktop-envs')
  const [currentEnv, setCurrentEnv] = React.useState(() => platform.host.callCommand('get-current-desktop-env'))

  const readWmSettings = () => {
    try {
      const raw = JSON.parse(fs.readFileSync(WM_SETTINGS_PATH, 'utf-8'))
      return {
        appearance: { ...DEFAULT_WM_SETTINGS.appearance, ...raw.appearance },
        behavior: { ...DEFAULT_WM_SETTINGS.behavior, ...raw.behavior },
      }
    } catch (err) { return DEFAULT_WM_SETTINGS }
  }
  const [settings, setSettings] = React.useState(readWmSettings)

  const onSelectDE = (envId) => {
    setCurrentEnv(envId)
    platform.host.callCommand('set-desktop-env', envId)
    setSettings(readWmSettings())
  }

  const persist = (next) => {
    setSettings(next)
    if (!fs.existsSync('/etc/wm')) fs.mkdirSync('/etc/wm', { recursive: true })
    fs.writeFileSync(WM_SETTINGS_PATH, JSON.stringify(next, null, 2))
    platform.host.callCommand('set-window-manager-settings', next)
  }

  const setAppearance = (key, value) => persist({ ...settings, appearance: { ...settings.appearance, [key]: value } })
  const setBehavior = (key, value) => persist({ ...settings, behavior: { ...settings.behavior, [key]: value } })
  const resetToDefaults = () => persist(DEFAULT_WM_SETTINGS)

  return React.createElement('div', { className: 'settings-page' },
    React.createElement('h1', { className: 'settings-page-title' }, 'Desktop Environment'),
    React.createElement('p', { className: 'settings-page-subtitle' },
      'Choose a desktop environment, then fine-tune the layout, theme, and window appearance below.'
    ),

    React.createElement('div', {
      style: {
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: '16px', marginTop: '16px', marginBottom: '24px',
      },
    },
      ...(envs || []).map(de =>
        React.createElement(PreviewCard, { key: de.id, de, isActive: de.id === currentEnv, onClick: () => onSelectDE(de.id) })
      ),
    ),

    React.createElement(LayoutSection),

    React.createElement(AppearanceSection, { settings, setAppearance, setBehavior, resetToDefaults }),

    React.createElement('p', { className: 'settings-hint', style: { marginTop: '20px' } },
      'Each desktop environment bundles a layout, theme, and window chrome style. ',
      'You can override any setting below after switching — your customizations are saved to ',
      React.createElement('code', null, '/etc/wm/current.json'),
      '. Theme files in ',
      React.createElement('code', null, '/etc/wm/themes/'),
      ' can also be edited directly. For deeper behavior customization, edit ',
      React.createElement('code', null, '/opt/window-manager.js'),
      '.',
    ),
  )
}

platform.getService('settings').registerSection('04b-desktop-env', (container, api) => {
  const root = ReactDOM.createRoot(container)
  root.render(React.createElement(DesktopEnvSettings))
  return () => setTimeout(() => root.unmount(), 0)
}, {
  title: 'Desktop Env',
  icon: 'computer',
  color: '#764ba2',
})
