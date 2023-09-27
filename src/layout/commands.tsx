import { Platform } from '@shared/index'
import React from 'react'

const platform = Platform.getInstance()


export const Commands = ({onCommandClick}: {onCommandClick: (cmd: {name: string, exec: ()=>void}) => void}) => {

    const [commands, setCommands] = React.useState<Array<{name: string, exec: ()=>void}>>([])

    const onClick = () => {
        console.log("clicked")
    }

    React.useEffect(() => {

        const subscription = platform.host.commands$.subscribe(
            _commands => setCommands(_commands)
        )

        return () => subscription.unsubscribe()

    }, [])

    return (
        <div style={{
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.3rem',
            height: '100%',
            background: '#292a2d',
            color: '#919191',
        }}>
            {
                commands.map(command => (
                    <div key={command.name} 
                        style={{
                            cursor: 'pointer',
                            padding: '0.5rem',
                            border: '1px solid'
                        }}
                        onClick={()=>onCommandClick(command)}
                    >
                        {command.name}
                    </div>
                ))
            }
        </div>
    )
}

