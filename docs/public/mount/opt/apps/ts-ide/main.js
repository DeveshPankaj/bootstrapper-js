const platform = window.platform;

platform.host.registerCommand('ui.ts-ide', function(body, props) {
  if (!body) {
    platform.host.execCommand(
      "service('001-core.layout', 'open-window') (command('ui.ts-ide'))",
      platform
    );
    return;
  }

  var iframe = document.createElement('iframe');
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;background:#0d1117;';

  if (props && typeof props.sandboxAppIframe === 'function') {
    props.sandboxAppIframe(iframe);
  }

  iframe.src = '/(sw)/opt/apps/ts-ide/main.html';
  body.appendChild(iframe);

  if (props && typeof props.setTitle === 'function') {
    props.setTitle('TypeScript / WebGL IDE');
  }
  if (props && typeof props.setWindowView === 'function') {
    props.setWindowView(true);
  }
});

var _tsSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="2" y="1" width="28" height="30" rx="3" fill="#1a3353"/><text x="16" y="14" text-anchor="middle" font-family="monospace" font-weight="bold" font-size="11" fill="#3b82f6">TS</text><text x="16" y="25" text-anchor="middle" font-family="monospace" font-size="7" fill="#93c5fd">typescript</text></svg>';
var _tsUrl = 'data:image/svg+xml,' + encodeURIComponent(_tsSvg);
platform.host.registerFileTypeIcon('.ts', _tsUrl);
platform.host.registerFileTypeIcon('.tsx', _tsUrl);

var _jsSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="2" y="1" width="28" height="30" rx="3" fill="#3d2e00"/><text x="16" y="14" text-anchor="middle" font-family="monospace" font-weight="bold" font-size="11" fill="#fbbf24">JS</text><text x="16" y="25" text-anchor="middle" font-family="monospace" font-size="7" fill="#fcd34d">javascript</text></svg>';
var _jsUrl = 'data:image/svg+xml,' + encodeURIComponent(_jsSvg);
platform.host.registerFileTypeIcon('.js', _jsUrl);
platform.host.registerFileTypeIcon('.jsx', _jsUrl);
platform.host.registerFileTypeIcon('.mjs', _jsUrl);

var _glslSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="2" y="1" width="28" height="30" rx="3" fill="#1a1040"/><text x="16" y="14" text-anchor="middle" font-family="monospace" font-weight="bold" font-size="9" fill="#a855f7">GLSL</text><text x="16" y="25" text-anchor="middle" font-family="monospace" font-size="7" fill="#c084fc">shader</text></svg>';
var _glslUrl = 'data:image/svg+xml,' + encodeURIComponent(_glslSvg);
platform.host.registerFileTypeIcon('.glsl', _glslUrl);
platform.host.registerFileTypeIcon('.vert', _glslUrl);
platform.host.registerFileTypeIcon('.frag', _glslUrl);
