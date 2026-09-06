const platform = window.platform;

platform.host.registerCommand('ui.snake-cnn3d', function(body, props) {
  if (!body) {
    platform.host.execCommand(
      "service('001-core.layout', 'open-window') (command('ui.snake-cnn3d'))",
      platform
    );
    return;
  }

  var iframe = document.createElement('iframe');
  iframe.src = '/(sw)/opt/apps/snake-cnn3d/main.html';
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;background:#1a1a1e;';
  body.appendChild(iframe);

  if (props && props.setWindowView) props.setWindowView(true);

  iframe.addEventListener('load', function() {
    // Use ProxyFS from window manager (Ring 1) when available.
    // Falls back to raw fs for backward compat (e.g. direct execString calls).
    if (props && props.proxyFs && typeof props.proxyFs.toAppSDK === 'function') {
      iframe.contentWindow.AppSDK = props.proxyFs.toAppSDK({ setTitle: props.setTitle });
    } else {
      // Fallback: build raw AppSDK directly from kernel fs
      var rawFs = platform.host.getFS();
      iframe.contentWindow.AppSDK = {
        readText: function(p) {
          try { return Promise.resolve(rawFs.readFileSync(p, 'utf8')); }
          catch(e) { return Promise.reject(e); }
        },
        writeText: function(p, c) {
          try {
            var dir = p.split('/').slice(0, -1).join('/');
            if (dir) {
              var parts = dir.replace(/^\//, '').split('/');
              var cur2 = '';
              for (var pi = 0; pi < parts.length; pi++) {
                cur2 += '/' + parts[pi];
                if (!rawFs.existsSync(cur2)) rawFs.mkdirSync(cur2);
              }
            }
            rawFs.writeFileSync(p, c);
            return Promise.resolve(true);
          } catch(e) { return Promise.reject(e); }
        },
        mkdir: function(p) {
          try {
            var parts = p.replace(/^\//, '').split('/');
            var cur3 = '';
            for (var pi = 0; pi < parts.length; pi++) {
              cur3 += '/' + parts[pi];
              if (!rawFs.existsSync(cur3)) rawFs.mkdirSync(cur3);
            }
          } catch(_) {}
          return Promise.resolve(true);
        },
        remove:  function(p) { try { rawFs.unlinkSync(p); } catch(_) {} return Promise.resolve(true); },
        list:    function(p) { try { return Promise.resolve(rawFs.readdirSync(p)); } catch(e) { return Promise.reject(e); } },
        exists:  function(p) { return Promise.resolve(rawFs.existsSync(p)); },
        stat:    function(p) {
          try {
            var s = rawFs.statSync(p);
            return Promise.resolve({ isDirectory: s.isDirectory(), isFile: s.isFile(), size: s.size });
          } catch(e) { return Promise.reject(e); }
        },
        rename:  function(f, t) { try { rawFs.renameSync(f, t); return Promise.resolve(true); } catch(e) { return Promise.reject(e); } },
        setTitle: function(t) { if (props && props.setTitle) props.setTitle(t); return Promise.resolve(true); },
        log:     function(v) { console.log('[app]', v); return Promise.resolve(true); },
      };
    }
  });
}, {
  title: 'Snake AI (Conv3D)',
  icon: 'view_in_ar',
  callable: true,
});
