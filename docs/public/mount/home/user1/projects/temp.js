const React = window.platform.getService('React')
const ReactDOM = window.platform.getService('ReactDOM')

exports.React = React
exports.ReactDOM = ReactDOM

// const el = document.createElement('div')
// const root = ReactDOM.createRoot(el)
// platform.window.document.body.appendChild(el)

const Counter = () => {
   const [counter, setCounter] = React.useState(0)
   return <button onClick={_ => setCounter(state => state+1)}>Clicked {counter} times</button>
}
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
    <section style={{display: 'flex', flexDirection: 'column', padding: '1rem', gap:'.4rem', marginTop: 'auto', width: '100%', boxSizing: 'border-box', background: 'antiquewhite'}}>
      <label>
        Header Background 
        <input style={{float: 'right'}} type="color" defaultValue="#ffffff" onChange={changeHeaderBackgroundColor} />
      </label>
      <label>
        Header Text 
        <input style={{float: 'right'}} type="color" defaultValue="#000" onChange={changeHeaderColor} />
      </label>
    </section>  
  )
}

const App = (props) => {
  const openThisFile = () => {
    const cmd = `service('001-core.layout', 'open-window') (command('ui.notepad'), '/home/user1/projects/temp.js')`
    window.platform.host.execCommand(cmd, window.platform)
  }
  return (
    <>
      <h3>This Is Babel and React's magic!</h3>
      <Counter />
      <p>Edit <span style={{color: 'blue', cursor: 'pointer'}} onClick={openThisFile}>'/home/user1/projects/temp1.js'</span> and save to see the changes</p>
      <Footer {...props} />
    </>
  )
    // return React.createElement('div', {}, ["Hello World"])
}
exports.App = App
// root.render(App())
