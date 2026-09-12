const platform = window.platform;

platform.host.registerCommand('ui.vector-store', function(body, props) {
  if (!body) {
    platform.host.execCommand(
      "service('001-core.layout', 'open-window') (command('ui.vector-store'))",
      platform
    );
    return;
  }

  var iframe = document.createElement('iframe');
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;background:#0f1117;';

  if (props && typeof props.sandboxAppIframe === 'function') {
    props.sandboxAppIframe(iframe);
    if (props.proxyFs) {
      props.proxyFs.mkdir('/home/user1/.local/share/vector-store').catch(function() {});
    }
  }

  iframe.src = '/(sw)/opt/apps/vector-store/main.html';
  body.appendChild(iframe);

  if (props && typeof props.setTitle === 'function') {
    props.setTitle('Vector Store');
  }
});
