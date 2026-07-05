import { ipcMain, net } from 'electron';
import type { DesktopFetchRequest, DesktopFetchResponse } from '../shared/fetchBridge';
import { DESKTOP_FETCH_CHANNEL } from '../shared/fetchBridge';

interface IpcHandlerRegistry {
    handle(channel: string, listener: (...args: any[]) => unknown): void;
    removeHandler(channel: string): void;
}

export interface RegisterDesktopFetchIpcOptions {
    ipc?: IpcHandlerRegistry;
}

export function registerDesktopFetchIpc(options: RegisterDesktopFetchIpcOptions = {}) {
    const ipc = options.ipc ?? ipcMain;

    ipc.handle(DESKTOP_FETCH_CHANNEL, async (_event, request: DesktopFetchRequest): Promise<DesktopFetchResponse> => {
        const response = await net.fetch(request.input, {
            method: request.init?.method,
            headers: request.init?.headers ? Object.fromEntries(request.init.headers) : undefined,
            body: request.init?.bodyText
        });

        return {
            status: response.status,
            statusText: response.statusText,
            headers: Array.from(response.headers.entries()),
            bodyText: await response.text(),
            url: response.url
        };
    });

    return () => {
        ipc.removeHandler(DESKTOP_FETCH_CHANNEL);
    };
}
