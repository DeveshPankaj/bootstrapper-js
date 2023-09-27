import { Platform } from '@shared/index'
import React from 'react'

const platform = Platform.getInstance()


export const Header = () => {

    const onClick = () => {
        console.log("clicked")
    }

    return (
        <header style={{
            padding: '1px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            background: '#292a2d',
            color: '#919191'
        }}>
            <div style={{marginLeft: 'auto'}}></div>
            <span 
                className="material-symbols-outlined"
                style={{cursor: 'pointer'}}
                onClick={onClick}
            >
                token
            </span>
        </header>
    )
}

