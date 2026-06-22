//@ts-nocheck
import type _fs from 'fs'
const __BOOTSTRAP_SCRIPT_PATH_KEY__ = '__BOOTSTRAP_SCRIPT_PATH__';

// Which storage backend the virtual filesystem persists to: 'indexeddb' (default,
// GB-scale) or 'localstorage' (~5-10MB, used by older versions of this app). The
// choice is read from this localStorage key, and can be overridden (and persisted)
// via the `?fsBackend=indexeddb|localstorage` query param. Settings.html's "Storage"
// page reads/writes the same key/param names.
const FS_BACKEND_STORAGE_KEY = '__app_fs_backend__';
const FS_BACKEND_QUERY_PARAM = 'fsBackend';

const resolveFsBackend = (): 'indexeddb' | 'localstorage' => {
    const fromQuery = new URLSearchParams(window.location.search).get(FS_BACKEND_QUERY_PARAM)
    if (fromQuery === 'indexeddb' || fromQuery === 'localstorage') {
        localStorage.setItem(FS_BACKEND_STORAGE_KEY, fromQuery)
        return fromQuery
    }
    return localStorage.getItem(FS_BACKEND_STORAGE_KEY) === 'localstorage' ? 'localstorage' : 'indexeddb'
}


const loadBootstrapScript = (storage: Storage) => {
    const bootstrap_script_path = storage.getItem(__BOOTSTRAP_SCRIPT_PATH_KEY__) || "/remote.bundle.js"
    if(!bootstrap_script_path) return

    const script = window.document.createElement('script')
    script.src = bootstrap_script_path

    window.document.head.appendChild(script)
}


const initWindow = () => {

    // Boot log — phases are pushed here; readable from Settings > Boot Log via window.__bootLog.
    // @ts-ignore
    window.__bootLog = [];
    const bootLog = (label: string, startMs: number, error?: string) => {
        // @ts-ignore
        window.__bootLog.push({ label, durationMs: Date.now() - startMs, error });
    };

    // @ts-ignore
    window.BrowserFS.install(window)

    const defaultDirs = [
        '/home',
        '/home/user1',                 // New home directory for user files
        '/home/user1/apps',            // Subdirectory for apps
        '/home/user1/tools',            // Subdirectory for tools
        '/home/user1/projects',        // Subdirectory for projects
        '/home/user1/quotes',
        '/mnt',                         // Mount point for local folders
        // '/home/user1/projects/Snake.html', // Specific project file (not a directory, but included for completeness)
        // '/home/user1/projects/WebGL.html', // Specific project file (not a directory, but included for completeness)
        // '/home/user1/projects/WebGL-Earth.html', // Specific project file (not a directory, but included for completeness)
        '/usr',                        // Existing system directories
        '/usr/bin',
        '/usr/lib',
        '/usr/local',
        '/usr/share/',
        '/usr/share/icons/',
        '/bin',
        // '/root',
        // '/media',
        '/etc',
        '/etc/wm',
        '/etc/pkg',
        '/opt',
        '/opt/apps',
        '/proc',
        // '/lib',                        // Existing system directories
        // '/mnt',
        // '/run',
        '/srv',
        '/sys',
        '/tmp',
        '/var',
        '/var/log',
        '/var/spool'
    ];
    


    // LocalStorage has a ~5-10MB quota, far too small for this app's filesystem
    // (and for mounted local folders). Use IndexedDB (often GB-scale) for everything
    // instead. IndexedDB is async-only, so mirror it behind an InMemory filesystem
    // to keep the synchronous `fs` API working.
    const createBackend = <T>(Ctor: { Create(opts: T, cb: (err: any, fs?: any) => void): void }, opts: T): Promise<any> =>
        new Promise((resolve, reject) => Ctor.Create(opts, (err, fs) => err ? reject(err) : resolve(fs)))

    // Creates an IndexedDB-backed filesystem mirrored behind an InMemory filesystem,
    // so it can be used synchronously while being persisted to IndexedDB (storeName).
    const createIndexedDBMirror = async (Backend: any, storeName: string) => {
        const idbFS = await createBackend(Backend.IndexedDB, { storeName })
        await new Promise<void>((resolve, reject) => idbFS.makeRootDirectory((err: any) => err ? reject(err) : resolve()))
        const memFS = await createBackend(Backend.InMemory, {})
        return createBackend(Backend.AsyncMirror, { sync: memFS, async: idbFS })
    }

    const fsReady = (async () => {
        const t0 = Date.now();
        try {
            // @ts-ignore
            const Backend = window.BrowserFS.FileSystem
            const fsBackend = resolveFsBackend()

            let mfs
            if (fsBackend === 'localstorage') {
                // LocalStorage is a single global synchronous key-value store (no
                // namespacing), so only '/' is backed by it; '/tmp' and '/mnt' are
                // in-memory (ephemeral) to avoid key collisions.
                const rootFS = await createBackend(Backend.LocalStorage, {})
                const tmpFS = await createBackend(Backend.InMemory, {})
                const mntFS = await createBackend(Backend.InMemory, {})
                mfs = await createBackend(Backend.MountableFileSystem, { '/': rootFS, '/tmp': tmpFS, '/mnt': mntFS })
            } else {
                const rootFS = await createIndexedDBMirror(Backend, 'fs')
                const tmpFS = await createIndexedDBMirror(Backend, 'tmp')
                const mntFS = await createIndexedDBMirror(Backend, 'mnt')
                mfs = await createBackend(Backend.MountableFileSystem, { '/': rootFS, '/tmp': tmpFS, '/mnt': mntFS })
            }

            // @ts-ignore
            window.BrowserFS.initialize(mfs)
            bootLog(`VFS init (${fsBackend})`, t0);

            const fs = window.require('fs') as typeof _fs
            // @ts-ignore
            window.fs = fs

            defaultDirs.forEach(dir => {
                if(!fs.existsSync(dir)) {
                    fs.mkdirSync(dir)
                }
            })

            const metaFilePath = '/meta.json'
            const metaFileServerPath = '/public/mount/meta.json'
            const isMetaFileExist = fs.existsSync(metaFilePath)
            let defaultFiles: Array<{file: string, path: string, force_reload?:boolean}> = []
            if(isMetaFileExist) {
                const metaFileRawContent = fs.readFileSync(metaFilePath)
                defaultFiles = JSON.parse(metaFileRawContent)
            }

            const ignoreMetaReload = defaultFiles.find(item => item.path === metaFilePath && item.force_reload===false);
            if(!ignoreMetaReload) defaultFiles = await (await fetch(metaFileServerPath)).json();

            const t1 = Date.now();
            let fileCount = 0;
            defaultFiles.forEach(async item => {
                if(fs.existsSync(item.path) && !item.force_reload) return;
                const path = item.file.startsWith('http') ? item.file : `/public/mount${item.file.startsWith('/')?'':'/'}${item.file}`;
                const fileData = await (await fetch(path)).arrayBuffer() as any;

                const dir = item.path.slice(0, item.path.lastIndexOf('/')) || "/"
                if(!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true})
                fs.writeFileSync(item.path, Buffer.from(fileData));
                fileCount++;

                // navigator.serviceWorker.controller?.postMessage({type: 'fs/file-added', payload: {file: item.path}});

            })
            bootLog(`meta.json bootstrap (${fileCount} files written)`, t1);
        } catch (err) {
            bootLog('VFS error', t0, String(err));
            alert(err)
        }
    })();




    if (navigator.serviceWorker) {
        navigator.serviceWorker.register('/sw.bundle.js', {scope: '/'}).then(function(reg){
            if (reg.active) console.log('serviceworker installed');
            // On first install the SW isn't controlling the page yet — reload once it activates.
            const worker = reg.installing || reg.waiting;
            if (worker) {
                worker.addEventListener('statechange', () => {
                    if (worker.state === 'activated') location.reload();
                });
            }
            navigator.serviceWorker.addEventListener('message', event => {
                // console.log(event.data)

                //@ts-ignore
                const fs = window.fs as typeof _fs;
                if(!fs) {
                    navigator.serviceWorker.controller?.postMessage({type: 'fs/reply', payload: {data: "File system not mounted!", error: "File system not mounted!", request_id: event.data.payload.request_id}});
                }
                else if(fs.existsSync(event.data.payload.path)) {
                    navigator.serviceWorker.controller?.postMessage({type: 'fs/reply', payload: {data: fs.readFileSync(event.data.payload.path), error: "", request_id: event.data.payload.request_id}});
                }
                else {
                    navigator.serviceWorker.controller?.postMessage({type: 'fs/reply', payload: {data: `File not found! ${event.data.payload.path}`, error: "File not found!", request_id: event.data.payload.request_id}});
                }

            })
        })
        .catch(function(err){
           console.log('registration failed: ' + err)
         })
    }

    return fsReady
}

