// Ring 1 — Message Bus
// Platform-mediated inter-process communication.
// Apps call send(channel, payload) → platform routes to target pid's handler.
// Apps CANNOT address each other directly — all routing goes through here.

import { Subject, Observable } from 'rxjs'
import { filter } from 'rxjs/operators'

export type BusMessage = {
    fromPid: number
    toPid: number | '*'   // '*' = broadcast
    channel: string
    payload: unknown
    ts: number
}

export type BusSubscription = {
    pid: number
    handler: (msg: BusMessage) => void
}

export class MessageBus {
    private static _instance: MessageBus | null = null

    private _subject = new Subject<BusMessage>()
    public readonly messages$: Observable<BusMessage> = this._subject.asObservable()

    private _subscriptions = new Map<number, Set<(msg: BusMessage) => void>>()

    static getInstance(): MessageBus {
        if (!MessageBus._instance) MessageBus._instance = new MessageBus()
        return MessageBus._instance
    }

    // Subscribe a process to incoming messages addressed to its pid or broadcast.
    public subscribe(pid: number, handler: (msg: BusMessage) => void): () => void {
        if (!this._subscriptions.has(pid)) this._subscriptions.set(pid, new Set())
        this._subscriptions.get(pid)!.add(handler)
        return () => {
            this._subscriptions.get(pid)?.delete(handler)
        }
    }

    // Send a message from one pid to another (or broadcast with toPid='*').
    // Platform is the only caller — apps call this indirectly via their NamespaceHandle.
    public send(fromPid: number, toPid: number | '*', channel: string, payload: unknown): void {
        const msg: BusMessage = { fromPid, toPid, channel, payload, ts: Date.now() }
        this._subject.next(msg)

        if (toPid === '*') {
            for (const [, handlers] of this._subscriptions) {
                for (const h of handlers) h(msg)
            }
        } else {
            const handlers = this._subscriptions.get(toPid)
            if (handlers) for (const h of handlers) h(msg)
        }
    }

    // Returns a handle scoped to a specific pid — passed to apps instead of the bus itself.
    public scopedHandle(pid: number): ScopedBusHandle {
        return new ScopedBusHandle(pid, this)
    }

    public unsubscribeAll(pid: number): void {
        this._subscriptions.delete(pid)
    }
}

// What an app receives — it can only send from its own pid, subscribe to its own inbox.
export class ScopedBusHandle {
    constructor(
        public readonly pid: number,
        private readonly bus: MessageBus,
    ) {}

    public send(toPid: number | '*', channel: string, payload: unknown): void {
        this.bus.send(this.pid, toPid, channel, payload)
    }

    public subscribe(handler: (msg: BusMessage) => void): () => void {
        return this.bus.subscribe(this.pid, handler)
    }

    public onChannel(channel: string, handler: (msg: BusMessage) => void): () => void {
        return this.subscribe(msg => { if (msg.channel === channel) handler(msg) })
    }
}
