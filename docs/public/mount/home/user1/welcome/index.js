const React = window.platform.getService('React')
const ReactDOM = window.platform.getService('ReactDOM')
window.React = React

const pre = [import('https://cdnjs.cloudflare.com/ajax/libs/styled-components/6.1.12/styled-components.min.js').then(mod => mod)]

const render = (container) => {
  const styled = window.styled;

  const Container = styled.div`
      background: rgb(0, 0, 0);
      height: 100%;
      display: flex;
  `
  const StyleSheetManager = styled.StyleSheetManager
  const root = ReactDOM.createRoot(container);

  root.render(
    <StyleSheetManager target={container.closest('html').querySelector('head')}>
       {/* <Container></Container> */}
      
<div className="bgimg w3-display-container w3-animate-opacity w3-text-white">
  <div className="w3-display-topleft w3-padding-large w3-xlarge">
    Logo
  </div>
  <div className="w3-display-middle">
    <h1 className="w3-jumbo w3-animate-top">COMING SOON</h1>
    <hr className="w3-border-grey"/>
    <p className="w3-large w3-center">35 days left</p>
  </div>
  <div className="w3-display-bottomleft w3-padding-large">

  </div>
</div>
    </StyleSheetManager>
  )
}


exports.default = Promise.all(pre).then(_ => render)