
export const DESKTOP_PATH = '/usr/desktop'

export const getFileExtension = (fileName: string) => {
    const ext = fileName.split('.').at(-1)
    if(ext?.length === 0 || ((ext?.length||0) >= fileName.length-1)) return '.'
    return `.${ext}`
}


export const appendStyleSheet = (document: Document, styleSheet: CSSStyleSheet) => {
    if(document.adoptedStyleSheets.find(s => s === styleSheet)) return;

    document.adoptedStyleSheets.push(styleSheet)
}
