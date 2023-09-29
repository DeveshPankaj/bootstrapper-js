import {concatMap, delay, filter, of, range} from 'rxjs'
import { Command, Platform } from '@shared/index'
import { Header } from './header'
import {createRoot} from 'react-dom/client'
import React from 'react'
import { Commands } from './commands'

const platform = Platform.getInstance()

const styles = platform.host.createCSSStyleSheet()
styles.replace(`
    html, body {
        margin: 0;
        padding:0;
        font-family: monospace;
        height: 100svh;
        overflow: hidden;
    }

    * {
        box-sizing: border-box;
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
        // background: #292a2d;
        // color: #919191;
        height: -webkit-fill-available;

        display: grid;
        grid-template-columns: auto 1fr auto;
        grid-template-rows: auto 1fr auto;
        // gap: 5px;
        grid-auto-flow: row;
        grid-template-areas:
            "header header header"
            "left-nav content-area right-nav"
            "footer footer footer";

    }
    .header {
        grid-area: header;
    }
    .left-nav {
        grid-area: left-nav;
    }
    .content-area {
        grid-area: content-area;
    }

    .content-area > iframe {
        border: 0;
        width: -webkit-fill-available;
        height: -webkit-fill-available;
    }

    .right-nav {
        grid-area: right-nav;
    }
    .footer {
        grid-area: footer;
    }
`)


export const render = (container: HTMLElement) => {
    platform.host.addCSSStyleSheet(styles)

    const contentRef = {current: null as HTMLDivElement | null}

    const onCommandClick = (command: Command) => {
        const iframe = platform.window.document.createElement('iframe')
        iframe.onload = () => {
            const iframeBody = iframe.contentWindow?.document?.body
            if(!iframeBody) return;
            iframeBody.style.margin = '0'
            command.exec(iframeBody)
        }

        if(contentRef.current) {
            contentRef.current.innerText = ''
            contentRef.current.appendChild(iframe)
        }
    }

    const root = createRoot(container)
    root.render(
        <>
            <div className="header">
                {/* <Header /> */}
            </div>
            <div className="left-nav">
                <Commands onCommandClick={onCommandClick} />
            </div>
            <div className="content-area" ref={contentRef}>
            </div>
            <div className="right-nav"></div>
            <div className="footer"></div>
        </>
    )
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
