// Settings > About page. See /home/user1/settings.html for the shared
// `'settings'` service (registerSection / utils) this registers against.
const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')
const { utils } = platform.getService('settings')
const { origin } = utils

const About = () => {
  const [minionImgId, setMinionImgId] = React.useState(0)

  React.useEffect(() => {
    const interval = setInterval(() => {
      setMinionImgId(prevId => (prevId + 1) % 3);
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="settings-page">
      <h1 className="settings-page-title">About</h1>
      <div className="about-card">
        <img className="about-avatar" src={`${origin}/public/minion-${minionImgId}.png`} alt="avatar" />
        <div className="about-info">
          <h2 className="about-name">Pankaj Devesh</h2>
          <p className="about-role">Full-stack Developer &middot; Creator of this web OS</p>
        </div>
      </div>
      <div className="settings-group">
        <div className="settings-group-body" style={{padding: '1rem 1.25rem', display: 'block'}}>
          <p style={{margin: '0 0 0.75rem', lineHeight: 1.6, color: '#3a3a3c'}}>
            We are a passionate team dedicated to providing innovative solutions.
            Our focus is on delivering quality products and services that make a difference.
            Our mission is to enhance the lives of our users through technology.
          </p>
          <p style={{margin: 0, lineHeight: 1.6, color: '#3a3a3c'}}>
            With years of experience in the industry, we prioritize customer satisfaction
            and continuous improvement, ensuring that our offerings meet and exceed expectations.
          </p>
        </div>
      </div>
    </div>
  );
};

platform.getService('settings').registerSection('01-about', (container, api) => {
  const root = ReactDOM.createRoot(container)
  root.render(React.createElement(About))
  return () => setTimeout(() => root.unmount(), 0)
}, {
  title: 'About',
  icon: 'account_circle',
  color: '#8e8e93',
})
