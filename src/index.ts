//@ts-nocheck
import type _fs from 'fs'
const __BOOTSTRAP_SCRIPT_PATH_KEY__ = '__BOOTSTRAP_SCRIPT_PATH__';


(function() {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
        this._method = method;
        this._url = url;
        console.log('XMLHttpRequest opened:', { method, url, async, user, password });
        return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
        console.log('XMLHttpRequest sent:', { body });
        this.addEventListener('readystatechange', function() {
            if (this.readyState === 4) { // Request is complete
                console.log('XMLHttpRequest response received:', {
                    method: this._method,
                    url: this._url,
                    status: this.status,
                    response: this.responseText,
                });
            }
        });
        return originalSend.apply(this, arguments);
    };
})();

const loadBootstrapScript = (storage: Storage) => {
    const bootstrap_script_path = storage.getItem(__BOOTSTRAP_SCRIPT_PATH_KEY__) || "/remote.bundle.js"
    if(!bootstrap_script_path) return

    const script = window.document.createElement('script')
    script.src = bootstrap_script_path

    window.document.head.appendChild(script)
}


const initWindow = () => {

    // @ts-ignore
    window.BrowserFS.install(window)

    const defaultDirs = [
        '/home',
        '/home/user1',                 // New home directory for user files
        '/home/user1/apps',            // Subdirectory for apps
        '/home/user1/tools',            // Subdirectory for tools
        '/home/user1/projects',        // Subdirectory for projects
        // '/home/user1/projects/Snake.html', // Specific project file (not a directory, but included for completeness)
        // '/home/user1/projects/WebGL.html', // Specific project file (not a directory, but included for completeness)
        // '/home/user1/projects/WebGL-Earth.html', // Specific project file (not a directory, but included for completeness)
        '/usr',                        // Existing system directories
        '/usr/bin',
        '/usr/lib',
        '/usr/local',
        '/bin',
        '/root',
        '/media',
        '/etc',
        '/proc',
        '/lib',                        // Existing system directories
        '/mnt',
        '/opt',
        '/run',
        '/srv',
        '/sys',
        '/tmp',
        '/var',
        '/var/log',
        '/var/spool'
    ];
    


    // @ts-ignore
    window.BrowserFS.configure({ 
        fs: 'MountableFileSystem',
        options: {
            '/': { fs: 'LocalStorage', options: {} },
            // '/proc': { fs: 'InMemory', options: {} } 
        } 
    }, async err => {
        if (err) {
          alert(err);
        } else {
            const fs = window.require('fs') as typeof _fs
            // @ts-ignore
            window.fs = fs 

            // fs.mkdirSync('/c')
            // fs.mkdirSync('/d')
            // console.log(fs.readdirSync('/'))
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
            
            defaultFiles.forEach(async item => {
                if(fs.existsSync(item.path) && !item.force_reload) return;
                const path = item.file.startsWith('http') ? item.file : `/public/mount${item.file.startsWith('/')?'':'/'}${item.file}`;
                const fileData = await (await fetch(path)).arrayBuffer() as any;
                fs.writeFileSync(item.path, Buffer.from(fileData));

                // navigator.serviceWorker.controller?.postMessage({type: 'fs/file-added', payload: {file: item.path}});

            })
        }
    });




    if (navigator.serviceWorker) {
        navigator.serviceWorker.register('/sw.bundle.js', {scope: '/'}).then(function(reg){
            if (reg.active) console.log('serviceworker installed');
            navigator.serviceWorker.addEventListener('message', event => {
                // console.log(event.data)

                //@ts-ignore
                const fs = window.fs as typeof _fs;
                if(!fs) {
                    navigator.serviceWorker.controller?.postMessage({type: 'fs/reply', payload: {data: "File system not mounted!", request_id: event.data.payload.request_id}});
                }
                else if(fs.existsSync(event.data.payload.path)) {
                    navigator.serviceWorker.controller?.postMessage({type: 'fs/reply', payload: {data: fs.readFileSync(event.data.payload.path), request_id: event.data.payload.request_id}});
                }
                else {
                    navigator.serviceWorker.controller?.postMessage({type: 'fs/reply', payload: {data: `File not found! ${event.data.payload.path}`, request_id: event.data.payload.request_id}});
                }

            })
        })
        .catch(function(err){
           console.log('registration failed: ' + err)
         })
    }


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
  initWindow();
  // initWorker()
//   initChannel()
  loadBootstrapScript(localStorage);
})

