import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';
import { getProviderSession } from './sessionManager';

export interface ProviderLoginConfig {
    title: string;
    targetUrl: string;
    completionCheck?: {
        intervalMs?: number;
        script: string;
    };
}

type WindowLike = Pick<BrowserWindow, 'loadURL' | 'show' | 'focus' | 'on' | 'isDestroyed' | 'destroy' | 'webContents'> & {
    moveTop?: () => void;
};
type LoginWindowOpenedListener = (providerId: string) => void;
type LoginWindowCompletedListener = (providerId: string) => void;
type LoginWindowClosedListener = (providerId: string) => void;

export interface AuthWindowManager {
    openProviderLoginWindow(
        providerId: string,
        options?: { targetUrl?: string; parent?: BrowserWindow | null }
    ): WindowLike;
    onLoginWindowOpened(listener: LoginWindowOpenedListener): () => void;
    onLoginWindowCompleted(listener: LoginWindowCompletedListener): () => void;
    onLoginWindowClosed(listener: LoginWindowClosedListener): () => void;
    dispose(): void;
}

type TimerHandle = ReturnType<typeof setInterval>;

export function createAuthWindowManager(options?: {
    createWindow?: (options: BrowserWindowConstructorOptions) => WindowLike;
    getProviderSession?: typeof getProviderSession;
    resolveProviderLoginConfig?: (providerId: string) => ProviderLoginConfig | undefined;
}): AuthWindowManager {
    const createWindow = options?.createWindow ?? ((windowOptions) => new BrowserWindow(windowOptions));
    const resolveProviderSession = options?.getProviderSession ?? getProviderSession;
    const resolveProviderLoginConfig = options?.resolveProviderLoginConfig ?? (() => undefined);
    const windows = new Map<string, WindowLike>();
    const loginWatchers = new Map<string, TimerHandle>();
    const openListeners = new Set<LoginWindowOpenedListener>();
    const completedListeners = new Set<LoginWindowCompletedListener>();
    const closeListeners = new Set<LoginWindowClosedListener>();

    async function loadTargetUrl(windowRef: WindowLike, targetUrl: string) {
        const currentUrl = typeof windowRef.webContents?.getURL === 'function'
            ? windowRef.webContents.getURL()
            : '';
        if (currentUrl !== targetUrl) {
            await windowRef.loadURL(targetUrl);
        }
    }

    function stopProviderLoginWatcher(providerId: string) {
        const timer = loginWatchers.get(providerId);
        if (!timer) {
            return;
        }

        clearInterval(timer);
        loginWatchers.delete(providerId);
    }

    function startProviderLoginWatcher(providerId: string, config: ProviderLoginConfig, windowRef: WindowLike) {
        if (!config.completionCheck?.script) {
            return;
        }

        stopProviderLoginWatcher(providerId);
        let pending = false;
        const timer = setInterval(() => {
            if (pending || windowRef.isDestroyed() || windows.get(providerId) !== windowRef) {
                if (windowRef.isDestroyed() || windows.get(providerId) !== windowRef) {
                    stopProviderLoginWatcher(providerId);
                }
                return;
            }

            pending = true;
            void windowRef.webContents.executeJavaScript(config.completionCheck!.script, true)
                .then((complete) => {
                    if (complete !== true || windowRef.isDestroyed() || windows.get(providerId) !== windowRef) {
                        return;
                    }

                    for (const listener of completedListeners) {
                        listener(providerId);
                    }
                    stopProviderLoginWatcher(providerId);
                    windowRef.destroy();
                })
                .catch(() => undefined)
                .finally(() => {
                    pending = false;
                });
        }, config.completionCheck.intervalMs ?? 1500);

        loginWatchers.set(providerId, timer);
    }

    return {
        openProviderLoginWindow(providerId, config) {
            const providerConfig = resolveProviderLoginConfig(providerId);
            if (!providerConfig) {
                throw new Error(`Provider '${providerId}' does not support desktop login windows`);
            }

            const targetUrl = config?.targetUrl ?? providerConfig.targetUrl;
            const existing = windows.get(providerId);
            if (existing && !existing.isDestroyed()) {
                void loadTargetUrl(existing, targetUrl);
                existing.show();
                existing.focus();
                existing.moveTop?.();
                startProviderLoginWatcher(providerId, providerConfig, existing);
                return existing;
            }

            const providerSession = resolveProviderSession(providerId);
            const windowRef = createWindow({
                width: 1120,
                height: 820,
                minWidth: 960,
                minHeight: 640,
                autoHideMenuBar: true,
                title: providerConfig.title,
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
                stopProviderLoginWatcher(providerId);
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
            startProviderLoginWatcher(providerId, providerConfig, windowRef);
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

        onLoginWindowCompleted(listener) {
            completedListeners.add(listener);
            return () => {
                completedListeners.delete(listener);
            };
        },

        onLoginWindowClosed(listener) {
            closeListeners.add(listener);
            return () => {
                closeListeners.delete(listener);
            };
        },

        dispose() {
            for (const providerId of Array.from(loginWatchers.keys())) {
                stopProviderLoginWatcher(providerId);
            }
            for (const windowRef of windows.values()) {
                if (!windowRef.isDestroyed()) {
                    windowRef.destroy();
                }
            }
            windows.clear();
            openListeners.clear();
            completedListeners.clear();
            closeListeners.clear();
        }
    };
}
