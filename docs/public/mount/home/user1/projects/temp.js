const React = window.platform.getService('React')
const ReactDOM = window.platform.getService('ReactDOM')

exports.React = React
exports.ReactDOM = ReactDOM

// const el = document.createElement('div')
// const root = ReactDOM.createRoot(el)
// platform.window.document.body.appendChild(el)

const Counter = () => {
   const [counter, setCounter] = React.useState(0)
   return (
     <button className="counter-btn" onClick={_ => setCounter(state => state + 1)}>
       <span aria-hidden="true">⚡</span>
       Clicked {counter} time{counter === 1 ? '' : 's'}
     </button>
   )
}

const ColorField = ({ label, value, onChange }) => (
  <label style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', fontSize: '.85rem', fontWeight: 500, color: '#4b4766'}}>
    {label}
    <input className="swatch-input" type="color" value={value} onChange={onChange} />
  </label>
)

const Footer = (props) => {
  const changeHeaderBackgroundColor = (event) => {
    props.setHeaderStyles({
      backgroundColor: event.target.value
    })
  }
  const changeHeaderColor = (event) => {
    props.setHeaderStyles({
      color: event.target.value
    })
  }
  return (
    <section style={{
      display: 'flex', flexDirection: 'column', gap: '.65rem',
      width: '100%', boxSizing: 'border-box',
      marginTop: '1.75rem', padding: '1.1rem 1.25rem',
      background: '#faf9ff', border: '1px solid #ece9fb', borderRadius: '12px',
    }}>
      <div style={{fontSize: '.7rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#8b85b8'}}>
        Customize the header
      </div>
      <ColorField label="Background" value={props.headerStyles.backgroundColor} onChange={changeHeaderBackgroundColor} />
      <ColorField label="Text" value={props.headerStyles.color} onChange={changeHeaderColor} />
    </section>
  )
}

const App = (props) => {
  // Owns the live header style itself (seeded from any `headerStyles` passed
  // in via props) so the color pickers below actually do something when this
  // file is opened on its own — previously Footer called
  // props.setHeaderStyles(...) but nothing ever consumed it, so the controls
  // silently did nothing. Still forwards every patch to props.setHeaderStyles
  // when a caller supplies one, so an embedding window can also react to it.
  const [headerStyles, setHeaderStylesState] = React.useState(() => ({
    backgroundColor: '#eef0ff', color: '#312e81', ...props.headerStyles,
  }))
  const setHeaderStyles = (patch) => {
    setHeaderStylesState(prev => ({ ...prev, ...patch }))
    if (props.setHeaderStyles) props.setHeaderStyles(patch)
  }

  const openThisFile = () => {
    const cmd = `service('001-core.layout', 'open-window') (command('ui.notepad'), '/home/user1/projects/temp.js')`
    window.platform.host.execCommand(cmd, window.platform)
  }

  return (
    <div style={{
      width: '100%', maxWidth: '420px', background: '#fff',
      border: '1px solid #e7e5f3', borderRadius: '20px',
      boxShadow: '0 1px 2px rgba(30,27,46,.04), 0 24px 48px -12px rgba(49,46,129,.18)',
      padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'stretch',
    }}>
      <div style={{fontSize: '.7rem', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6366f1', marginBottom: '.5rem'}}>
        Live React Playground
      </div>

      <h3 style={{
        margin: 0, padding: '.85rem 1rem', borderRadius: '12px',
        fontSize: '1.1rem', fontWeight: 650, textAlign: 'center',
        transition: 'background-color .2s ease, color .2s ease',
        ...headerStyles,
      }}>
        This is Babel and React's magic! ✨
      </h3>

      <div style={{display: 'flex', justifyContent: 'center', margin: '1.4rem 0 .9rem'}}>
        <Counter />
      </div>

      <p style={{margin: 0, fontSize: '.85rem', lineHeight: 1.6, color: '#6b7280', textAlign: 'center'}}>
        Edit <span className="edit-link" onClick={openThisFile}>temp.js</span> and save to see the changes live.
      </p>

      <Footer headerStyles={headerStyles} setHeaderStyles={setHeaderStyles} />
    </div>
  )
}
exports.App = App
// root.render(App())
