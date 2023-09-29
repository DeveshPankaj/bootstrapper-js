import { Command, Platform } from '@shared/index'
import React from 'react'
import { map } from 'rxjs'

const platform = Platform.getInstance()


export const Commands = ({onCommandClick}: {onCommandClick: (cmd: Command) => void}) => {

    const [commands, setCommands] = React.useState<Array<Command>>([])
    const [expended, setExpended] = React.useState(false)

    const onClick = () => {
        console.log("clicked")
    }

    React.useEffect(() => {

        const subscription = platform.host.commands$
            .pipe(map(commands => commands.filter(command => command.name.startsWith('ui'))))
            .subscribe(_commands => setCommands(_commands))


        const {remove: removeToggleCommand} = platform.host.registerCommand('core.toggle-navbar', () => {
            setExpended(state => !state)
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
            flexDirection: 'column',
            gap: '0.3rem',
            height: '100%',
            background: '#292a2d',
            color: '#919191',
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
                    >
                        {(command.meta as any)?.icon ? <span className="material-symbols-outlined" style={{cursor: 'pointer'}} onClick={onClick}>{(command.meta as any)?.icon}</span>: null}
                        {expended ? command.name : null}
                    </div>
                ))
            }
        </div>
    )
}

