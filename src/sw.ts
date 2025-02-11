
const cacheName = 'MyFancyCacheName_v1';

self.addEventListener('install', (event: Event | any) => {
    event.waitUntil(caches.open(cacheName));
    // console.log(self.location.toString())
    // caches.open(cacheName).then((cache) => {
    //     cache.put('/123.js', 
    //         new Response("<h1>Hello!</h1>", {
    //             headers: {'Content-Type': 'text/html'}
    //         })
    //     )
    // })

});
  



let uid = 0
const getUUID = () => {
    return `${++uid}`
}

const clientRequests: Map<string, Function> = new Map();

const getMIMEtype = (fileName: string) => {
    if(fileName.endsWith('.png')) return 'image/png'
    if(fileName.endsWith('.jpeg')) return 'image/jpeg'
    if(fileName.endsWith('.html')) return 'text/html'
    if(fileName.endsWith('.js')) return 'application/javascript'
    if(fileName.endsWith('.json')) return 'application/json'
}




self.addEventListener('message', event => {
    // console.log(event.data)
    if(event.data.type === 'fs/reply') {
        const callback = clientRequests.get(event.data.payload.request_id);
        callback?.(event.data.payload.data)

    }
    // clients.matchAll().then(clients => {
    //     clients.forEach(client => {
    //         client.postMessage(event.data)
    //     })
    // })
}, {});



self.addEventListener('fetch', function(event: Event | any) {
    const url = event.request.url as string;
    // console.log(url)
    // if (url.endsWith('style.css')){
    //    event.respondWith('your_file_response')
    // }

    // if(url.endsWith('.png')) {
    //     event.respondWith(
    //         fetch('https://play-lh.googleusercontent.com/1-hPxafOxdYpYZEOKzNIkSP43HXCNftVJVttoo4ucl7rsMASXW3Xr6GlXURCubE1tA=w3840-h2160-rw')
    //     )
    // }
    
    // if(url.endsWith('.png')) {
    //     event.respondWith(
    //         fetch('/wp-4.jpeg')
    //     )
    // }

    // if(url.endsWith('react-dom.js')) {
    //     event.respondWith(
    //         fetch('https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js')
    //     )
    // }
    const _url = new URL(url)
    if(_url.pathname.startsWith('/(sw)/')) {
        console.log(_url.pathname)
        event.respondWith(new Response("<h1>we are working on interprocess message passing</h1>", {headers: {'Content-Type': "text/html"}}))
    }
    if(_url.pathname.startsWith('/cache')) {
        event.respondWith(
            caches.open(cacheName).then((cache) => {
                // Respond with the image from the cache or from the network
                return cache.match(url).then((cachedResponse) => {
                    if(!cachedResponse) {
                        console.log(_url.pathname)

                        return new Promise((resolve, reject) => {
                            const request_id = getUUID()
                            clientRequests.set(request_id, (fileData: string) => {
                                resolve(new Response(fileData, {headers: {'Content-Type': getMIMEtype(url)!}}))
                            });

                            clients.matchAll().then(clients => {
                                clients.forEach(client => {
                                    client.postMessage({type: 'fs/file-request', payload: {path: _url.pathname.slice('/cache'.length), request_id}})
                                });

                                if(clients.length === 0) {
                                    resolve(new Response("<h1>ERROR: no client available to serve the request. (if it's first time you are seeing this error, then try reloding app after saving your changes)</h1>", {headers: {'Content-Type': 'text/html'}}))
                                }
                            });

                            // resolve(new Response("<h1>400</h1>", {headers: {'Content-Type': 'text/html'}}))

                        })
                    }

                    return cachedResponse ?? new Response("<h1>404</h1>", {headers: {'Content-Type': getMIMEtype(url)!}})
                })
            })
            // new Response(localStorage.getItem('__script_for_testing__')??"", {
            //     headers: {'Content-Type': 'text/html'}
            // })
        )
        // event.respondWith(
        //     fetch('https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js')
        // )
    }

 })




