const platform = window.platform;

platform.host.registerCommand('ui.ai-dom-lens', function(body, props) {
  if (!body) {
    platform.host.execCommand(
      "service('001-core.layout', 'open-window') (command('ui.ai-dom-lens'))",
      platform
    );
    return;
  }

  var iframe = document.createElement('iframe');
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;background:#0f1117;';

  if (props && typeof props.sandboxAppIframe === 'function') {
    props.sandboxAppIframe(iframe);
  }

  iframe.src = '/(sw)/opt/apps/ai-dom-lens/main.html';
  body.appendChild(iframe);

  if (props && typeof props.setTitle === 'function') {
    props.setTitle('AI DOM Lens');
  }
});
