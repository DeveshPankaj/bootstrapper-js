
const platform = window.platform;
const React = platform.getService("React");
exports.default = ({item, onClick}) => {
    return <button key={item.id} 
        onClick={ev => onClick(ev)}>
        {item.title}
    </button>
}

exports.getStyles = (containerId, items) => {
    return `
    #${containerId} {
      overflow: hidden;
      padding: 10px;
    }
    
    #${containerId} > button {
        cursor: pointer;
        text-align: start;

        width: 15rem;
        height: 3rem;
        border: none;

        background: transparent;
        border-radius: 10px;
    }

    #${containerId} > button:hover {
        background: black;
        color: white;
    }
    `
}