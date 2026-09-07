// Ring 1 — Service Registry
// Extracted from Platform class in src/shared/index.ts.
// Named service map — modules register themselves here, others look them up.

export class ServiceRegistry {
    private _services = new Map<string, unknown>()
    public readonly requestedServices = new Set<string>()

    public register(name: string, value: unknown): void {
        this._services.set(name, value)
    }

    public get<T>(name: string): T | undefined {
        this.requestedServices.add(name)
        return this._services.get(name) as T | undefined
    }

    public has(name: string): boolean {
        return this._services.has(name)
    }

    public list(): string[] {
        return Array.from(this._services.keys())
    }
}
