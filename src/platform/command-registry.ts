// Ring 1 — Command Registry
// Extracted from Host in src/shared/index.ts.
// Manages named commands (launch actions registered by apps/system services).

import { BehaviorSubject, Observable } from 'rxjs'

export type Command = {
    name: string
    exec: (...args: unknown[]) => void
    servicePlatformName: string
    meta: Record<string, unknown>
}

export class CommandRegistry {
    private static _instance: CommandRegistry | null = null

    private _commands = new BehaviorSubject<Command[]>([])
    public readonly commands$: Observable<Command[]> = this._commands.asObservable()

    static getInstance(): CommandRegistry {
        if (!CommandRegistry._instance) CommandRegistry._instance = new CommandRegistry()
        return CommandRegistry._instance
    }

    public register(
        name: string,
        exec: (...args: unknown[]) => void,
        meta: Record<string, unknown> = {},
        platformName = 'unknown',
    ): { remove: () => void } {
        const existing = this._commands.getValue().find(x => x.name === name)
        if (existing) {
            console.warn(`[command-registry] '${name}' already registered — new registration takes precedence`)
        }
        const cmd = Object.freeze({ name, exec, servicePlatformName: platformName, meta })
        this._commands.next([cmd, ...this._commands.getValue()])
        return { remove: () => this._commands.next(this._commands.getValue().filter(x => x !== cmd)) }
    }

    public get(name: string): Command | undefined {
        return this._commands.getValue().find(x => x.name === name)
    }

    public call(name: string, ...args: unknown[]): unknown {
        const cmd = this.get(name)
        if (!cmd) { console.log(`[command-registry] Command [${name}] not registered!`); return }
        return cmd.exec(...args)
    }

    public all(): Command[] {
        return this._commands.getValue()
    }

    // Returns commands that handle a given file extension, sorted specific-first.
    public forExtension(ext: string): Array<{ name: string; title: string; icon: string; wildcard: boolean }> {
        const seen = new Set<string>()
        const results: Array<{ name: string; title: string; icon: string; wildcard: boolean }> = []
        const dotExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext}`.toLowerCase()
        for (const cmd of this._commands.getValue()) {
            if (seen.has(cmd.name)) continue
            const exts = (cmd.meta as any)?.fileExtensions as string[] | undefined
            if (!exts || !Array.isArray(exts)) continue
            seen.add(cmd.name)
            const isWild = exts.includes('*')
            const isMatch = isWild || exts.some(e => (e.startsWith('.') ? e : `.${e}`).toLowerCase() === dotExt)
            if (isMatch) {
                results.push({
                    name: cmd.name,
                    title: (cmd.meta as any)?.title || cmd.name,
                    icon: (cmd.meta as any)?.icon || 'apps',
                    wildcard: isWild,
                })
            }
        }
        return results.sort((a, b) => a.wildcard === b.wildcard ? a.title.localeCompare(b.title) : a.wildcard ? 1 : -1)
    }
}
