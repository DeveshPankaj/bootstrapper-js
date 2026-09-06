const platform = window.platform;

platform.host.registerCommand('ui.nn-ide', function(body, props) {
  if (!body) {
    platform.host.execCommand(
      "service('001-core.layout', 'open-window') (command('ui.nn-ide'))",
      platform
    );
    return;
  }

  var iframe = document.createElement('iframe');
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;background:#1e1e22;';

  if (props && typeof props.sandboxAppIframe === 'function') {
    props.sandboxAppIframe(iframe);
  }

  iframe.src = '/(sw)/opt/apps/nn-ide/main.html';
  body.appendChild(iframe);

  if (props && props.setWindowView) props.setWindowView(true);
}, {
  title: 'NN IDE',
  icon: 'lan',
  callable: true,
});
