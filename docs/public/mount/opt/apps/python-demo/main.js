const platform = window.platform;
const _APP_DIR = platform._appDir || '/opt/apps/python-demo';
const DEMO_HTML = `/(sw)${_APP_DIR}/demo.html`;

const run = (body, props) => {
  if (!body) {
    platform.host.execCommand("service('001-core.layout','open-window')(command('ui.python-demo'))", platform);
    return;
  }
  Object.assign(body.style, { margin: '0', padding: '0', overflow: 'hidden', height: '100%' });
  const iframe = document.createElement('iframe');
  iframe.src = DEMO_HTML;
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
  body.appendChild(iframe);

  // Inject platform bridge so Python code inside the iframe can open windows
  // and register its own commands (callbacks).
  //
  // How it works:
  //   - main.js runs in the execString shim → has access to platform.host
  //   - demo.html loads as a plain iframe → no platform access of its own
  //   - After load we stamp __pyBridge onto demo.html's contentWindow
  //   - Python accesses it via: from js import window; bridge = window.__pyBridge
  //   - Python callbacks are wrapped with create_proxy() before being passed here
  iframe.addEventListener('load', () => {
    iframe.contentWindow.__pyBridge = {
      // Open any registered command in a new detached window.
      openWindow: function(cmd, arg) {
        var str = arg
          ? "service('001-core.layout','open-window')(command('" + cmd + "'),'" + arg + "')"
          : "service('001-core.layout','open-window')(command('" + cmd + "'))";
        platform.host.execCommand(str, platform);
      },
      // Register a Python function (create_proxy'd) as a window command.
      // The callback receives (body: HTMLBodyElement, props: WindowProps) when the window opens.
      //
      // Pyodide borrowed-proxy rule: when Python passes a dict to a JS function, Pyodide
      // wraps it as a *borrowed* proxy that is destroyed after the call returns. Storing a
      // borrowed proxy (e.g. as command.meta) and reading it later crashes with
      // "borrowed proxy was automatically destroyed". We convert the meta dict to a real
      // JS object here via .toJs() so the stored reference is permanent.
      registerCommand: function(name, fn, meta) {
        var jsMeta = {};
        if (meta) {
          try {
            jsMeta = (typeof meta.toJs === 'function')
              ? meta.toJs({ dict_converter: Object.fromEntries })
              : Object.assign({}, meta);
          } catch (_) { jsMeta = {}; }
        }
        platform.host.registerCommand(name, fn, jsMeta);
      },
      // Unregister a previously registered command by name.
      unregisterCommand: function(name) {
        platform.host.registerCommand(name, null, { callable: false });
      },
    };
  });

  props.setWindowView(true);
};

platform.host.registerCommand('ui.python-demo', run, {
  title: 'Python Demo',
  icon: 'code',
  description: 'Interactive Python (Pyodide) demo: create buttons, apply CSS, handle clicks',
  category: 'Development',
});
