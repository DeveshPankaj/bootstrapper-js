import React from "react";
import { Command, Platform, UICallbackProps } from "@shared/index";
import { createRoot } from "react-dom/client";


const platform = Platform.getInstance()


let subscriptions: Array<{unsubscribe: () => void}> = []

platform.host.registerCommand('ui.view-commands', (body: HTMLBodyElement, props: UICallbackProps) => {
    subscriptions.forEach(subs => subs.unsubscribe())
    subscriptions = []

    console.log('opening moduls config')
    const container = platform.window.document.createElement('div')
    const win = body.ownerDocument.defaultView!

    const styles = new win.CSSStyleSheet()
    body.ownerDocument.adoptedStyleSheets.push(styles)

    body.appendChild(container)

    const root = createRoot(container)
    props.setWindowView(true)
    root.render(<ModulesComponent />)
    subscriptions.push({
        unsubscribe: () => {
            root.unmount()
            container.remove()
            props.close()
        }
    })

}, {icon: 'code', title: 'Services explorer'})


const ModulesComponent = () => {
    const [commans, setCommands] = React.useState<Array<Command>>([]);

    React.useEffect(() => {

        const subscription = platform.host.commands$.subscribe(
            commands => {
                setCommands(commands)
            }
        )


        return () => subscription.unsubscribe()

    }, [])


    const configPlacegholder = `{
        "url": "https://deveshpankaj.github.io/bootstrapper-js/dist/game-of-life.bundle.js",
        "metedata": {
            "version": "0.0.1"
        },
        "params": [],
        "preload": true
    }`
    const form = {
        namespace: 'new-app',
        config: configPlacegholder
    }

    const loadModule = () => {
        const config = JSON.parse(form.config)
        console.log({...form, config})
        platform.host.callCommand('core.add-module', form.namespace, config)
    }

    // platform.events$
    //     .pipe(filter(x => x.type === 'core.module-loaded'))
    //     .subscribe(
    //         event => {
    //             console.log(event)
    //         }
    //     )


    return (
      <>
        <div style={{padding: '1rem'}}>
          <h4>Commands</h4>

          {commans.map((command, idx) => (
            <div key={`[${idx}]${command.name}`}>
                <span style={{color: 'green'}}>[{command.servicePlatformName}]</span>
                {(command.meta as any).callable ? <button onClick={_=> command.exec()}>{command.name}</button> : command.name}
            </div>
          ))}
        </div>

        <pre>
          {
            JSON.stringify(platform.host.getModulesDetails(), null , 4)
          }
        </pre>

        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            flexDirection: "column",
            width: "30rem",
            padding: "1rem",
          }}
        >
          <h4>Load module</h4>
          <input placeholder="namespace" defaultValue={form.namespace} onChange={ev => form.namespace=ev.target.value}></input>
          <textarea placeholder={configPlacegholder} style={{height: '10rem'}} defaultValue={configPlacegholder} onChange={ev => form.config=ev.target.value}></textarea>
          <button onClick={_ => loadModule()}>Load Module</button>
        </div>

        <pre>

        </pre>
      </>
    );
}

