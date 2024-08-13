import React from "react";
import { createRoot } from "react-dom/client";
import { Platform, UICallbackProps } from "@shared/index";

const platform = Platform.getInstance()

let subscriptions: Array<{unsubscribe: () => void}> = []

platform.events$.subscribe(
    event => {
        platform.host.registerCommand('ui.game-of-life', (body: HTMLBodyElement, props: UICallbackProps) => {
            if(!body) {
                console.error(`Invalid command call [start-game-of-life']. first item must be a dom element`)
                return
            }


            subscriptions.forEach(subs => subs.unsubscribe())
            subscriptions = []
            
            const container = platform.window.document.createElement('div')

            const win = body.ownerDocument.defaultView!

            const styles = new win.CSSStyleSheet()
            styles.replace(`
                html, body {
                    margin: 0;
                    padding:0;
                    font-family: monospace;
                    height: 100svh;
                    background: black;
                }
            
                * {
                    box-sizing: border-box;
                }

                body > div {
                    height: inherit;
                }

                .row {
                    display: flex;
                    color: white;
                } 

                .cell {
                    width: ${cellWidth}px;
                    height: ${cellWidth}px;
                    background: white;
                    flex-shrink: 0;
                    cursor: pointer;
                }

                .cell.live-0 {
                    background: white;
                }
                
                .cell.live-1 {
                    background: black;
                }

                .cell.live-2 {
                    background: green;
                }

                .cell:hover {
                    background: black;
                }

            `)

            body.ownerDocument.adoptedStyleSheets.push(styles)

            body.appendChild(container)
            const root = createRoot(container)
            props.setWindowView(true)
            root.render(<GameOfLife windowHeight={win.innerHeight} windowWidth={win.innerWidth} />)
            subscriptions.push({
                unsubscribe: () => {
                    // root.unmount()
                    // container.remove()
                    // props.close()
                }
            })
        }, {icon: 'eco'})
    }
)


const cellWidth = 10

const gameMap: Array<[number, number]> = [
    [4, 6],
    [5, 4],[5, 6],
    [6, 5],[6, 6]
]


function computeNextGen(rows: number, cols: number, grid: Array<Array<number>>, nextGrid: Array<Array<number>>) {
    for (var i = 0; i < rows; i++) {
        for (var j = 0; j < cols; j++) {
            applyRules(i, j, rows, cols, grid, nextGrid);
        }
    }
    copyAndResetGrid(rows, cols, grid, nextGrid);
}

function copyAndResetGrid(rows: number, cols: number, grid: Array<Array<number>>, nextGrid: Array<Array<number>>) {
    for (var i = 0; i < rows; i++) {
        for (var j = 0; j < cols; j++) {
            grid[i][j] = nextGrid[i][j];
            nextGrid[i][j] = 0;
        }
    }
}
// RULES
// Any live cell with fewer than two live neighbours dies, as if caused by under-population.
// Any live cell with two or three live neighbours lives on to the next generation.
// Any live cell with more than three live neighbours dies, as if by overcrowding.
// Any dead cell with exactly three live neighbours becomes a live cell, as if by reproduction.

function applyRules(row: number, col: number, rows: number, cols: number, grid: Array<Array<number>>, nextGrid: Array<Array<number>>) {
    var numNeighbors = countNeighbors(row, col, rows, cols, grid);
    if (grid[row][col]) {
        if (numNeighbors < 2) {
            nextGrid[row][col] = 0;
        } else if (numNeighbors == 2 || numNeighbors == 3) {
            nextGrid[row][col] = 2;
        } else if (numNeighbors > 3) {
            nextGrid[row][col] = 0;
        }
    } else if (grid[row][col] == 0) {
            if (numNeighbors == 3) {
                nextGrid[row][col] = 1;
            }
        }
    }
    
function countNeighbors(row: number, col: number, rows: number, cols: number, grid: Array<Array<number>>) {
    var count = 0;
    if (row-1 >= 0) {
        if (grid[row-1][col]) count++;
    }
    if (row-1 >= 0 && col-1 >= 0) {
        if (grid[row-1][col-1]) count++;
    }
    if (row-1 >= 0 && col+1 < cols) {
        if (grid[row-1][col+1]) count++;
    }
    if (col-1 >= 0) {
        if (grid[row][col-1]) count++;
    }
    if (col+1 < cols) {
        if (grid[row][col+1]) count++;
    }
    if (row+1 < rows) {
        if (grid[row+1][col]) count++;
    }
    if (row+1 < rows && col-1 >= 0) {
        if (grid[row+1][col-1]) count++;
    }
    if (row+1 < rows && col+1 < cols) {
        if (grid[row+1][col+1]) count++;
    }
    return count;
}



const GameOfLife = ({windowHeight, windowWidth}: {windowHeight: number, windowWidth: number}) => {
    const [board, setBoard] = React.useState<Array<Array<number>>>([])

    React.useEffect(() => {
        const columns = Math.ceil(windowWidth / cellWidth)
        const rows = Math.ceil(windowHeight / cellWidth)

        const _board = Array(rows).fill([]).map(x => Array(columns).fill(0))
        const _board2 = Array(rows).fill([]).map(x => Array(columns).fill(0))


        // gameMap.forEach(([y, x]) => {
        //     _board[y][x] = 1
        // })
        setRandom(rows, columns, _board)

        const interval = setInterval(() => {
            computeNextGen(rows, columns, _board, _board2)
            setBoard([..._board])
        }, 100)

        setBoard(_board)

        return () => clearInterval(interval)
    }, [])

    const addItem = (row: number, col: number) => {
        setBoard(board => {
            board[row][col] = 1
            return [...board]
        })
    }

    const setRandom = (rows: number, cols:number, grid: Array<Array<number>>) => {

        for(let y=0; y<rows; y++) {
            for(let x=0; x<cols; x++) {
                grid[y][x] = Math.round(Math.random())
            }
        }
        return grid

    }

    return <>{
        board.map((row, y) => <div key={`row_${y}`}  className="row">
            {
                row.map((cell, x) => <div key={`cell_${x}`} className={`cell live-${cell}`} onClick={_ => addItem(y, x)}></div>)
            }
        </div>)
    }</>
}

