export const layoutCss = (grid: { columns: string, rows: string, areas: string }, wallpaperUrl: string) => `
    .layout-default {
        height: 100%;
        display: grid;
        grid-template-columns: ${grid.columns};
        grid-template-rows: ${grid.rows};
        grid-auto-flow: row;
        grid-template-areas: ${grid.areas};
        background-image: url(${wallpaperUrl});
        background-repeat: no-repeat;
        background-size: cover;
    }
    .header {
        grid-area: header;
    }
    .left-nav {
        grid-area: left-nav;
    }
    .content-area {
        grid-area: content-area;
        min-height: 0;
        min-width: 0;
        overflow: hidden;
    }
    .right-nav {
        grid-area: right-nav;
    }
    .footer {
        grid-area: footer;
    }
`
