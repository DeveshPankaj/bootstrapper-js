

// type Tag = {
//     name: string
//     namespace: string
//     body: Array<Tag>
//     attrs: Array<Attr>
// }

// type Attr = {
//     key: string
//     namespace: string
//     value: string
// }

// type ParserResult = {
//     // source: string
//     result: Array<Tag>
// }




// type ParsingState = 'null' 
//     | 'tag-start' | 'tag-start-end'
//     | 'tag-name' 
//     | 'tag-space' 
//     | 'attr-name' 
//     | 'tag-namespace-separator'
//     | 'attr-value-separator'
//     | 'attr-saperator' 
//     | 'attr-value-start' 
//     | 'attr-value' 
//     | 'attr-value-end' 
//     | 'tag-end-start' | 'tag-end' | 'tag-end-end'
//     | 'gap'
//     | 'body'


// class XMLParser {

//     private states: Array<ParsingState> = ['null']
    
//     private transitions: Array<(current: ParsingState, ch: string) => ParsingState|null> = []
//     constructor() {}

//     public next(x: string) {
//         const newStates: Array<ParsingState> = []

//         for(let state of this.states) {
//             for(let transition of this.transitions) {
//                 const newState = transition(state, x)

//                 if(newState === null || newStates.includes(newState)) continue;

//                 newStates.push(newState)
//             }   
//         }

//         this.states = newStates

//         console.log(x, JSON.stringify(this.states))
//     }

//     public registerTransition(transition: (current: ParsingState, ch: string) => ParsingState|null) {
//         this.transitions.push(transition)
//     }

// }

// const parser = new XMLParser()

// parser.registerTransition((state, ch) => {
//     if(state === 'null' && ch === '<') return 'tag-start'
//     return null
// })
// parser.registerTransition((state, ch) => {
//     if(state === 'null' && (ch === ' ' || ch === '\n')) return 'null'
//     return null
// })

// parser.registerTransition((state, ch) => {
//     const ch_int = ch.charCodeAt(0)
//     const ch_a = 'a'.charCodeAt(0)
//     const ch_z = 'z'.charCodeAt(0)
//     if(state === 'tag-start' && ch_int >= ch_a && ch_int <= ch_z) return 'tag-name'
//     return null
// })
// parser.registerTransition((state, ch) => {
//     const ch_int = ch.charCodeAt(0)
//     const ch_a = 'a'.charCodeAt(0)
//     const ch_z = 'z'.charCodeAt(0)
//     if(state === 'tag-name' && ch_int >= ch_a && ch_int <= ch_z) return 'tag-name'
//     return null
// })

// parser.registerTransition((state, ch) => {
//     if(state === 'tag-name' && ch === ':') return 'tag-namespace-separator'
//     return null
// })

// parser.registerTransition((state, ch) => {
//     const ch_int = ch.charCodeAt(0)
//     const ch_a = 'a'.charCodeAt(0)
//     const ch_z = 'z'.charCodeAt(0)
//     if(state === 'tag-namespace-separator' && ch_int >= ch_a && ch_int <= ch_z) return 'tag-name'
//     return null
// })

// parser.registerTransition((state, ch) => {
//     if(state === 'tag-name' && ch === ' ') return 'gap'
//     return null
// })

// parser.registerTransition((state, ch) => {
//     if(state === 'gap' && ch === ' ') return 'gap'
//     return null
// })


// parser.registerTransition((state, ch) => {
//     const ch_int = ch.charCodeAt(0)
//     const ch_a = 'a'.charCodeAt(0)
//     const ch_z = 'z'.charCodeAt(0)
//     if(state === 'gap' && ch_int >= ch_a && ch_int <= ch_z) return 'attr-name'
//     return null
// })

// parser.registerTransition((state, ch) => {
//     const ch_int = ch.charCodeAt(0)
//     const ch_a = 'a'.charCodeAt(0)
//     const ch_z = 'z'.charCodeAt(0)
//     if(state === 'attr-name' && ch_int >= ch_a && ch_int <= ch_z) return 'attr-name'
//     return null
// })

// parser.registerTransition((state, ch) => {
//     if(state === 'attr-name' && ch==='=') return 'attr-value-separator'
//     return null
// })

// parser.registerTransition((state, ch) => {
//     if(state === 'attr-value-separator' && ch==='"') return 'attr-value-start'
//     return null
// })


// parser.registerTransition((state, ch) => {
//     if(['attr-value-start', 'attr-value'].includes(state)) return ch === '"' ? 'attr-value-end' : 'attr-value'
//     return null
// })


// parser.registerTransition((state, ch) => {
//     const ch_int = ch.charCodeAt(0)
//     const ch_a = 'a'.charCodeAt(0)
//     const ch_z = 'z'.charCodeAt(0)
//     if(state === 'attr-value-end' && ch === '>') return 'tag-start-end'
//     return null
// })

