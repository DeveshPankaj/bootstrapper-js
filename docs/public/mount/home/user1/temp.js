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

const App = (props) => {
  const openThisFile = () => {
    const cmd = `service('001-core.layout', 'open-window') (command('ui.notepad'), '/home/user1/temp.js')`
    window.platform.host.execCommand(cmd)
  }
  
  const changeHeaderStyles = (event) => {
    props.setHeaderStyles({backgroundColor: event.target.value})
  }
  return (
    <>
        <h3>This Is Babel and React's magic!</h3>
        <Counter />
        <p>Edit <span style={{color: 'blue', cursor: 'pointer'}} onClick={openThisFile}>'/home/user1/temp1.js'</span> and save to see the changes</p>
        <input type="color" onChange={changeHeaderStyles} />
    </>
  )
    // return React.createElement('div', {}, ["Hello World"])
}
exports.App = App
// root.render(App())
