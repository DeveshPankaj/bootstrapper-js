// Host-side IPC router — handles postMessage calls from sandboxed iframes.
// Pairs with /usr/lib/ipc.js (VFS client library).

type IpcHandler = (data: unknown, source: Window) => unknown | Promise<unknown>;
const handlers = new Map<string, IpcHandler>();

export function registerIpcHandler(event: string, handler: IpcHandler) {
  handlers.set(event, handler);
}

// targetDoc defaults to `document` so existing call sites work unchanged.
// The layout bundle (which runs in a hidden iframe) passes platform.window.document.
export function broadcastIpcEvent(event: string, data: unknown, targetDoc: Document = document) {
  targetDoc.querySelectorAll('iframe').forEach(f => {
    try { f.contentWindow?.postMessage({ type: 'wos-ipc-event', event, data }, '*'); } catch (_) {}
  });
}

// The layout bundle runs in a hidden iframe — its module instances are isolated
// from the remote bundle that owns the message listener. WM handlers are bridged
// via a plain object on the shared main window so the remote bundle can reach them.
export type WmBridge = {
  getWindows: () => { pid: number; name: string; title: string; icon: string; minimized: boolean; active: boolean }[];
  toggleWindow: (pid: number) => void;
  getLaunchItems: () => { name: string; label: string; icon: string; cmd: string }[];
  launch?: (name: string) => void;
};
declare global { interface Window { __wosWmBridge?: WmBridge } }

export function registerWindowIpcHandlers(
  getWindows: WmBridge['getWindows'],
  toggleWindow: WmBridge['toggleWindow'],
  mainWindow: Window = window,
  getLaunchItems?: WmBridge['getLaunchItems'],
) {
  mainWindow.__wosWmBridge = {
    getWindows,
    toggleWindow,
    getLaunchItems: getLaunchItems ?? (() => []),
  };
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

  // WM handlers delegate to the bridge set by the layout bundle on the main window.
  registerIpcHandler('wm.getWindows', () => window.__wosWmBridge?.getWindows() ?? []);
  registerIpcHandler('wm.toggleWindow', (d: any) => { window.__wosWmBridge?.toggleWindow(Number(d.pid)); return true; });
  registerIpcHandler('wm.getLaunchItems', () => window.__wosWmBridge?.getLaunchItems() ?? []);
  registerIpcHandler('wm.launch', (d: any) => { window.__wosWmBridge?.launch?.(String(d.name)); return true; });

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
