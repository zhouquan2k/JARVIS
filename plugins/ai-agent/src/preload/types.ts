export interface ContextBridgeLike {
    exposeInMainWorld(apiKey: string, api: unknown): void;
}

export interface IpcRendererLike {
    send(channel: string, ...args: unknown[]): void;
}
