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
        '/usr', '/usr/desktop', '/usr/downloads',

        '/bin',
        '/root',
        '/media',
        '/etc',
        '/proc'
    ]


    // @ts-ignore
    window.BrowserFS.configure({ fs: "LocalStorage" }, async err => {
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

            const defaultFiles: Array<{file: string, path: string}> = await (await fetch('/mount/meta.json')).json();
            
            defaultFiles.forEach(async item => {
                if(fs.existsSync(item.path)) return;
                const path = item.file.startsWith('http') ? item.file : `/mount/${item.file}`;
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

window.addEventListener('load', () => {
    initWindow()
    loadBootstrapScript(localStorage)
})

