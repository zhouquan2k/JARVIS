import { app, BrowserWindow, type WebContents } from 'electron';
import { getProviderPartition } from './sessionManager';

// App 退出时才允许受控页窗口真正销毁；用户主动关闭一律转为隐藏，保留真实会话 thread。
let appQuitting = false;
app.on('before-quit', () => {
    appQuitting = true;
});

export interface ControlledPageOptions {
    targetUrl?: string;
    /** 仅当受控页当前为空白（全新窗口/about:blank）时才导航到该 URL。 */
    targetUrlIfBlank?: string;
    visible?: boolean;
    preloadPath?: string;
    forceReload?: boolean;
}

function isBlankUrl(url: string): boolean {
    return url === '' || url === 'about:blank';
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
        const win = new BrowserWindow({
            show: visible,
            width: 1280,
            height: 900,
            autoHideMenuBar: true,
            webPreferences: {
                partition: getProviderPartition(providerId),
                preload: preloadPath,
                sandbox: false,
                contextIsolation: true,
                nodeIntegration: false,
                // Hidden controlled pages must keep rendering/timers running so DOM scraping
                // (sidebar expansion, lazy-load scrolling, polling) works while not shown.
                backgroundThrottling: false
            }
        });

        // 用户主动关闭窗口时转为隐藏，避免销毁 webContents 丢失真实会话；
        // 仅在 App 退出（before-quit）或 dispose() 强制 destroy 时真正销毁。
        win.on('close', (event) => {
            if (appQuitting || win.isDestroyed()) {
                return;
            }
            event.preventDefault();
            win.hide();
        });

        return win as BrowserWindowLike;
    });

    return {
        async ensurePage(providerId: string, pageOptions: ControlledPageOptions = {}) {
            const visible = pageOptions.visible === true;
            const requestedPreloadPath = pageOptions.preloadPath;
            const forceReload = pageOptions.forceReload === true;
            let pageEntry = pages.get(providerId);
            let reused = Boolean(pageEntry);

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
                reused = false;
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

            const currentUrl = page.webContents.getURL();
            // 优先使用显式 targetUrl；否则在窗口空白时回退到 targetUrlIfBlank（用于登录/查看入口）。
            const resolvedTargetUrl = pageOptions.targetUrl
                ?? (pageOptions.targetUrlIfBlank && isBlankUrl(currentUrl) ? pageOptions.targetUrlIfBlank : undefined);
            const shouldLoad = Boolean(resolvedTargetUrl) && (forceReload || currentUrl !== resolvedTargetUrl);
            console.log('[ControlledPageManager]', JSON.stringify({
                stage: 'ensure-page',
                providerId,
                reused,
                hasPreload: Boolean(requestedPreloadPath),
                targetUrl: resolvedTargetUrl,
                currentUrl,
                forceReload,
                willLoad: shouldLoad
            }));

            if (shouldLoad && resolvedTargetUrl) {
                await page.loadURL(resolvedTargetUrl);
                console.log('[ControlledPageManager]', JSON.stringify({
                    stage: 'ensure-page-loaded',
                    providerId,
                    targetUrl: resolvedTargetUrl,
                    finalUrl: page.webContents.getURL()
                }));
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
