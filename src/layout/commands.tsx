import { Command, Platform } from '@shared/index'
import React from 'react'
import { map } from 'rxjs'


const platform = Platform.getInstance()

export const Commands = ({onCommandClick, vertical, align='start'}: {onCommandClick: (cmd: Command) => void, vertical?: boolean, align?: 'start'|'center'|'end'}) => {

    const [commands, setCommands] = React.useState<Array<Command>>([])
    const [expended, setExpended] = React.useState(localStorage.getItem('show_taskbar_title') === 'true')
    const defaultCommands = [
        'ui.file-explorer', 
        // 'ui.iframe',
        'ui.view-commands', 
        // 'ui.notepad',
        // 'ui.game',
        'ui.game-of-life',
        'ui.xml-parser',

    ]


    React.useEffect(() => {

        const subscription = platform.host.commands$
            .pipe(map(commands => defaultCommands.map(cmd => commands.find(command => command.name === cmd)!).filter(x => x)))
            .subscribe(_commands => setCommands(_commands))


        const {remove: removeToggleCommand} = platform.host.registerCommand('core.toggle-navbar', () => {
            setExpended(state => !state)
            localStorage.setItem('show_taskbar_title', expended ? 'false' : 'true')
        }, {callable: true})

        return () => {
            subscription.unsubscribe()
            removeToggleCommand()
        }

    }, [])


    return (
        <div style={{
            padding: '.5rem',
            display: 'flex',
            flexDirection:  vertical?'column':'row',
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
                            border: '1px solid',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '1rem'
                        }}
                        onClick={()=>onCommandClick(command)}
                        title={command.meta?.title as string || command.name}
                    >
                        {(command.meta as any)?.icon ? <span className="material-symbols-outlined" style={{cursor: 'pointer'}}>{(command.meta as any)?.icon}</span>: null}
                        {expended ? (command.meta?.title as string || command.name) : null}
                    </div>
                ))
            }
        </div>
    )
}

