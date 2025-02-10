import { Platform } from '@shared/index'
import React from 'react'

const platform = Platform.getInstance()

export type ContextMenuItem = {
    type: 'action' | 'group' | 'divider'
    id: string
    title: string
    children?: Array<ContextMenuItem>
    cmd?: string
}


export const ContextMenu: React.FC<{componentRef: (obj:{setItems:(arr: Array<ContextMenuItem>)=>void, setOnClick: (callback: (item: ContextMenuItem)=>void) => void}) => void}> = ({componentRef}) => {
    const id = 'context-menu-'+ Math.random().toString(36).substring(2, 9);

    const [items, setItems] = React.useState<Array<ContextMenuItem>>([
    //     {id: '0', type:'action', title: 'Edit'},
    //     {id: '1', type:'action', title: 'Open'},
    //     {id: '2', type:'action', title: 'Delete'},
    ]);

    const onClickRef = React.useRef<any>(null)
    const [customModule, setCustomModule] = React.useState<any>(null)
    const ComponentTemplateRef = React.useRef(({item, onClick}: {item: ContextMenuItem, onClick: Function}) => {
        return <button className='action-default-btn' key={item.id} onClick={ev => onClick(ev)}>{item.title}</button>
    })


    React.useEffect(()=> {
        componentRef({setItems, setOnClick: callback => onClickRef.current=callback})

        const fs = platform.host.getFS();
        const templateFilePath = '/usr/lib/ui/menuItem.js'
        const fileExist = fs.existsSync(templateFilePath)
        if(fileExist) {
            const fileContent = fs.readFileSync(templateFilePath)
            const mod = platform.host.execString(fileContent.toString())
            setCustomModule(mod)
            ComponentTemplateRef.current = mod.default || ComponentTemplateRef.current
            // setCustomStyles(mod?.getStyles?.(id, items) || "")
        }
    }, [items])
    
    
    return (
        <div id={id}>
            <style dangerouslySetInnerHTML={{__html: `
                #${id} { 
                    display: flex;
                    flex-direction: column;

                    gap: 1px;
                    // background-color: rgba(230, 230, 230, 0.5);
                    // box-shadow: rgba(0, 0, 0, 0.16) 0px 1px 4px;

                }

                #${id} > button.action-default-btn {
                    cursor: pointer;
                    text-align: start;

                    width: 15rem;
                    height: 3rem;
                    border: none;

                    background: transparent;
                }

                #${id} > button.action-default-btn:hover {
                    background: black;
                    color: white;
                    // border-radius: 12px;
                }
                
                ${customModule ? customModule.getStyles(id, items) : ''}
            `}} />
            {
                items.map(item => <ComponentTemplateRef.current key={item.id} item={item} onClick={() => onClickRef.current ? onClickRef.current(item) : null} />)
            }
        </div>
    )
}

