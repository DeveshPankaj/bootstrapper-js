const platform = window.platform;
const fs = platform.host.getFS();

function injectAppSDK(iframe, props) {
  try {
    const iwin = iframe.contentWindow;
    if (!iwin) return;
    iwin.AppSDK = {
      readText: function(p) {
        try { return Promise.resolve(fs.readFileSync(p, 'utf8')); }
        catch(e) { return Promise.reject(e); }
      },
      writeText: function(p, c) {
        try {
          var dir = p.split('/').slice(0, -1).join('/');
          if (dir) try { fs.mkdirSync(dir, { recursive: true }); } catch(_) {}
          fs.writeFileSync(p, c);
          return Promise.resolve(true);
        } catch(e) { return Promise.reject(e); }
      },
      mkdir: function(p) {
        try { fs.mkdirSync(p, { recursive: true }); } catch(_) {}
        return Promise.resolve(true);
      },
      remove: function(p) {
        try { fs.unlinkSync(p); } catch(_) {}
        return Promise.resolve(true);
      },
      list: function(p) {
        try { return Promise.resolve(fs.readdirSync(p)); }
        catch(e) { return Promise.reject(e); }
      },
      exists: function(p) { return Promise.resolve(fs.existsSync(p)); },
      stat: function(p) {
        try {
          var s = fs.statSync(p);
          return Promise.resolve({ isDirectory: s.isDirectory(), isFile: s.isFile(), size: s.size });
        } catch(e) { return Promise.reject(e); }
      },
      rename: function(f, t) {
        try { fs.renameSync(f, t); return Promise.resolve(true); }
        catch(e) { return Promise.reject(e); }
      },
      setTitle: function(t) {
        if (props && props.setTitle) props.setTitle(t);
        return Promise.resolve(true);
      },
      log: function(v) { console.log('[app]', v); return Promise.resolve(true); },
    };
  } catch(e) { console.warn('[model-builder] AppSDK inject failed', e); }
}

platform.host.registerCommand('ui.model-builder', function(body, props) {
  if (!body) {
    platform.host.execCommand(
      "service('001-core.layout', 'open-window') (command('ui.model-builder'))",
      platform
    );
    return;
  }

  var iframe = document.createElement('iframe');
  iframe.src = '/(sw)/opt/apps/model-builder/main.html';
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;background:#1e1e22;';
  body.appendChild(iframe);

  if (props && props.setWindowView) props.setWindowView(true);
  iframe.addEventListener('load', function() { injectAppSDK(iframe, props); });
}, {
  title: 'Model Builder',
  icon: 'schema',
  description: 'Visual neural network model builder — assemble layers, pick datasets, train in-browser.',
  callable: true,
});
