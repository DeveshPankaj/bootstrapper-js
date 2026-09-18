const platform = window.platform;

platform.host.registerCommand('ui.cpp-ide', function(body, props) {
  if (!body) {
    platform.host.execCommand(
      "service('001-core.layout', 'open-window') (command('ui.cpp-ide'))",
      platform
    );
    return;
  }

  var iframe = document.createElement('iframe');
  iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;background:#0d1117;';

  if (props && typeof props.sandboxAppIframe === 'function') {
    props.sandboxAppIframe(iframe);
  }

  iframe.src = '/(sw)/opt/apps/cpp-ide/main.html';
  body.appendChild(iframe);

  if (props && typeof props.setTitle === 'function') {
    props.setTitle('C++ IDE');
  }
  if (props && typeof props.setWindowView === 'function') {
    props.setWindowView(true);
  }
});

var _cppSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="2" y="1" width="28" height="30" rx="3" fill="#1e3a5f"/><text x="16" y="14" text-anchor="middle" font-family="monospace" font-weight="bold" font-size="9" fill="#60a5fa">C++</text><text x="16" y="25" text-anchor="middle" font-family="monospace" font-size="7" fill="#93c5fd">source</text></svg>';
var _cppUrl = 'data:image/svg+xml,' + encodeURIComponent(_cppSvg);
platform.host.registerFileTypeIcon('.cpp', _cppUrl);
platform.host.registerFileTypeIcon('.cxx', _cppUrl);
platform.host.registerFileTypeIcon('.cc', _cppUrl);
platform.host.registerFileTypeIcon('.c', _cppUrl);

var _hSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="2" y="1" width="28" height="30" rx="3" fill="#2d1b69"/><text x="16" y="14" text-anchor="middle" font-family="monospace" font-weight="bold" font-size="11" fill="#a78bfa">.hpp</text><text x="16" y="25" text-anchor="middle" font-family="monospace" font-size="7" fill="#c4b5fd">header</text></svg>';
var _hUrl = 'data:image/svg+xml,' + encodeURIComponent(_hSvg);
platform.host.registerFileTypeIcon('.h', _hUrl);
platform.host.registerFileTypeIcon('.hpp', _hUrl);
platform.host.registerFileTypeIcon('.hxx', _hUrl);
