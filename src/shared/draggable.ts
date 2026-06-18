import { Platform } from "./index";

const CORNER_SIZE = 80;
const EDGE_SIZE = 30;

type SnapZone = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'left' | 'right' | 'maximize'

interface SnapRect { left: number; top: number; width: number; height: number }

function getContentAreaBounds(doc: Document): DOMRect | null {
    return doc.querySelector<HTMLElement>('.content-area')?.getBoundingClientRect() ?? null
}

function detectSnapZone(mouseX: number, mouseY: number, bounds: DOMRect): SnapZone | null {
    const x = mouseX - bounds.left
    const y = mouseY - bounds.top
    const W = bounds.width
    const H = bounds.height

    if (x < CORNER_SIZE && y < CORNER_SIZE) return 'top-left'
    if (x > W - CORNER_SIZE && y < CORNER_SIZE) return 'top-right'
    if (x < CORNER_SIZE && y > H - CORNER_SIZE) return 'bottom-left'
    if (x > W - CORNER_SIZE && y > H - CORNER_SIZE) return 'bottom-right'
    if (x < EDGE_SIZE) return 'left'
    if (x > W - EDGE_SIZE) return 'right'
    if (y < EDGE_SIZE) return 'maximize'
    return null
}

function buildSnapRect(zone: SnapZone, bounds: DOMRect): SnapRect {
    const { left: ox, top: oy, width: W, height: H } = bounds
    const hw = Math.floor(W / 2)
    const hh = Math.floor(H / 2)
    switch (zone) {
        case 'top-left':     return { left: ox,      top: oy,      width: hw,     height: hh }
        case 'top-right':    return { left: ox + hw, top: oy,      width: W - hw, height: hh }
        case 'bottom-left':  return { left: ox,      top: oy + hh, width: hw,     height: H - hh }
        case 'bottom-right': return { left: ox + hw, top: oy + hh, width: W - hw, height: H - hh }
        case 'left':         return { left: ox,      top: oy,      width: hw,     height: H }
        case 'right':        return { left: ox + hw, top: oy,      width: W - hw, height: H }
        case 'maximize':     return { left: ox,      top: oy,      width: W,      height: H }
    }
}

export const draggable = (elmnt: HTMLDivElement, header: HTMLDivElement) => {
    const window = Platform.getInstance().window
    const document = window.document

    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    let currentSnapZone: SnapZone | null = null
    let snapPreview: HTMLDivElement | null = null

    const ensurePreview = (): HTMLDivElement => {
        if (snapPreview) return snapPreview
        const el = document.createElement('div')
        el.className = 'snap-preview'
        document.body.appendChild(el)
        snapPreview = el
        return el
    }

    const removePreview = () => {
        snapPreview?.remove()
        snapPreview = null
    }

    const updatePreview = (zone: SnapZone | null) => {
        if (!zone) { removePreview(); return }
        const bounds = getContentAreaBounds(document)
        if (!bounds) { removePreview(); return }
        const rect = buildSnapRect(zone, bounds)
        const el = ensurePreview()
        el.style.left = rect.left + 'px'
        el.style.top = rect.top + 'px'
        el.style.width = rect.width + 'px'
        el.style.height = rect.height + 'px'
    }

    if (header) {
        header.onmousedown = dragMouseDown;
    } else {
        elmnt.onmousedown = dragMouseDown;
    }

    function dragMouseDown(e: MouseEvent) {
        e = e || window.event;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
        elmnt.classList.add('dragging')
        if (elmnt.querySelector('iframe')) {
            elmnt.querySelector('iframe')?.classList.add('dragging')
        }
    }

    function elementDrag(e: MouseEvent) {
        e = e || window.event;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
        elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";

        const bounds = getContentAreaBounds(document)
        const zone = bounds ? detectSnapZone(e.clientX, e.clientY, bounds) : null
        if (zone !== currentSnapZone) {
            currentSnapZone = zone
            updatePreview(zone)
        }
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
        elmnt.classList.remove('dragging')
        if (elmnt.querySelector('iframe')) {
            elmnt.querySelector('iframe')?.classList.remove('dragging')
        }

        if (currentSnapZone) {
            const bounds = getContentAreaBounds(document)
            if (bounds) {
                const rect = buildSnapRect(currentSnapZone, bounds)
                elmnt.style.left = rect.left + 'px'
                elmnt.style.top = rect.top + 'px'
                elmnt.style.width = rect.width + 'px'
                elmnt.style.height = rect.height + 'px'
            }
        }

        removePreview()
        currentSnapZone = null
    }
}
