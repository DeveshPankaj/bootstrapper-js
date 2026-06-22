
const platform = window.platform;
const React = platform.getService("React");

const closeContextMenu = (fromEl) => {
  let node = fromEl;
  while (node && node !== document.body) {
    if (node.classList && node.classList.contains('contextmenu')) {
      node.style.display = 'none';
      return;
    }
    node = node.parentElement;
  }
};

exports.default = ({item, onClick}) => {
  if (item.type === 'divider') {
    return <hr style={{ margin: '4px 10px', border: 'none', borderTop: '1px solid rgba(127,127,127,0.2)', flexShrink: 0 }} />;
  }
  if (item.type === 'group' && item.children && item.children.length) {
    return <>
      <div style={{ padding: '4px 14px 2px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.45, userSelect: 'none', pointerEvents: 'none', flexShrink: 0 }}>
        {item.title}
      </div>
      {item.children.map(child =>
        <button key={child.id} className="ctx-child-btn" onClick={ev => {
          closeContextMenu(ev.currentTarget);
          if (child.cmd) platform.host.execCommand(child.cmd, platform);
        }}>
          {child.title}
        </button>
      )}
    </>
  }
  return <button key={item.id} onClick={ev => onClick(ev)}>{item.title}</button>;
}

exports.getStyles = (containerId, items) => {
  return `
    #${containerId} {
      overflow: hidden;
      padding: 6px 0;
    }

    #${containerId} > button,
    #${containerId} .ctx-child-btn {
      cursor: pointer;
      text-align: start;
      display: block;
      width: 15rem;
      height: 2.8rem;
      border: none;
      background: transparent;
      border-radius: 8px;
      padding: 0 14px;
      font-size: 13px;
    }

    .ctx-child-btn {
      padding-left: 26px !important;
      height: 2.5rem !important;
      opacity: 0.9;
    }

    #${containerId} > button:hover,
    #${containerId} .ctx-child-btn:hover {
      background: rgba(0,0,0,0.85);
      color: white;
    }
  `
}
