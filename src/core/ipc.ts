// Host-side IPC router — handles postMessage calls from sandboxed iframes.
// Pairs with /usr/lib/ipc.js (VFS client library).

type IpcHandler = (data: unknown, source: Window) => unknown | Promise<unknown>;
const handlers = new Map<string, IpcHandler>();

export function registerIpcHandler(event: string, handler: IpcHandler) {
  handlers.set(event, handler);
}

export function broadcastIpcEvent(event: string, data: unknown) {
  document.querySelectorAll('iframe').forEach(f => {
    try { f.contentWindow?.postMessage({ type: 'wos-ipc-event', event, data }, '*'); } catch (_) {}
  });
}

export function initIpc(fs: any) {
  window.addEventListener('message', async (e: MessageEvent) => {
    if (!e.data || e.data.type !== 'wos-ipc') return;
    const { id, event, data } = e.data;
    const source = e.source as Window | null;
    if (!source) return;
    const handler = handlers.get(event);
    if (!handler) {
      source.postMessage({ type: 'wos-ipc-response', id, error: `Unknown IPC event: ${event}` }, '*');
      return;
    }
    try {
      const result = await handler(data, source);
      source.postMessage({ type: 'wos-ipc-response', id, result: result ?? null }, '*');
    } catch (err) {
      source.postMessage({ type: 'wos-ipc-response', id, error: String(err) }, '*');
    }
  });

  registerIpcHandler('fs.read', (d: any) => Array.from(fs.readFileSync(d.path) as Buffer));
  registerIpcHandler('fs.readText', (d: any) => fs.readFileSync(d.path, 'utf8') as string);
  registerIpcHandler('fs.write', (d: any) => {
    const content = d.content;
    if (typeof content === 'string') fs.writeFileSync(d.path, content);
    else fs.writeFileSync(d.path, Buffer.from(content));
    return true;
  });
  registerIpcHandler('fs.list', (d: any) => fs.readdirSync(d.path) as string[]);
  registerIpcHandler('fs.exists', (d: any) => fs.existsSync(d.path) as boolean);
  registerIpcHandler('fs.mkdir', (d: any) => { fs.mkdirSync(d.path, { recursive: true }); return true; });
  registerIpcHandler('fs.rm', (d: any) => { fs.unlinkSync(d.path); return true; });
  registerIpcHandler('fs.stat', (d: any) => {
    const s = fs.statSync(d.path);
    return { isDirectory: s.isDirectory(), size: s.size ?? 0 };
  });
}
