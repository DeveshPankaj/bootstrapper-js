# bootstrapper-js

A browser-based desktop environment ("web OS") built with TypeScript, React and
[BrowserFS](https://github.com/jvilk/BrowserFS). It boots a virtual file system in the
browser, exposes a window manager/desktop shell, and runs a set of bundled mini-apps as
isolated iframes/windows.

[preview](https://deveshpankaj.github.io/bootstrapper-js/)

## Apps

- **File explorer** – browse, create and delete files/folders in the virtual file system,
  and mount a local folder from your computer (see below).
- **Notepad** – simple text/code editor (CodeMirror based).
- **VS Code** – embedded VS Code-like editor experience.
- **XML parser** – parse and inspect XML documents.
- **Game of Life** – Conway's Game of Life demo app.

## Development

```sh
pnpm install
pnpm start         # webpack dev server
pnpm start:https   # webpack dev server over HTTPS (needed for some browser APIs)
pnpm build:dev     # build bundles into ./docs
```

## File explorer

The file explorer has a left navigation sidebar with quick shortcuts to **Home**
(`/home/user1`), **Mounted** (`/mnt`) and **Root** (`/`).

### Mounting a local folder

The file explorer can import a folder from your local machine into the virtual file
system using the browser's File System Access API. Click the "mount local folder" icon
(folder-upload icon) in the header and pick a directory — its contents will be copied
recursively into `/mnt/<folder name>` in the virtual file system, and the explorer will
navigate there automatically. This requires a browser that supports
`window.showDirectoryPicker` (e.g. Chrome/Edge) and a secure context (HTTPS or
localhost).
