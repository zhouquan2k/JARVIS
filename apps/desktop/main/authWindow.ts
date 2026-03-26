import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';
import { getProviderSession } from './sessionManager';

const PROVIDER_LOGIN_URLS = new Map<string, string>([
    ['chatgpt-web', 'https://chatgpt.com/']
]);

type WindowLike = Pick<BrowserWindow, 'loadURL' | 'show' | 'focus' | 'on' | 'isDestroyed' | 'destroy' | 'webContents'> & {
    moveTop?: () => void;
};
type LoginWindowOpenedListener = (providerId: string) => void;
type LoginWindowClosedListener = (providerId: string) => void;

export interface AuthWindowManager {
    openProviderLoginWindow(
        providerId: string,
        options?: { targetUrl?: string; parent?: BrowserWindow | null }
    ): WindowLike;
    onLoginWindowOpened(listener: LoginWindowOpenedListener): () => void;
    onLoginWindowClosed(listener: LoginWindowClosedListener): () => void;
    dispose(): void;
}

function getProviderWindowTitle(providerId: string): string {
    if (providerId === 'chatgpt-web') {
        return '登录 ChatGPT';
    }

    return `登录 ${providerId}`;
}

export function getProviderLoginUrl(providerId: string): string {
    const targetUrl = PROVIDER_LOGIN_URLS.get(providerId);
    if (!targetUrl) {
        throw new Error(`Provider '${providerId}' does not support desktop login windows`);
    }

    return targetUrl;
}

export function createAuthWindowManager(options?: {
    createWindow?: (options: BrowserWindowConstructorOptions) => WindowLike;
    getProviderSession?: typeof getProviderSession;
}): AuthWindowManager {
    const createWindow = options?.createWindow ?? ((windowOptions) => new BrowserWindow(windowOptions));
    const resolveProviderSession = options?.getProviderSession ?? getProviderSession;
    const windows = new Map<string, WindowLike>();
    const openListeners = new Set<LoginWindowOpenedListener>();
    const closeListeners = new Set<LoginWindowClosedListener>();

    async function loadTargetUrl(windowRef: WindowLike, targetUrl: string) {
        const currentUrl = typeof windowRef.webContents?.getURL === 'function'
            ? windowRef.webContents.getURL()
            : '';
        if (currentUrl !== targetUrl) {
            await windowRef.loadURL(targetUrl);
        }
    }

    return {
        openProviderLoginWindow(providerId, config) {
            const targetUrl = config?.targetUrl ?? getProviderLoginUrl(providerId);
            const existing = windows.get(providerId);
            if (existing && !existing.isDestroyed()) {
                void loadTargetUrl(existing, targetUrl);
                existing.show();
                existing.focus();
                existing.moveTop?.();
                return existing;
            }

            const providerSession = resolveProviderSession(providerId);
            const windowRef = createWindow({
                width: 1120,
                height: 820,
                minWidth: 960,
                minHeight: 640,
                autoHideMenuBar: true,
                title: getProviderWindowTitle(providerId),
                parent: config?.parent ?? undefined,
                webPreferences: {
                    session: providerSession,
                    contextIsolation: true,
                    nodeIntegration: false,
                    sandbox: false
                }
            });

            windows.set(providerId, windowRef);
            windowRef.on('closed', () => {
                if (windows.get(providerId) === windowRef) {
                    windows.delete(providerId);
                }
                for (const listener of closeListeners) {
                    listener(providerId);
                }
            });

            void loadTargetUrl(windowRef, targetUrl);
            windowRef.show();
            windowRef.focus();
            windowRef.moveTop?.();
            for (const listener of openListeners) {
                listener(providerId);
            }
            return windowRef;
        },

        onLoginWindowOpened(listener) {
            openListeners.add(listener);
            return () => {
                openListeners.delete(listener);
            };
        },

        onLoginWindowClosed(listener) {
            closeListeners.add(listener);
            return () => {
                closeListeners.delete(listener);
            };
        },

        dispose() {
            for (const windowRef of windows.values()) {
                if (!windowRef.isDestroyed()) {
                    windowRef.destroy();
                }
            }
            windows.clear();
            openListeners.clear();
            closeListeners.clear();
        }
    };
}