// parser.registerTransition((state, ch) => {
//     const ch_int = ch.charCodeAt(0)
//     const ch_a = 'a'.charCodeAt(0)
//     const ch_z = 'z'.charCodeAt(0)
//     if(state === 'attr-value-end' && ch === ' ') return 'gap'
//     return null
// })
// parser.registerTransition((state, ch) => {
//     const ch_int = ch.charCodeAt(0)
//     const ch_a = 'a'.charCodeAt(0)
//     const ch_z = 'z'.charCodeAt(0)
//     if(state === 'gap' && ch === '>') return 'tag-start-end'
//     return null
// })

// parser.registerTransition((state, ch) => {
//     const ch_int = ch.charCodeAt(0)
//     const ch_a = 'a'.charCodeAt(0)
//     const ch_z = 'z'.charCodeAt(0)
//     if(state === 'tag-start-end' && ch === '<') return 'tag-start'
//     return null
// })
// parser.registerTransition((state, ch) => {
//     const ch_int = ch.charCodeAt(0)
//     const ch_a = 'a'.charCodeAt(0)
//     const ch_z = 'z'.charCodeAt(0)
//     if(state === 'tag-name' && ch === '>') return 'tag-start-end'
//     return null
// })
// parser.registerTransition((state, ch) => {
//     const ch_int = ch.charCodeAt(0)
//     const ch_a = 'a'.charCodeAt(0)
//     const ch_z = 'z'.charCodeAt(0)
//     if((state === 'tag-start-end' || state === 'body') && ch_int >= ch_a && ch_int <= ch_z) return 'body'
//     return null
// })
// parser.registerTransition((state, ch) => {
//     const ch_int = ch.charCodeAt(0)
//     const ch_a = 'a'.charCodeAt(0)
//     const ch_z = 'z'.charCodeAt(0)
//     if(state === 'body' && ch==='<') return 'tag-end-start'
//     return null
// })

// parser.registerTransition((state, ch) => {
//     const ch_int = ch.charCodeAt(0)
//     const ch_a = 'a'.charCodeAt(0)
//     const ch_z = 'z'.charCodeAt(0)
//     if(state === 'body' && ch==='<') return 'tag-start'
//     return null
// })

// parser.registerTransition((state, ch) => {
//     const ch_int = ch.charCodeAt(0)
//     const ch_a = 'a'.charCodeAt(0)
//     const ch_z = 'z'.charCodeAt(0)
//     if(state === "tag-end-start" && ch==='/') return 'tag-end'
//     return null
// })

// parser.registerTransition((state, ch) => {
//     const ch_int = ch.charCodeAt(0)
//     const ch_a = 'a'.charCodeAt(0)
//     const ch_z = 'z'.charCodeAt(0)
//     if(state === 'tag-end' && ch !== '>') return 'tag-end'
//     return null
// })

// parser.registerTransition((state, ch) => {
//     const ch_int = ch.charCodeAt(0)
//     const ch_a = 'a'.charCodeAt(0)
//     const ch_z = 'z'.charCodeAt(0)
//     if(state === 'tag-end' && ch==='>') return 'tag-end-end'
//     return null
// })

// parser.registerTransition((state, ch) => {
//     const ch_int = ch.charCodeAt(0)
//     const ch_a = 'a'.charCodeAt(0)
//     const ch_z = 'z'.charCodeAt(0)
//     if(state === 'tag-end-end' && ch==='<') return 'tag-start'
//     return null
// })
// parser.registerTransition((state, ch) => {
//     const ch_int = ch.charCodeAt(0)
//     const ch_a = 'a'.charCodeAt(0)
//     const ch_z = 'z'.charCodeAt(0)
//     if(state === 'tag-end-end' && ch==='<') return 'tag-end-start'
//     return null
// })
// parser.registerTransition((state, ch) => {
//     const ch_int = ch.charCodeAt(0)
//     const ch_a = 'a'.charCodeAt(0)
//     const ch_z = 'z'.charCodeAt(0)
//     if(state === 'tag-start-end' && ch===' ') return 'gap'
//     return null
// })

// parser.registerTransition((state, ch) => {
//     const ch_int = ch.charCodeAt(0)
//     const ch_a = 'a'.charCodeAt(0)
//     const ch_z = 'z'.charCodeAt(0)
//     if(state === 'gap' && ch==='<') return 'tag-start'
//     return null
// })

// parser.registerTransition((state, ch) => {
//     const ch_int = ch.charCodeAt(0)
//     const ch_a = 'a'.charCodeAt(0)
//     const ch_z = 'z'.charCodeAt(0)
//     if(state === 'gap' && ch==='<') return 'tag-end-start'
//     return null
// })
// parser.registerTransition((state, ch) => {
//     const ch_int = ch.charCodeAt(0)
//     const ch_a = 'a'.charCodeAt(0)
//     const ch_z = 'z'.charCodeAt(0)
//     if(ch==='\n' || ' ') return state
//     return null
// })


// export const parse = (source: string): ParserResult => {
//     const result: Array<Tag> = []

//     for(const ch of source) {
//         parser.next(ch)
//     }

//     return {
//         // source,
//         result
//     }
// }


