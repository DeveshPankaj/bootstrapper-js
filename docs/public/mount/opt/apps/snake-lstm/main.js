const platform = window.platform;

platform.host.registerCommand('ui.snake-lstm', function(body, props) {
  if (!body) {
    platform.host.execCommand(
      "service('001-core.layout', 'open-window') (command('ui.snake-lstm'))",
      platform
    );
    return;
  }

  var iframe = document.createElement('iframe');
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;background:#0f0f12;';

  if (props && typeof props.sandboxAppIframe === 'function') {
    props.sandboxAppIframe(iframe);
  }

  iframe.src = '/(sw)/opt/apps/snake-lstm/main.html';
  body.appendChild(iframe);

  if (props && props.setWindowView) props.setWindowView(true);
}, {
  title: 'Snake LSTM',
  icon: 'sports_esports',
  callable: true,
});
