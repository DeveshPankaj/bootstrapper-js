import { Platform } from "./index";


export const draggable = (elmnt: HTMLDivElement, header: HTMLDivElement) => {
    const window = Platform.getInstance().window
    const document = window.document

    var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    if (header) {
        header.onmousedown = dragMouseDown;
    } else {
        elmnt.onmousedown = dragMouseDown;
    }
    
    function dragMouseDown(e: MouseEvent) {
        e = e || window.event;
        e.preventDefault();
        // get the mouse cursor position at startup:
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        // call a function whenever the cursor moves:
        document.onmousemove = elementDrag;

        elmnt.classList.add('dragging')
        if(elmnt.querySelector('iframe')){
            elmnt.querySelector('iframe')?.classList.add('dragging')
        }
    }
    
    function elementDrag(e: MouseEvent) {
        e = e || window.event;
        e.preventDefault();
        // calculate the new cursor position:
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        // set the element's new position:
        elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
        elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
    }
    
    function closeDragElement() {
        /* stop moving when mouse button is released:*/
        document.onmouseup = null;
        document.onmousemove = null;

        elmnt.classList.remove('dragging')
        if(elmnt.querySelector('iframe')){
            elmnt.querySelector('iframe')?.classList.remove('dragging')
        }
    }
    
}
