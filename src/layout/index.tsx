import {concatMap, delay, filter, of, range} from 'rxjs'
import { Platform } from '@shared/index'
import { Header } from './header'
import {createRoot} from 'react-dom/client'
import React from 'react'

const platform = Platform.getInstance()

const styles = platform.host.createCSSStyleSheet()
styles.replace(`
    html, body {
        margin: 0;
        padding:0;
        font-family: monospace;
        height: 100svh;
    }

    @font-face {
        font-family: 'Material Symbols Outlined';
        font-style: normal;
        font-weight: 100 700;
        src: url(https://fonts.gstatic.com/s/materialsymbolsoutlined/v138/kJEhBvYX7BgnkSrUwT8OhrdQw4oELdPIeeII9v6oFsLjBuVY.woff2) format('woff2');
    }
        
    .material-symbols-outlined {
        font-family: 'Material Symbols Outlined';
        font-weight: normal;
        font-style: normal;
        font-size: 24px;
        line-height: 1;
        letter-spacing: normal;
        text-transform: none;
        display: inline-block;
        white-space: nowrap;
        word-wrap: normal;
        direction: ltr;
        -webkit-font-feature-settings: 'liga';
        -webkit-font-smoothing: antialiased;
    }

    .layout-default {
        background: #292a2d;
        color: #919191;
    }
`)


export const render = (container: HTMLElement) => {
    platform.host.addCSSStyleSheet(styles)

    const root = createRoot(container)
    root.render(<Header />)
}


platform.events$.pipe(filter(x => x.type === 'loaded')).subscribe(
    event => {
        const container = document.createElement('div')
        container.classList.add('layout-default')
        platform.host.appendDomElement(container)
        render(container)
    }
)

platform.events$.pipe(filter(x => x.type === 'exit')).subscribe(
    event => {
        console.log(event)
    }
)
