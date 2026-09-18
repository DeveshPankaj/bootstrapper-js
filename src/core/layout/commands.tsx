import { Command, Platform } from '@shared/index'
import React from 'react'
import { map } from 'rxjs'
import { windowsSubject, TaskbarWindowInfo } from '../window-manager'


const platform = Platform.getInstance()

export const Commands = ({ onCommandClick, vertical, align = 'start' }: { onCommandClick: (cmd: Command) => void, vertical?: boolean, align?: 'start' | 'center' | 'end' }) => {

    const [commands, setCommands] = React.useState<Array<Command>>([])
    const [expended, setExpended] = React.useState(localStorage.getItem('show_taskbar_title') === 'true')

    const readPinnedCommands = (): string[] => {
        try {
            const fs = platform.host.getFS()
            if (fs.existsSync('/etc/taskbar.json')) {
                const cfg = JSON.parse(fs.readFileSync('/etc/taskbar.json', 'utf-8') as string)
                if (Array.isArray(cfg.pinned) && cfg.pinned.length) return cfg.pinned
            }
        } catch (_) {}
        return ['ui.app-drawer', 'explorer', 'ui.notepad', 'ui.terminal', 'ui.pkg-manager', 'ui.settings']
    }

    React.useEffect(() => {
        const defaultCommands = readPinnedCommands()

        const subscription = platform.host.commands$
            .pipe(map(commands => defaultCommands.map(cmd => commands.find(command => command.name === cmd)!).filter(x => x)))
            .subscribe(_commands => setCommands(_commands))

        const { remove: removeToggleCommand } = platform.host.registerCommand('core.toggle-navbar', () => {
            setExpended(state => !state)
            localStorage.setItem('show_taskbar_title', expended ? 'false' : 'true')
        }, { callable: true })

        return () => {
            subscription.unsubscribe()
            removeToggleCommand()
        }

    }, [])

    return (
        <div style={{
            padding: '.5rem',
            display: 'flex',
            flexDirection: vertical ? 'column' : 'row',
            gap: '0.3rem',
            height: '100%',
            // background: '#292a2d',
            color: 'white',
            justifyContent: align,
        }}>
            {
                commands.map((command, idx) => (
                    <div key={`[${idx}]${command.name}`}
                        aria-label={command.name}
                        style={{
                            cursor: 'pointer',
                            padding: '0.5rem',
                            // border: '1px solid',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '1rem'
                        }}
                        onClick={() => onCommandClick(command)}
                        title={command.meta?.title as string || command.name}
                    >
                        {(command.meta as any)?.icon ? <span className="material-symbols-outlined" style={{ cursor: 'pointer' }}>{(command.meta as any)?.icon}</span> : null}
                        {expended ? (command.meta?.title as string || command.name) : null}
                    </div>
                ))
            }
        </div>
    )
}

const openSettings = () => {
    platform.host.callCommand('ui.settings')
}

const TaskbarWindowIcon = ({ win }: { win: TaskbarWindowInfo }) => (
    <div
        className={`taskbar-icon-button taskbar-window-icon${win.active ? ' active' : ''}${win.minimized ? ' minimized' : ''}`}
        aria-label={`window-${win.pid}`}
        title={win.title}
        onClick={win.toggle}
    >
        <span className="material-symbols-outlined">{win.icon || 'window'}</span>
        <div className="taskbar-preview">
            <span>{win.title}</span>
        </div>
    </div>
)

// Windows-11-style taskbar: pinned app launchers (Commands), one icon per
// currently running window (from windowsSubject, with a hover preview of its
// title), and a settings icon that's the same across all taskbar placements
// (header/footer/left-nav/right-nav/floating toolbar).
export const Taskbar = ({ onCommandClick, vertical, align = 'start' }: { onCommandClick: (cmd: Command) => void, vertical?: boolean, align?: 'start' | 'center' | 'end' }) => {
    const [windows, setWindows] = React.useState<Array<TaskbarWindowInfo>>(windowsSubject.getValue())

    React.useEffect(() => {
        const subscription = windowsSubject.subscribe(setWindows)
        return () => subscription.unsubscribe()
    }, [])

    return (
        <div className="taskbar" role="toolbar" aria-label="Taskbar">
            <Commands onCommandClick={onCommandClick} vertical={vertical} align={align} />
            {windows.length ? <div className="taskbar-divider" /> : null}
            {windows.map(win => <TaskbarWindowIcon key={win.pid} win={win} />)}
            <div className="taskbar-spacer" />
            <div className="taskbar-icon-button" aria-label="open-app-drawer" title="App Drawer" onClick={() => platform.host.callCommand('ui.app-drawer')}>
                <span className="material-symbols-outlined">grid_view</span>
            </div>
            <div className="taskbar-icon-button" aria-label="open-pkg-manager" title="App Manager" onClick={() => {
                const cmd = platform.host.getCommand('ui.pkg-manager')
                if (cmd) onCommandClick(cmd)
            }}>
                <span className="material-symbols-outlined">package_2</span>
            </div>
            <div className="taskbar-icon-button taskbar-settings" aria-label="open-settings" title="Settings" onClick={openSettings}>
                <span className="material-symbols-outlined">settings</span>
            </div>
        </div>
    )
}

