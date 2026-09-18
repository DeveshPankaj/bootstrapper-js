const platform = window.platform;

platform.host.registerCommand('ui.robot-sim', function(body, props) {
  if (!body) {
    platform.host.execCommand(
      "service('001-core.layout', 'open-window') (command('ui.robot-sim'))",
      platform
    );
    return;
  }

  var iframe = document.createElement('iframe');
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;background:#0d1117;';

  if (props && typeof props.sandboxAppIframe === 'function') {
    props.sandboxAppIframe(iframe);
  }

  iframe.src = '/(sw)/opt/apps/robot-sim/main.html';
  body.appendChild(iframe);

  if (props && typeof props.setTitle === 'function') {
    props.setTitle('Robot Sim — RL Training Playground');
  }
  if (props && typeof props.setWindowView === 'function') {
    props.setWindowView(true);
  }
});