const channelRef = {current: null as null | BroadcastChannel}
const initChannel = () => {
    type ChannelMessage = {type: string, data: string}
    const channel = new BroadcastChannel('my_channel')
    channel.onmessage = (event) => {
        const data: ChannelMessage = JSON.parse(event.data)
        // console.log(data)
        workerRef.current?.postMessage(data)
    }
    channel.postMessage(JSON.stringify({type: 'msg', data: 'New tab created'}))
    channel.postMessage(JSON.stringify({type: 'cmd', data: 'this.getuser()'}))
    channelRef.current = channel
}


const workerRef = {current: null as null | Worker}
const initWorker = () => {
    function startWorker() {
        const workerCode = `
            onmessage = function(event) {
                const receivedMessage = event.data;
                
                if(receivedMessage.type === 'reply') console.log(receivedMessage)

                if(receivedMessage.type === 'cmd') {
                    const factory = new Function('a', 'b', 'return ' + receivedMessage.data)
                    const context = {
                        getuser: () => 'Admin'
                    }
                    const res = factory.apply(context, [10, 20])
                    // console.log(res)
                    // postMessage(res);
                    const channel = new BroadcastChannel('my_channel')
                    channel.postMessage(JSON.stringify({type: 'reply', data: res}))


                }

                // postMessage(receivedMessage);
            }
        `;

        const blob = new Blob([workerCode], { type: "application/javascript" });
        const workerUrl = URL.createObjectURL(blob);
        const worker = new Worker(workerUrl);


        worker.onmessage = function(event) {
            console.log(event.data)
        }

        workerRef.current = worker



        return worker
    }

    function stopWorker(worker: Worker) {
        worker.terminate();
    }

    const worker = startWorker()

}

window.addEventListener('load', async () => {
  await initWindow();
  // initWorker()
//   initChannel()
  loadBootstrapScript(localStorage);
})