// // const data = `
// // <note>
// //   <to>tove</to>
// //   <from>jani</from>
// //   <heading>reminder</heading>
// //   <body>dont forget me this weekend</body>
// // </note>
// // `
// // console.log(data)
// // parse(data)

















const data = ` 
<note to="you" important >
    Hello d 
 </note>
<note>
  <to color="pink">love</to>
  <from>jani</from>
  <heading>reminder</heading>
  <body>dont forget me this weekend</body>
</note>
`

type TokenTypes = "tag" | "attr" | "text"
export type Token = {
    kind: TokenTypes
    pos?: {start: number, end: number}
    props: any
}


const escapeSpace = (parser: XMLParser) => {
    while(parser.curser < parser.code.length && [' ', '\n', '\r'].includes(parser.code[parser.curser])) {
        parser.curser++
    }
}

const getTagName = (parser: XMLParser) => {
    let tagName = ''
    while(parser.curser < parser.code.length && ![' ', '\n', '\r', '>'].includes(parser.code[parser.curser])) {
        tagName += parser.code[parser.curser]
        parser.curser++
    }

    return tagName
}

const seekTo = (parser: XMLParser, ch: string) => {
    let subStr = ''
    while(parser.curser < parser.code.length && ![ch].includes(parser.code[parser.curser])) {
        subStr += parser.code[parser.curser]
        parser.curser++
    }

    return subStr
}

const getAttrName = (parser: XMLParser) => {
    let attr = ''
    while(parser.curser < parser.code.length && !['=', ' ', '>'].includes(parser.code[parser.curser])) {
        attr += parser.code[parser.curser]
        parser.curser++
    }

    return attr
}

const getAttrString = (parser: XMLParser) => {
    let value = ''
    while(parser.curser < parser.code.length && !['"'].includes(parser.code[parser.curser])) {
        value += parser.code[parser.curser]
        parser.curser++
    }
    parser.curser++

    return value
}



class XMLParser {
    public curser = 0

    constructor(public code: string) {}

    public getCurrentToken() {
        return this.curser >= this.code.length ? null : this.code[this.curser]
    }

    public parse() {
        let start = 0, end = 0
        const obj: Array<Token> = []

        let i = -1

        while(this.curser < this.code.length && i!==this.curser) {
            escapeSpace(this)
            i = this.curser

            if(this.getCurrentToken() === '<') {
                this.curser++

                const tagStart = this.curser
                const tagName = getTagName(this)
                const tagEnd = this.curser

                escapeSpace(this)

                if(tagName[0] === '/') {
                    this.curser -= tagName.length
                    return obj
                }

                const attrs: Array<Token> = []
                if(this.getCurrentToken() !== '>') {
                    while(this.getCurrentToken() !== '>' && this.curser < this.code.length) {
                        // console.log(this.curser)
                        start = this.curser
                        const attr = getAttrName(this)
                        end = this.curser
                        

                        // this.curser++
                        escapeSpace(this)

                        if(this.getCurrentToken() === '=') {
                            this.curser++
                            escapeSpace(this)
                        }


                        if(this.getCurrentToken() === '"') {
                            this.curser++

                            const value = getAttrString(this)
                            end = this.curser

                            attrs.push({
                                kind: 'attr',
                                pos: {start, end},
                                props: {name: attr, value}
                            })
                        }

                        else {
                            attrs.push({
                                kind: 'attr',
                                pos: {start, end},
                                props: {name: attr, value: true}
                            })
                        }
                        
                        escapeSpace(this)

                    }
                }

                escapeSpace(this)

                this.curser ++
                start = this.curser
                const text = seekTo(this, '<')
                end = this.curser

                this.curser++
                // this.curser++

                let childrens: Array<Token> = [
                    {
                        kind: 'text',
                        pos: {start, end},
                        props: {
                            value: text
                        }
                    }
                ]

                if(this.getCurrentToken() !== '/') {
                    this.curser--
                    // childrens = childrens.concat(this.parse())
                    childrens = this.parse()
                }

                this.curser++
                const closeing = getAttrName(this)
                if(closeing && tagName && closeing !== tagName) {
                    console.log(`Expacted: </${tagName}, found: </${closeing}. at ${this.curser-closeing.length}`)
                }

                seekTo(this, '>')
                this.curser++
                
                obj.push({
                    kind: 'tag',
                    pos: {start: tagStart-1, end: this.curser},
                    // pos: {start: tagStart, end: tagEnd},
                    props: {
                        name: tagName,
                        child_nodes: childrens,
                        attrs
                    }
                })
                    
                
            }

            else {
                
                start = this.curser
                let _text = seekTo(this, '<')
                end = this.curser
                this.curser++
                obj.push({
                    kind: 'text',
                    pos: {start, end},
                    props: {
                        value: _text
                    }
                })
            }

            escapeSpace(this)
            // console.log(this.curser, obj)
        }
        return obj
    }

}


// const obj = parser.parse()
export const parse = (data: string) => {
    const parser = new XMLParser(data)
    return parser.parse()
}




