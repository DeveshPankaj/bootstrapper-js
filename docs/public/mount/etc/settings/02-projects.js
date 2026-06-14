// Settings > Projects page. See /home/user1/settings.html for the shared
// `'settings'` service (registerSection / utils) this registers against.
const React = platform.getService('React')
const ReactDOM = platform.getService('ReactDOM')
const { utils } = platform.getService('settings')
const { fs, origin, getExt } = utils

const Projects = () => {
  const projectsDir = '/home/user1/projects'
  const [ls] = React.useState(() => fs.readdirSync(projectsDir).map(name => {
    const path = `${projectsDir}/${name}`
    let isDir = false
    try { isDir = fs.statSync(path).isDirectory() } catch (err) {}
    return { name, path, isDir, ext: getExt(name) }
  }))

  const projectIconMap = {
    '.html': '/public/html-icon.png',
    '.js': '/public/js-icon.png',
    '.ts': '/public/ts-icon.png',
    '': '/public/folder-icon.png',
  }

  const openProject = (file) => {
    const cmd = `service('root', 'exec') ('${projectsDir}/${file}');`
    platform.host.execCommand(cmd, platform);
  }

  return (
    <div className="settings-page">
      <h1 className="settings-page-title">Projects</h1>
      <div className="projects-grid">
        {ls.map(file => (
          <div key={file.path} className="project-card" onClick={() => openProject(file.name)}>
            <img className="project-icon" src={`${origin}${projectIconMap[file.isDir ? '' : file.ext] ?? '/public/invalid-file-icon.png'}`} alt="" />
            <span className="project-name">{file.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

platform.getService('settings').registerSection('02-projects', (container, api) => {
  const root = ReactDOM.createRoot(container)
  root.render(React.createElement(Projects))
  return () => setTimeout(() => root.unmount(), 0)
}, {
  title: 'Projects',
  icon: 'apps',
  color: '#5e5ce6',
})
