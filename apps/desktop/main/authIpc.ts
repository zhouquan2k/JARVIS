import { BrowserWindow, ipcMain, type IpcMain } from 'electron';
import {
    DESKTOP_PROVIDER_LOGIN_CLOSED_CHANNEL,
    DESKTOP_PROVIDER_LOGIN_OPEN_CHANNEL,
    DESKTOP_PROVIDER_LOGIN_OPENED_CHANNEL,
    type ProviderLoginWindowClosedPayload
} from '../shared/authBridge';
import type { AuthWindowManager } from './authWindow';

type BroadcastWindow = Pick<BrowserWindow, 'isDestroyed' | 'webContents'>;

export function registerProviderLoginIpc(options: {
    authWindowManager: AuthWindowManager;
    ipc?: Pick<IpcMain, 'handle' | 'removeHandler'>;
    getBroadcastWindows?: () => BroadcastWindow[];
}) {
    const ipc = options.ipc ?? ipcMain;
    const getBroadcastWindows = options.getBroadcastWindows ?? (() => BrowserWindow.getAllWindows());
    const emitToRendererWindows = (channel: string, providerId: string) => {
        const payload: ProviderLoginWindowClosedPayload = { providerId };
        for (const windowRef of getBroadcastWindows()) {
            if (!windowRef.isDestroyed()) {
                windowRef.webContents.send(channel, payload);
            }
        }
    };

    const unsubscribeOpened = options.authWindowManager.onLoginWindowOpened((providerId) => {
        emitToRendererWindows(DESKTOP_PROVIDER_LOGIN_OPENED_CHANNEL, providerId);
    });
    const unsubscribeClosed = options.authWindowManager.onLoginWindowClosed((providerId) => {
        emitToRendererWindows(DESKTOP_PROVIDER_LOGIN_CLOSED_CHANNEL, providerId);
    });

    ipc.handle(DESKTOP_PROVIDER_LOGIN_OPEN_CHANNEL, async (_event, providerId: string) => {
        const parentWindow = _event?.sender
            ? BrowserWindow.fromWebContents(_event.sender) ?? undefined
            : undefined;
        options.authWindowManager.openProviderLoginWindow(providerId, {
            parent: parentWindow
        });
    });

    return () => {
        unsubscribeOpened();
        unsubscribeClosed();
        ipc.removeHandler?.(DESKTOP_PROVIDER_LOGIN_OPEN_CHANNEL);
    };
}
