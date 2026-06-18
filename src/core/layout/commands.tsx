import { Command, Platform } from '@shared/index'
import React from 'react'
import ReactDOM from 'react-dom'
import { map } from 'rxjs'
import { windowsSubject, TaskbarWindowInfo, desktopsSubject, activeDesktopSubject, removeDesktop, switchDesktop } from '../window-manager'


const platform = Platform.getInstance()

export const Commands = ({ onCommandClick, vertical, align = 'start' }: { onCommandClick: (cmd: Command) => void, vertical?: boolean, align?: 'start' | 'center' | 'end' }) => {

    const [commands, setCommands] = React.useState<Array<Command>>([])
    const [expended, setExpended] = React.useState(localStorage.getItem('show_taskbar_title') === 'true')
    const defaultCommands = [
        'explorer',
        // 'ui.file-explorer',
        // 'ui.iframe',
        'ui.vs-code',
        // 'ui.view-commands',
        'ui.notepad',
        // 'ui.game',
        // 'ui.game-of-life',
        // 'ui.xml-parser',
        'webamp',
        'ui.task-manager',
    ]


    React.useEffect(() => {

        const subscription = platform.host.commands$
            .pipe(map(commands => defaultCommands.map(cmd => commands.find(command => command.name === cmd)!).filter(x => x)))
            .subscribe(_commands => setCommands(_commands))

        // platform.host.commands$.subscribe(_commands => console.log(_commands))


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
    platform.host.execCommand(`service('root', 'exec') ('/home/user1/settings.html');`, platform)
}

// Desktop ("Space") switcher: one pill per desktop (click to switch,
// right-click for a "Delete desktop" menu). New desktops are added via the
// desktop background's right-click context menu ("Add Desktop").
const DesktopSwitcher = () => {
    const [desktops, setDesktops] = React.useState(desktopsSubject.getValue())
    const [active, setActive] = React.useState(activeDesktopSubject.getValue())
    const [menu, setMenu] = React.useState<{ id: string, x: number, y: number } | null>(null)

    React.useEffect(() => {
        const sub1 = desktopsSubject.subscribe(setDesktops)
        const sub2 = activeDesktopSubject.subscribe(setActive)
        return () => {
            sub1.unsubscribe()
            sub2.unsubscribe()
        }
    }, [])

    React.useEffect(() => {
        if (!menu) return
        const close = () => setMenu(null)
        document.addEventListener('click', close)
        return () => document.removeEventListener('click', close)
    }, [menu])

    return (
        <div className="desktop-switcher">
            {desktops.map((d, idx) => (
                <div
                    key={d.id}
                    className={`desktop-pill${d.id === active ? ' active' : ''}`}
                    title={d.name}
                    onClick={() => switchDesktop(d.id)}
                    onContextMenu={ev => { ev.preventDefault(); setMenu({ id: d.id, x: ev.clientX, y: ev.clientY }) }}
                >
                    {idx + 1}
                </div>
            ))}
            {menu ? ReactDOM.createPortal(
                <div className="desktop-context-menu" style={{ top: menu.y, left: menu.x }}>
                    <button disabled={desktops.length <= 1} onClick={() => { removeDesktop(menu.id); setMenu(null) }}>Delete desktop</button>
                </div>,
                document.body
            ) : null}
        </div>
    )
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
    const [activeDesktop, setActiveDesktop] = React.useState(activeDesktopSubject.getValue())

    React.useEffect(() => {
        const subscription = windowsSubject.subscribe(setWindows)
        const desktopSub = activeDesktopSubject.subscribe(setActiveDesktop)
        return () => {
            subscription.unsubscribe()
            desktopSub.unsubscribe()
        }
    }, [])

    const visibleWindows = windows.filter(win => win.desktopId === activeDesktop)

    return (
        <div className="taskbar">
            <Commands onCommandClick={onCommandClick} vertical={vertical} align={align} />
            {visibleWindows.length ? <div className="taskbar-divider" /> : null}
            {visibleWindows.map(win => <TaskbarWindowIcon key={win.pid} win={win} />)}
            <div className="taskbar-spacer" />
            <DesktopSwitcher />
            <div className="taskbar-icon-button taskbar-settings" aria-label="open-settings" title="Settings" onClick={openSettings}>
                <span className="material-symbols-outlined">settings</span>
            </div>
        </div>
    )
}

