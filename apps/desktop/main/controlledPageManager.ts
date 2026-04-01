import { BrowserWindow, type WebContents } from 'electron';
import { getProviderPartition } from './sessionManager';

export interface ControlledPageOptions {
    targetUrl?: string;
    visible?: boolean;
    preloadPath?: string;
    forceReload?: boolean;
}

type BrowserWindowLike = {
    loadURL(url: string): Promise<void>;
    show(): void;
    hide(): void;
    destroy(): void;
    isDestroyed(): boolean;
    webContents: {
        getURL(): string;
    } & WebContents;
};

export interface ControlledPageManager {
    ensurePage(providerId: string, options?: ControlledPageOptions): Promise<WebContents>;
    dispose(providerId?: string): void;
}

export function createControlledPageManager(options: {
    createWindow?: (providerId: string, visible: boolean, preloadPath?: string) => BrowserWindowLike;
} = {}): ControlledPageManager {
    const pages = new Map<string, { window: BrowserWindowLike; preloadPath?: string }>();

    const createWindow = options.createWindow ?? ((providerId: string, visible: boolean, preloadPath?: string) => {
        return new BrowserWindow({
            show: visible,
            width: 1280,
            height: 900,
            autoHideMenuBar: true,
            webPreferences: {
                partition: getProviderPartition(providerId),
                preload: preloadPath,
                sandbox: false,
                contextIsolation: true,
                nodeIntegration: false
            }
        }) as BrowserWindowLike;
    });

    return {
        async ensurePage(providerId: string, pageOptions: ControlledPageOptions = {}) {
            const visible = pageOptions.visible === true;
            const requestedPreloadPath = pageOptions.preloadPath;
            const forceReload = pageOptions.forceReload === true;
            let pageEntry = pages.get(providerId);

            if (
                pageEntry
                && (
                    pageEntry.window.isDestroyed()
                    || pageEntry.preloadPath !== requestedPreloadPath
                )
            ) {
                if (!pageEntry.window.isDestroyed()) {
                    pageEntry.window.destroy();
                }
                pages.delete(providerId);
                pageEntry = undefined;
            }

            if (!pageEntry) {
                pageEntry = {
                    window: createWindow(providerId, visible, requestedPreloadPath),
                    preloadPath: requestedPreloadPath
                };
                pages.set(providerId, pageEntry);
            }

            const page = pageEntry.window;
            if (visible) {
                page.show();
            } else {
                page.hide();
            }

            if (pageOptions.targetUrl && (forceReload || page.webContents.getURL() !== pageOptions.targetUrl)) {
                await page.loadURL(pageOptions.targetUrl);
            }

            return page.webContents;
        },

        dispose(providerId?: string) {
            const targetIds = providerId ? [providerId] : Array.from(pages.keys());

            for (const targetId of targetIds) {
                const pageEntry = pages.get(targetId);
                if (!pageEntry) {
                    continue;
                }

                const page = pageEntry.window;
                if (!page.isDestroyed()) {
                    page.destroy();
                }
                pages.delete(targetId);
            }
        }
    };
}
