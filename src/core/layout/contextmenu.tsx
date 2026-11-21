import { Platform } from '@shared/index'
import React from 'react'
import { loadSystemModule } from '../../system/static-code'

const platform = Platform.getInstance()

const MENU_ITEM_TEMPLATE_PATH = '/usr/lib/ui/menuItem.js'

// A menu entry (audit KRN-3/WIN-2, decisions.md D9). What a selection does is
// data, never generated code:
// - `onSelect`: a function — for callers in this origin that build menus in code;
// - `command` + `args`: run that command with `args` as values; `window: true`
//   opens it in a new window (open-window) instead of calling it;
// - `cmd`: a DSL string for user-authored entries (/etc/contextmenu.json) and
//   fixed strings from other callers. Values reach it only as `$args` (from
//   `args`), never spliced into its source.
export type ContextMenuItem = {
    type: 'action' | 'group' | 'divider'
    id: string
    title: string
    children?: Array<ContextMenuItem>
    onSelect?: () => unknown
    command?: string
    args?: unknown[]
    window?: boolean
    cmd?: string
}

export const runContextMenuItem = (item: ContextMenuItem): unknown => {
    if (!item || typeof item !== 'object') return
    if (typeof item.onSelect === 'function') return item.onSelect()
    const args = Array.isArray(item.args) ? item.args : []
    if (typeof item.command === 'string' && item.command) {
        return item.window
            ? platform.host.openWindow(item.command, ...args)
            : platform.host.callCommand(item.command, ...args)
    }
    if (typeof item.cmd === 'string' && item.cmd) {
        return platform.host.execCommand(item.cmd, platform, ...(args as string[]))
    }
}

// Group entries ("Open with …") are rendered here rather than by the item
// template, so a child's selection goes through runContextMenuItem like any
// other entry. Same look as /usr/lib/ui/menuItem.js (its `.ctx-child-btn`
// styles apply).
const ContextMenuGroup = ({ item, onSelect }: { item: ContextMenuItem, onSelect: (item: ContextMenuItem) => void }) => (
    <>
        <div style={{ padding: '4px 14px 2px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.45, userSelect: 'none', pointerEvents: 'none', flexShrink: 0 }}>
            {item.title}
        </div>
        {(item.children ?? []).map(child =>
            <button key={child.id} className='ctx-child-btn' onClick={() => onSelect(child)}>{child.title}</button>
        )}
    </>
)


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
        if (item.type === 'divider') return <hr style={{ margin: '4px 10px', border: 'none', borderTop: '1px solid rgba(127,127,127,0.2)', flexShrink: 0 }} />
        return <button className='action-default-btn' key={item.id} onClick={ev => onClick(ev)}>{item.title}</button>
    })
    const select = (item: ContextMenuItem) => { if (onClickRef.current) onClickRef.current(item) }


    React.useEffect(()=> {
        componentRef({setItems, setOnClick: callback => onClickRef.current=callback})
    }, [items])

    // The item template (/usr/lib/ui/menuItem.js) runs from the immutable static
    // copy, loaded once — not from the writable vfs (decisions.md D1, audit
    // BOOT-11). Until it's there, or if it can't be loaded, the compiled
    // default template above renders the menu.
    React.useEffect(() => {
        let cancelled = false
        loadSystemModule(MENU_ITEM_TEMPLATE_PATH).then(mod => {
            if (cancelled || !mod || typeof mod.default !== 'function') return
            ComponentTemplateRef.current = mod.default
            setCustomModule(mod)
        })
        return () => { cancelled = true }
    }, [])
    
    
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

                /* Group children, when no item template is loaded (:where keeps
                   this below the template's own .ctx-child-btn rules). */
                :where(#${id}) > button.ctx-child-btn {
                    cursor: pointer;
                    text-align: start;
                    width: 15rem;
                    height: 2.5rem;
                    border: none;
                    padding-left: 26px;
                    background: transparent;
                    color: inherit;
                    font: inherit;
                }

                :where(#${id}) > button.ctx-child-btn:hover {
                    background: black;
                    color: white;
                }

                ${typeof customModule?.getStyles === 'function' ? customModule.getStyles(id, items) : ''}
            `}} />
            {
                items.map(item => item.type === 'group'
                    ? <ContextMenuGroup key={item.id} item={item} onSelect={select} />
                    : <ComponentTemplateRef.current key={item.id} item={item} onClick={() => select(item)} />)
            }
        </div>
    )
}

