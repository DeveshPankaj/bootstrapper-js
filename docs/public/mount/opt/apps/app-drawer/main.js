const React    = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')
const { useState, useEffect, useRef } = React

// ── Persistence ─────────────────────────────────────────────────────────────
const PINNED_KEY  = 'app_drawer_pinned'
const RECENT_KEY  = 'app_drawer_recent'
const DEFAULT_PIN = ['explorer','ui.notepad','ui.vs-code','webamp','ui.task-manager','ui.dashboard']

const getPinned = () => { try { return JSON.parse(localStorage.getItem(PINNED_KEY) || JSON.stringify(DEFAULT_PIN)) } catch { return DEFAULT_PIN } }
const savePinned = v => localStorage.setItem(PINNED_KEY, JSON.stringify(v))
const getRecent  = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] } }
const addRecent  = name => {
  const r = getRecent().filter(n => n !== name); r.unshift(name)
  localStorage.setItem(RECENT_KEY, JSON.stringify(r.slice(0, 10)))
}

// ── Build app list purely from registered commands ───────────────────────────
function mergeCommands(dynamicCmds) {
  const seen = new Set()
  return (dynamicCmds || [])
    .filter(cmd => {
      if (!cmd.meta?.title || !cmd.meta?.icon) return false
      if (cmd.meta?.callable === false) return false  // internal/fallback registrations
      if (seen.has(cmd.name)) return false             // deduplicate by name (latest wins)
      seen.add(cmd.name)
      return true
    })
    .map(cmd => ({ name: cmd.name, title: cmd.meta.title, icon: cmd.meta.icon, cat: cmd.meta.category || 'Other' }))
    .sort((a, b) => a.title.localeCompare(b.title))
}

// ── One-time CSS injection ───────────────────────────────────────────────────
function injectCSS() {
  if (document.getElementById('__ad-css__')) return
  const s = document.createElement('style'); s.id = '__ad-css__'
  s.textContent = `
    @keyframes __ad-in__ { from{opacity:0;transform:scale(.98)} to{opacity:1;transform:scale(1)} }
    #__app-drawer-root__{ animation:__ad-in__ .16s ease; }
    .ad-card:hover .ad-ico{ background:rgba(255,255,255,.16)!important; transform:scale(1.07); }
    .ad-card:active .ad-ico{ transform:scale(.94); }
    .ad-ico{ transition:background .11s,transform .11s; }
    .ad-search{ outline:none; }
    .ad-search:focus{ border-color:rgba(255,255,255,.55)!important; box-shadow:0 0 0 3px rgba(137,180,250,.25)!important; }
    .ad-cat:hover{ background:rgba(255,255,255,.1)!important; }
  `
  document.head.appendChild(s)
}

// ── "Open with file" modal ───────────────────────────────────────────────────
function OpenWithModal({ cmd, onClose }) {
  const [path, setPath] = useState('')
  const inputRef = useRef(null)
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50) }, [])

  const confirm = () => {
    const p = path.trim()
    if (!p) return
    onClose()
    try {
      // Use execCommand so the window manager passes body+props correctly
      platform.host.execCommand(
        `service('001-core.layout', 'open-window') (command('${cmd.name}'), '${p.replace(/'/g, "\\'")}')`,
        platform
      )
    } catch(e) {
      try { platform.host.callCommand('notify', { title:'Open error', body:String(e.message||e), duration:3000 }) } catch(_){}
    }
  }

  return React.createElement('div', {
    style:{ position:'fixed', inset:0, zIndex:100001, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.55)', backdropFilter:'blur(4px)' },
    onMouseDown: e => { if (e.target === e.currentTarget) onClose() }
  },
    React.createElement('div', { style:{ background:'#1e1f2e', border:'1px solid rgba(255,255,255,.12)', borderRadius:14, padding:24, width:440, display:'flex', flexDirection:'column', gap:14 } },
      React.createElement('div', { style:{ fontSize:13, fontWeight:700, color:'#fff', display:'flex', alignItems:'center', gap:8 } },
        React.createElement('span', { className:'material-symbols-outlined', style:{ fontSize:18, opacity:.7 } }, cmd.icon),
        `Open with ${cmd.title}`
      ),
      React.createElement('div', { style:{ fontSize:11, color:'rgba(255,255,255,.4)' } }, 'Enter a VFS file path to open with this app:'),
      React.createElement('input', {
        ref: inputRef,
        value: path,
        onChange: e => setPath(e.target.value),
        onKeyDown: e => { if (e.key==='Enter') confirm(); if (e.key==='Escape') onClose() },
        placeholder: '/home/user1/data.csv',
        style:{ padding:'9px 12px', background:'rgba(255,255,255,.08)', border:'1.5px solid rgba(255,255,255,.18)', borderRadius:8, color:'#fff', fontSize:13, outline:'none', width:'100%', boxSizing:'border-box' }
      }),
      React.createElement('div', { style:{ display:'flex', gap:8, justifyContent:'flex-end' } },
        React.createElement('button', { onClick:onClose, style:{ padding:'6px 16px', borderRadius:8, border:'1px solid rgba(255,255,255,.15)', background:'transparent', color:'rgba(255,255,255,.6)', cursor:'pointer', fontSize:12 } }, 'Cancel'),
        React.createElement('button', { onClick:confirm, disabled:!path.trim(), style:{ padding:'6px 16px', borderRadius:8, border:'none', background: path.trim() ? '#89b4fa' : '#444', color: path.trim() ? '#000':'#888', cursor: path.trim() ? 'pointer':'not-allowed', fontSize:12, fontWeight:600 } }, 'Open')
      )
    )
  )
}

