// Compatibility shim — re-exports from kernel/ipc-bus.
// Existing imports of src/core/ipc continue to work unchanged.
export {
    initIpcBus as initIpc,
    registerIpcHandler,
    broadcastIpcEvent,
    registerWmBridge as registerWindowIpcHandlers,
} from '../kernel/ipc-bus'
export type { IpcHandler, WmBridge, DockBridge, DockSettingEntry } from '../kernel/ipc-bus'
