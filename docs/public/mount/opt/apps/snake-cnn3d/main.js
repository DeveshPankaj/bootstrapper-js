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
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;background:#0f0f12;';

  if (props && typeof props.sandboxAppIframe === 'function') {
    props.sandboxAppIframe(iframe);
  }

  iframe.src = '/(sw)/opt/apps/snake-cnn3d/main.html';
  body.appendChild(iframe);

  if (props && props.setWindowView) props.setWindowView(true);
}, {
  title: 'Snake CNN3D',
  icon: 'sports_esports',
  callable: true,
});
