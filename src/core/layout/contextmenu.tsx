import React from "react"

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


    React.useEffect(()=> {
        componentRef({setItems, setOnClick: callback => onClickRef.current=callback})
    }, [setItems])
    
    
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

                #${id} > button {
                    cursor: pointer;
                    text-align: start;

                    width: 15rem;
                    height: 3rem;
                    border: none;

                    background: transparent;
                    
                }

                #${id} > button:hover {
                    background: black;
                    color: white;
                    // border-radius: 12px;
                }


                

            `}} />

            {
                items.map(item => <button key={item.id} onClick={ev => onClickRef.current ? onClickRef.current(item) : null}>{item.title}</button>)
            }

        </div>
    )
}

