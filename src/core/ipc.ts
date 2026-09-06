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

// Dock settings schema registered by the active dock iframe.
// Schema entries: { key, label, type, value, options?, min?, max?, step? }
export type DockSettingEntry = {
  key: string;
  label: string;
  type: 'toggle' | 'color' | 'range' | 'select' | 'app-list';
  value: unknown;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
};
export type DockBridge = {
  schema: DockSettingEntry[];
  dockId: string;
  set: (key: string, value: unknown) => void;
};
declare global {
  interface Window {
    __wosWmBridge?: WmBridge;
    __wosDockBridge?: DockBridge;
  }
}

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

  // Dock settings — active dock iframe registers its schema; settings UI reads and mutates it.
  registerIpcHandler('dock.registerSettings', (d: any) => {
    if (window.__wosDockBridge) {
      window.__wosDockBridge.schema = d.schema ?? [];
      window.__wosDockBridge.dockId = d.dockId ?? '';
    } else {
      window.__wosDockBridge = { schema: d.schema ?? [], dockId: d.dockId ?? '', set: () => {} };
    }
    // Notify settings UI that dock schema changed.
    broadcastIpcEvent('dock.schemaChanged', { schema: window.__wosDockBridge.schema, dockId: window.__wosDockBridge.dockId });
    return true;
  });
  registerIpcHandler('dock.getSchema', () => window.__wosDockBridge
    ? { schema: window.__wosDockBridge.schema, dockId: window.__wosDockBridge.dockId }
    : { schema: [], dockId: '' }
  );
  registerIpcHandler('dock.setSetting', (d: any, source) => {
    if (!window.__wosDockBridge) return false;
    const entry = window.__wosDockBridge.schema.find(e => e.key === d.key);
    if (entry) entry.value = d.value;
    // Forward the change to the dock iframe.
    broadcastIpcEvent('dock.settingChanged', { key: d.key, value: d.value });
    return true;
  });
  registerIpcHandler('dock.getSettings', () =>
    window.__wosDockBridge ? window.__wosDockBridge.schema.reduce((acc: any, e) => { acc[e.key] = e.value; return acc; }, {}) : {}
  );

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
