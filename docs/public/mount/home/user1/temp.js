const React = window.platform.getService('React')
const ReactDOM = window.platform.getService('ReactDOM')

exports.React = React
exports.ReactDOM = ReactDOM



// const el = document.createElement('div')
// const root = ReactDOM.createRoot(el)
// platform.window.document.body.appendChild(el)

const App = () => {
    return React.createElement('div', {}, ["Hello World"])
}
exports.App = App
// root.render(App())