// ── Overlay singleton ────────────────────────────────────────────────────────
let _el = null, _root = null

function closeDrawer() {
  if (!_el) return
  try { _root?.unmount() } catch(_) {}
  _el.remove(); _el = null; _root = null
}

function openDrawer() {
  if (_el) { closeDrawer(); return }   // toggle
  injectCSS()

  const el = document.createElement('div')
  el.id = '__app-drawer-root__'
  el.style.cssText = [
    'position:fixed','inset:0','z-index:99999',
    'background:rgba(8,8,18,.82)',
    'backdrop-filter:blur(22px) saturate(.7)',
    '-webkit-backdrop-filter:blur(22px) saturate(.7)',
    'display:flex','flex-direction:column','align-items:center',
    'justify-content:flex-start','padding-top:64px',
    'overflow-y:auto','box-sizing:border-box',
    'font-family:system-ui,\'-apple-system\',\'Segoe UI\',sans-serif',
  ].join(';')

  // Close on backdrop click (not on content)
  el.addEventListener('mousedown', e => { if (e.target === el) closeDrawer() })
  document.body.appendChild(el)
  _el = el
  _root = ReactDOM.createRoot(el)
  _root.render(React.createElement(AppDrawer, { onClose: closeDrawer }))
}

// ── App icon card ────────────────────────────────────────────────────────────
function AppCard({ cmd, size, onLaunch, onContext }) {
  const big = size !== 'sm'
  const [hov, setHov] = useState(false)
  return React.createElement('div', {
    className: 'ad-card',
    style: { display:'flex', flexDirection:'column', alignItems:'center', gap: big?7:5, padding: big?'14px 8px 10px':'9px 6px 7px', borderRadius:14, cursor:'pointer', color:'#fff', minWidth:big?86:70, textAlign:'center', userSelect:'none' },
    onClick: () => onLaunch(cmd.name),
    onContextMenu: e => { e.preventDefault(); onContext && onContext(e, cmd) },
    title: cmd.title,
    onMouseEnter: () => setHov(true),
    onMouseLeave: () => setHov(false),
  },
    React.createElement('div', {
      className: 'ad-ico',
      style: { width:big?58:44, height:big?58:44, borderRadius:16, display:'flex', alignItems:'center', justifyContent:'center',
               background: hov ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.08)' }
    },
      React.createElement('span', { className:'material-symbols-outlined', style:{ fontSize:big?30:22, color:'#fff', opacity:.92 } }, cmd.icon)
    ),
    React.createElement('span', {
      style: { fontSize:big?11.5:10.5, fontWeight:500, lineHeight:1.3, maxWidth:big?78:64, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', width:'100%', color:'rgba(255,255,255,.88)' }
    }, cmd.title)
  )
}

// ── Main component ───────────────────────────────────────────────────────────
function AppDrawer({ onClose }) {
  const [cmds,     setCmds]     = useState(() => { try { return mergeCommands(platform.host.commands$.getValue()) } catch(_) { return [] } })
  const [filter,   setFilter]   = useState('')
  const [pinned,   setPinned]   = useState(getPinned)
  const [activeCat,setCat]      = useState('all')
  const [ctx,      setCtx]      = useState(null)   // {cmd, x, y}
  const [openWith, setOpenWith] = useState(null)   // cmd for "open with" modal
  const inputRef = useRef(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 60)
    const onKey = e => {
      if (e.key === 'Escape') {
        if (openWith) { setOpenWith(null); return }
        if (ctx)      { setCtx(null); return }
        filter ? setFilter('') : onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    const onClickOutside = () => setCtx(null)
    document.addEventListener('click', onClickOutside)
    let sub
    try {
      sub = platform.host.commands$.subscribe(dynamic => setCmds(mergeCommands(dynamic)))
    } catch(_) {}
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onClickOutside)
      try { sub?.unsubscribe() } catch(_) {}
    }
  }, [])

  const launch = name => {
    addRecent(name); onClose()
    setTimeout(() => {
      try { platform.host.callCommand(name) }
      catch(e) { try { platform.host.callCommand('notify',{title:'Error',body:String(e.message||e),duration:3000}) } catch(_){} }
    }, 120)
  }

  const togglePin = name => {
    const next = pinned.includes(name) ? pinned.filter(n=>n!==name) : [...pinned, name]
    setPinned(next); savePinned(next)
  }

  const categories = ['all', ...new Set(cmds.map(c=>c.cat))]
  const filtered = filter
    ? cmds.filter(c => c.title.toLowerCase().includes(filter.toLowerCase()))
    : activeCat === 'all' ? cmds : cmds.filter(c => c.cat === activeCat)

  const pinnedCmds = pinned.map(n=>cmds.find(c=>c.name===n)).filter(Boolean)
  const recentCmds = getRecent().map(n=>cmds.find(c=>c.name===n)).filter(Boolean).slice(0,8)
  const showSections = !filter && activeCat === 'all'

  // ── Render ─────────────────────────────────────────────────────────────────
  const wrap = { width:'100%', maxWidth:780, display:'flex', flexDirection:'column', alignItems:'center', gap:22, paddingBottom:40 }

  const secHdr = txt => React.createElement('div', {
    style:{ fontSize:10, fontWeight:700, letterSpacing:1.4, textTransform:'uppercase', color:'rgba(255,255,255,.38)', marginBottom:10, width:'100%' }
  }, txt)

  return React.createElement('div', { style:wrap },

    // Search bar
    React.createElement('div', { style:{ width:'100%', maxWidth:460, position:'relative' } },
      React.createElement('span', { className:'material-symbols-outlined', style:{ position:'absolute', left:16, top:'50%', transform:'translateY(-50%)', fontSize:19, color:'rgba(255,255,255,.4)', pointerEvents:'none' } }, 'search'),
      React.createElement('input', {
        ref: inputRef,
        className: 'ad-search',
        style:{ width:'100%', padding:'12px 42px 12px 48px', background:'rgba(255,255,255,.12)', border:'1.5px solid rgba(255,255,255,.2)', borderRadius:14, color:'#fff', fontSize:15, boxSizing:'border-box', backdropFilter:'blur(4px)' },
        placeholder: 'Search applications…',
        value: filter,
        onChange: e => { setFilter(e.target.value); setCat('all') },
        onKeyDown: e => { if (e.key==='Enter' && filtered.length===1) launch(filtered[0].name) }
      }),
      filter && React.createElement('span', {
        className:'material-symbols-outlined',
        style:{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', fontSize:17, color:'rgba(255,255,255,.4)', cursor:'pointer' },
        onClick: () => setFilter('')
      }, 'close')
    ),

    // Category pills
    !filter && React.createElement('div', { style:{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'center' } },
      categories.map(cat =>
        React.createElement('button', {
          key:cat, className:'ad-cat',
          onClick:()=>setCat(cat),
          style:{ padding:'4px 14px', borderRadius:20, border:'1px solid rgba(255,255,255,.15)', background: activeCat===cat ? 'rgba(137,180,250,.85)' : 'rgba(255,255,255,.07)', color: activeCat===cat ? '#000' : 'rgba(255,255,255,.75)', cursor:'pointer', fontSize:11.5, fontWeight: activeCat===cat ? 700:400 }
        }, cat === 'all' ? 'All Apps' : cat)
      )
    ),

    // Pinned
    showSections && pinnedCmds.length > 0 && React.createElement('div', { style:{ width:'100%' } },
      secHdr('Pinned'),
      React.createElement('div', { style:{ display:'flex', gap:6, flexWrap:'wrap' } },
        pinnedCmds.map(cmd => React.createElement(AppCard, { key:cmd.name, cmd, size:'sm', onLaunch:launch, onContext:(e,c)=>setCtx({cmd:c,x:e.clientX,y:e.clientY}) }))
      )
    ),

    // Divider
    showSections && React.createElement('div', { style:{ width:'100%', height:1, background:'rgba(255,255,255,.09)' } }),

    // Frequent
    showSections && recentCmds.length > 0 && React.createElement('div', { style:{ width:'100%' } },
      secHdr('Frequent'),
      React.createElement('div', { style:{ display:'flex', gap:6, flexWrap:'wrap' } },
        recentCmds.map(cmd => React.createElement(AppCard, { key:cmd.name, cmd, size:'sm', onLaunch:launch, onContext:(e,c)=>setCtx({cmd:c,x:e.clientX,y:e.clientY}) }))
      )
    ),

    // All / Filtered grid
    React.createElement('div', { style:{ width:'100%' } },
      showSections && secHdr('All Apps'),
      filter && React.createElement('div', { style:{ fontSize:10, fontWeight:700, letterSpacing:1.4, textTransform:'uppercase', color:'rgba(255,255,255,.35)', marginBottom:10 } }, `${filtered.length} result${filtered.length!==1?'s':''}`),
      filtered.length > 0
        ? React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(90px,1fr))', gap:4 } },
            filtered.map(cmd => React.createElement(AppCard, { key:cmd.name, cmd, size:'lg', onLaunch:launch, onContext:(e,c)=>setCtx({cmd:c,x:e.clientX,y:e.clientY}) }))
          )
        : React.createElement('div', { style:{ textAlign:'center', padding:'32px 0', color:'rgba(255,255,255,.28)' } },
            React.createElement('span', { className:'material-symbols-outlined', style:{ fontSize:42 } }, 'search_off'),
            React.createElement('p', { style:{ marginTop:8, fontSize:13 } }, `No results for "${filter}"`)
          )
    ),

    // Context menu
    ctx && React.createElement('div', {
      style:{ position:'fixed', top:Math.min(ctx.y, window.innerHeight-180), left:Math.min(ctx.x, window.innerWidth-200), background:'#1e1f2e', border:'1px solid rgba(255,255,255,.12)', borderRadius:10, boxShadow:'0 12px 36px rgba(0,0,0,.6)', zIndex:100001, minWidth:190, overflow:'hidden' },
      onClick: e => e.stopPropagation(),
      onMouseDown: e => e.stopPropagation(),
    },
      React.createElement('div', { style:{ padding:'8px 12px 5px', fontSize:10, fontWeight:700, opacity:.4, textTransform:'uppercase', letterSpacing:.8, color:'#fff' } }, ctx.cmd.title),
      React.createElement('div', { style:{ height:1, background:'rgba(255,255,255,.08)', margin:'3px 0' } }),
      ctxItem('open_in_new', 'Launch', () => { launch(ctx.cmd.name); setCtx(null) }),
      ctxItem('folder_open', 'Open with file…', () => { setOpenWith(ctx.cmd); setCtx(null) }),
      React.createElement('div', { style:{ height:1, background:'rgba(255,255,255,.08)', margin:'3px 0' } }),
      ctxItem(pinned.includes(ctx.cmd.name) ? 'push_pin':'keep', pinned.includes(ctx.cmd.name) ? 'Unpin':'Pin', () => { togglePin(ctx.cmd.name); setCtx(null) })
    ),

    // Open with modal
    openWith && React.createElement(OpenWithModal, { cmd:openWith, onClose:()=>setOpenWith(null) })
  )
}

function ctxItem(icon, label, onClick) {
  return React.createElement('div', {
    onClick,
    onMouseEnter: e => e.currentTarget.style.background='rgba(255,255,255,.08)',
    onMouseLeave: e => e.currentTarget.style.background='transparent',
    style:{ padding:'8px 13px', cursor:'pointer', fontSize:12.5, display:'flex', alignItems:'center', gap:9, color:'rgba(255,255,255,.82)' }
  },
    React.createElement('span', { className:'material-symbols-outlined', style:{ fontSize:15, opacity:.7 } }, icon),
    label
  )
}

// ── Register command (headless — no window, directly opens overlay) ──────────
platform.host.registerCommand('ui.app-drawer', openDrawer, {
  title: 'App Drawer',
  icon:  'grid_view',
  description: 'Browse and launch all apps',
})
