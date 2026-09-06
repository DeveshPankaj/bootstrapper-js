const platform = window.platform;

platform.host.registerCommand('ui.trainboard', function(body, props) {
  if (!body) {
    platform.host.execCommand(
      "service('001-core.layout', 'open-window') (command('ui.trainboard'))",
      platform
    );
    return;
  }

  var iframe = document.createElement('iframe');
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;background:#fafafa;';

  if (props && typeof props.sandboxAppIframe === 'function') {
    props.sandboxAppIframe(iframe);
  }

  iframe.src = '/(sw)/opt/apps/trainboard/main.html';
  body.appendChild(iframe);

  if (props && props.setWindowView) props.setWindowView(true);
}, {
  title: 'TrainBoard',
  icon: 'monitoring',
  callable: true,
});
