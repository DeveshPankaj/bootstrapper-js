const platform = window.platform;

platform.host.registerCommand('ui.alpine-wasm', function(body, props) {
  if (!body) {
    platform.host.execCommand(
      "service('001-core.layout', 'open-window') (command('ui.alpine-wasm'))",
      platform
    );
    return;
  }

  var iframe = document.createElement('iframe');
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;background:#0d1117;';

  if (props && typeof props.sandboxAppIframe === 'function') {
    props.sandboxAppIframe(iframe);
  }

  // Use the static path directly — the SW path causes clients.matchAll() to
  // exclude the main page when the request comes from a sandboxed iframe,
  // leaving the sw-bridge with no reply path and the Promise hanging forever.
  // The _base computation in main.html already handles /public/mount/... paths.
  iframe.src = '/public/mount/opt/apps/alpine-wasm/main.html';
  body.appendChild(iframe);

  if (props && typeof props.setTitle === 'function') {
    props.setTitle('Alpine WASM');
  }
  if (props && typeof props.setWindowView === 'function') {
    props.setWindowView(true);
  }
});
