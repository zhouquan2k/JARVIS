import { BrowserWindow, type WebContents } from 'electron';
import { getProviderPartition } from './sessionManager';

export interface ControlledPageOptions {
    targetUrl?: string;
    visible?: boolean;
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
    createWindow?: (providerId: string, visible: boolean) => BrowserWindowLike;
} = {}): ControlledPageManager {
    const pages = new Map<string, BrowserWindowLike>();

    const createWindow = options.createWindow ?? ((providerId: string, visible: boolean) => {
        return new BrowserWindow({
            show: visible,
            width: 1280,
            height: 900,
            autoHideMenuBar: true,
            webPreferences: {
                partition: getProviderPartition(providerId),
                sandbox: false,
                contextIsolation: true,
                nodeIntegration: false
            }
        }) as BrowserWindowLike;
    });

    return {
        async ensurePage(providerId: string, pageOptions: ControlledPageOptions = {}) {
            const visible = pageOptions.visible === true;
            let page = pages.get(providerId);

            if (!page || page.isDestroyed()) {
                page = createWindow(providerId, visible);
                pages.set(providerId, page);
            }

            if (visible) {
                page.show();
            } else {
                page.hide();
            }

            if (pageOptions.targetUrl && page.webContents.getURL() !== pageOptions.targetUrl) {
                await page.loadURL(pageOptions.targetUrl);
            }

            return page.webContents;
        },

        dispose(providerId?: string) {
            const targetIds = providerId ? [providerId] : Array.from(pages.keys());

            for (const targetId of targetIds) {
                const page = pages.get(targetId);
                if (!page) {
                    continue;
                }

                if (!page.isDestroyed()) {
                    page.destroy();
                }
                pages.delete(targetId);
            }
        }
    };
}
