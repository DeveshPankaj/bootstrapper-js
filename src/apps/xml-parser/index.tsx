import { Platform, UICallbackProps } from "@shared/index";
import React from "react";
import { createRoot } from "react-dom/client";
import { Token, parse } from "./parser";

const platform = Platform.getInstance()

platform.host.registerCommand('ui.xml-parser', (body: HTMLBodyElement, props: UICallbackProps) => {
    const container = platform.window.document.createElement('div')
    body.appendChild(container)
    const win = body.ownerDocument.defaultView!


    const styles = new win.CSSStyleSheet()
    styles.replace(`
        html, body {
            margin: 0;
            padding:0;
            font-family: monospace;
            height: 100svh;
            // background: black;
        }
    
        * {
            box-sizing: border-box;
        }

        .token-name:hover, .token-attr:hover {
            background: green;
        }

    `)

    body.ownerDocument.adoptedStyleSheets.push(styles)
    props.setWindowView(true)
    props.toggleFullScreen()
    render(container)
}, {icon: 'settings'})

const render = (container: HTMLElement) => {
    const root = createRoot(container)
    root.render(<App/>)
}


// const _data = `<namespace:tag attr="attr-value">body</namespace:tag>`
const _data = `
<note>Hover over right section to see the mapping</note>

<bookstore>

    <book category="cooking">
        <title lang="en">Everyday Italian</title>
        <author>Giada De Laurentiis</author>
        <year>2005</year>
        <price>30.00</price>
    </book>

    <book category="children">
        <title lang="en">Harry Potter</title>
        <author>J K. Rowling</author>
        <year>2005</year>
        <price>29.99</price>
    </book>

    <book category="web">
        <title lang="en">XQuery Kick Start</title>
        <author>James McGovern</author>
        <author>Per Bothner</author>
        <author>Kurt Cagle</author>
        <author>James Linn</author>
        <author>Vaidyanathan Nagarajan</author>
        <year>2003</year>
        <price>49.99</price>
    </book>

    <book category="web">
        <title lang="en">Learning XML</title>
        <author>Erik T. Ray</author>
        <year>2003</year>
        <price>39.95</price>
    </book>

</bookstore>`
// platform.events$.subscribe(
//     event => {
//         console.log(data)
//         console.log(parse(data))
//     }
// )

const TokensComponent = ({tokens, padding, onHover}: {tokens: Array<Token>, padding: number, onHover: (token: Token)=>void}) => {
    return tokens.map((token, i) => <div  key={i} className="token-row" style={{ cursor: 'pointer', marginLeft: `${padding}rem`}} onMouseEnter={() => onHover(token)}><span className="token-name">{token.props.name || token.props.value} {token.props.attrs?.length ? <>[{(token.props.attrs as Array<Token>||[]).map((attr, i)=> <span className="token-attr" style={{padding: '0 .5rem'}} onMouseOver={_ => onHover(attr)} key={i}>{attr.props.name}="{attr.props.value}"</span>)}]</>: null}</span><TokensComponent onHover={onHover} tokens={token.props.child_nodes||[]} padding={padding+1}/></div>)
}

const App = () => {
    const [data, setData] = React.useState(_data)
    const parsed = parse(data)

    const ref = React.useRef(null)

    const onHover = (token: Token) => {
        if(!ref.current || !token.pos) return;

        const textarea = ref.current as HTMLTextAreaElement;
        textarea.focus();
        textarea.setSelectionRange(token.pos.start, token.pos.end);

    }

    return (
        <div style={{display: 'flex', height: '100%'}}>
            <textarea style={{flexGrow: '2', height: '100%'}} defaultValue={data} onChange={ev => setData(ev.target.value)} ref={ref}></textarea>
            <pre style={{flexGrow: '1', overflow: 'auto'}}>
                <TokensComponent tokens={parsed} padding={0} onHover={onHover}/>
            </pre>
            {/* <pre style={{flexGrow: '1', overflow: 'auto'}}>{JSON.stringify(parsed, null, 2)}</pre> */}
        </div>
    )
}

