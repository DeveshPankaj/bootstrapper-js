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
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;background:#1e1e22;';

  // Sandbox the app iframe — AppSDK is delivered via postMessage + MessageChannel
  // so the app cannot access window.top or platform directly.
  if (props && typeof props.sandboxAppIframe === 'function') {
    props.sandboxAppIframe(iframe);
    // Init log dir + file via ProxyFS after sandbox bridge is ready
    if (props.proxyFs) {
      props.proxyFs.mkdir('/home/user1/.local/share/model-builder').catch(function() {});
      props.proxyFs.exists('/home/user1/.local/share/model-builder/model-builder.log').then(function(exists) {
        if (!exists) props.proxyFs.writeText('/home/user1/.local/share/model-builder/model-builder.log', '').catch(function() {});
      }).catch(function() {});
    }
  }

  iframe.src = '/(sw)/opt/apps/model-builder/main.html';
  body.appendChild(iframe);

  if (props && props.setWindowView) props.setWindowView(true);
}, {
  title: 'Model Builder',
  icon: 'schema',
  callable: true,
});
