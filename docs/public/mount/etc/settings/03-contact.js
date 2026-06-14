// Settings > Contact page. See /home/user1/settings.html for the shared
// `'settings'` service (registerSection / utils) this registers against.
const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')
const { utils } = platform.getService('settings')
const { contactInfo } = utils

const Contact = () => {
  const [copied, setCopied] = React.useState(false)

  const copyEmail = () => {
    platform.window.navigator.clipboard?.writeText(contactInfo.email || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const links = [
    { key: 'email', label: 'Email', value: contactInfo.email, href: contactInfo.email ? `mailto:${contactInfo.email}` : null, icon: 'mail', color: '#34c759', action: contactInfo.email ? { label: copied ? 'Copied!' : 'Copy', onClick: copyEmail } : null },
    { key: 'github', label: 'GitHub', value: contactInfo.github, href: contactInfo.github, icon: 'code', color: '#1f2328' },
    { key: 'linkedin', label: 'LinkedIn', value: contactInfo.linkedin, href: contactInfo.linkedin, icon: 'work', color: '#0a66c2' },
    { key: 'website', label: 'Website', value: contactInfo.website, href: contactInfo.website, icon: 'language', color: '#0a84ff' },
  ].filter(link => link.value)

  return (
    <div className="settings-page">
      <h1 className="settings-page-title">Contact</h1>
      <div className="settings-group">
        <div className="settings-group-body">
          {links.length === 0 && (
            <div className="settings-row">
              <span className="settings-row-label">No contact info set yet.</span>
            </div>
          )}
          {links.map(link => (
            <div key={link.key} className="settings-row">
              <span className="settings-row-icon material-symbols-outlined" style={{background: link.color}}>{link.icon}</span>
              <div className="settings-row-text">
                <div className="settings-row-title">{link.label}</div>
                {link.href ? (
                  <a className="settings-row-subtitle" href={link.href} target="_blank" rel="noreferrer">{link.value}</a>
                ) : (
                  <div className="settings-row-subtitle">{link.value}</div>
                )}
              </div>
              {link.action && (
                <button className="settings-btn" onClick={link.action.onClick}>{link.action.label}</button>
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="settings-hint">
        Edit the <code>contact</code> object in <code>/user-preferences.json</code> to add or change email, GitHub and website links.
      </p>
    </div>
  )
}

platform.getService('settings').registerSection('03-contact', (container, api) => {
  const root = ReactDOM.createRoot(container)
  root.render(React.createElement(Contact))
  return () => setTimeout(() => root.unmount(), 0)
}, {
  title: 'Contact',
  icon: 'mail',
  color: '#34c759',
})
