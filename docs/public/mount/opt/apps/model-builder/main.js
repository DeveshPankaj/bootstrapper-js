const platform = window.platform;

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

  iframe.addEventListener('load', function() {
    // Use ProxyFS from window manager (Ring 1) when available.
    // Falls back to raw fs for backward compat.
    if (props && props.proxyFs && typeof props.proxyFs.toAppSDK === 'function') {
      iframe.contentWindow.AppSDK = props.proxyFs.toAppSDK({ setTitle: props.setTitle });
      // Init log dir + file via ProxyFS (ACL-checked)
      props.proxyFs.mkdir('/home/user1/.local/share/model-builder').catch(function() {});
      props.proxyFs.exists('/home/user1/.local/share/model-builder/model-builder.log').then(function(exists) {
        if (!exists) props.proxyFs.writeText('/home/user1/.local/share/model-builder/model-builder.log', '').catch(function() {});
      }).catch(function() {});
    } else {
      // Fallback: build raw AppSDK directly from kernel fs
      var rawFs = platform.host.getFS();
      // Init log dir + file (segment-by-segment; BrowserFS ignores recursive flag)
      try {
        var logDir = '/home/user1/.local/share/model-builder';
        var segs = logDir.replace(/^\//, '').split('/');
        var cur = '';
        for (var si = 0; si < segs.length; si++) {
          cur += '/' + segs[si];
          if (!rawFs.existsSync(cur)) rawFs.mkdirSync(cur);
        }
        var logPath = logDir + '/model-builder.log';
        if (!rawFs.existsSync(logPath)) rawFs.writeFileSync(logPath, '');
      } catch(le) { console.warn('[model-builder] log init failed', le); }

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
  title: 'Model Builder',
  icon: 'schema',
  callable: true,
});
