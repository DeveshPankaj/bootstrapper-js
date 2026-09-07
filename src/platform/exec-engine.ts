// Ring 1 — Exec Engine
// Extracted from Host.execString / execCommand / exec in src/shared/index.ts.
// Runs VFS JS files and DSL command strings inside namespaced sandboxes.
// Apps get a window shim with only: platform proxy, document, top.

//@ts-nocheck
import { Subject } from 'rxjs'
import { CommandRegistry } from './command-registry'
import { ServiceRegistry } from './service-registry'
import { ProcessManager } from './process-manager'
import { ProxyFS } from './proxy-fs'

const Babel = require('../shared/babel.js')

const babelOpts = (filename: string, cwd: string) => ({
    presets: [['env', { modules: 'commonjs' }], 'react', 'typescript'],
    sourceMaps: true,
    filename,
    cwd,
})

export class ExecEngine {
    private static _instance: ExecEngine | null = null

    private _rawWindow!: Window
    private _rawFs: any
    private _commands!: CommandRegistry
    private _services!: ServiceRegistry
    private _pm!: ProcessManager

    static getInstance(): ExecEngine {
        if (!ExecEngine._instance) ExecEngine._instance = new ExecEngine()
        return ExecEngine._instance
    }

    public init(
        rawWindow: Window,
        rawFs: any,
        commands: CommandRegistry,
        services: ServiceRegistry,
        pm: ProcessManager,
    ): void {
        this._rawWindow = rawWindow
        this._rawFs = rawFs
        this._commands = commands
        this._services = services
        this._pm = pm
    }

    // Run a DSL command string (service('x','y')(command('z'))(...)).
    public execCommand(commandStr: string, platformInstance: any, ...args: string[]): Promise<unknown> {
        const ctx: any = {
            window: null, document: null, global: null, globalThis: null,
            platform: platformInstance,
            service: (moduleName: string, serviceName: string) =>
                platformInstance.host?.getService(moduleName, serviceName),
            command: (name: string) => {
                const cmd = this._commands.get(name)
                if (!cmd) throw `Command: [${name}] not found`
                return cmd
            },
            $args: args,
        }
        const factory = new Function(...Object.keys(ctx), `return (async () => {\n${commandStr}\n})();`)
        return factory.call({}, ...Object.values(ctx))
    }

    // Transpile + run a JS source string inside a namespaced window shim.
    public execString(
        source: string,
        filenameAlias = '/tmp/dynamic.js',
        platformInstance?: any,
        platformProps?: Record<string, unknown>,
    ): unknown {
        const program = Babel.transform(source, babelOpts(filenameAlias, platformInstance?.cwd ?? '/'))
        program.map.sources = ['babel://' + filenameAlias]
        const b64map = btoa(unescape(encodeURIComponent(JSON.stringify(program.map))))
        const code = `${program.code}\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${b64map}`

        const eventEmitter = new Subject()
        const lastSlash = filenameAlias.lastIndexOf('/')
        const pwd = lastSlash > -1 ? filenameAlias.slice(0, lastSlash) || '/' : '/'

        // Import Platform lazily to avoid circular dependency
        const { Platform } = require('../shared/index')
        let newPlatform = platformInstance ?? new Platform(eventEmitter, filenameAlias, pwd)
        if (!platformInstance) {
            newPlatform.setHost(platformInstance?.host ?? this._getHost())
            newPlatform.register('props', {})
            newPlatform.register('$args', [])
            newPlatform.register('React', this._services.get('React'))
            newPlatform.register('ReactDOM', this._services.get('ReactDOM'))
        }
        if (platformProps) Object.assign(newPlatform, platformProps)

        const _ctx: any = {
            exports: {},
            require: (req: string) => newPlatform.require(req, filenameAlias, newPlatform),
            window: { platform: newPlatform, document: this._rawWindow.document, top: this._rawWindow.top },
            platform: newPlatform,
        }
        _ctx.module = _ctx.exports
        new Function(...Object.keys(_ctx), code).call({}, ...Object.values(_ctx))
        return _ctx.exports
    }

    // Open a VFS path with the appropriate handler (js → execString, run → execCommand, others → UI command).
    public exec(callerPlatform: any, filepath: string, ...args: string[]): unknown {
        console.log(`$${filepath}`)
        const fs = this._rawFs
        const stat = fs.statSync(filepath)
        let script = ''

        if (stat.isDirectory()) {
            script = `service('001-core.layout', 'open-window') (command('explorer'), '${filepath}'${args.length ? ',' : ''} ${args.map(x => `"${x}"`).join(', ')})`
            return this.execCommand(script, callerPlatform, ...args)
        }

        const fileExt = filepath.split('.').at(-1)

        if (fileExt === 'js') {
            const source = fs.readFileSync(filepath).toString()
            const appDir = callerPlatform?._appDir
            return this.execString(source, '/(sw)' + filepath, undefined, appDir ? { _appDir: appDir } : undefined)
        }

        if (fileExt === 'run') {
            const source = fs.readFileSync(filepath).toString()
            return this.execCommand(source, callerPlatform, ...args)
        }

        const appExtMap: Record<string, string> = {
            '': 'ui.notepad', html: 'ui.iframe', ts: 'ui.notepad',
            png: 'ui.imageviewer', jpg: 'ui.imageviewer', jpeg: 'ui.imageviewer',
            gif: 'ui.imageviewer', webp: 'ui.imageviewer', svg: 'ui.iframe',
            bmp: 'ui.imageviewer', ico: 'ui.iframe', avif: 'ui.imageviewer',
            txt: 'ui.notepad', md: 'ui.markdown', csv: 'ui.csv-viewer',
            db: 'ui.sqlite', mmd: 'ui.mermaid', mermaid: 'ui.mermaid',
        }

        const registered = this._commands.forExtension(fileExt as string)
        const bestMatch = registered.find(r => !r.wildcard) || registered[0]
        const cmdName = bestMatch ? bestMatch.name : (appExtMap[fileExt as string] ?? appExtMap[''])
        script = `service('001-core.layout', 'open-window') (command('${cmdName}'), '${filepath}'${args.length ? ', ' : ''}${args.map(x => `"${x}"`).join(', ')})`
        return this.execCommand(script, callerPlatform, ...args)
    }

    // Lazy accessor — avoids circular import with shared/index.ts during transition.
    private _getHost(): any {
        return (window as any).__wosHost
    }
}
