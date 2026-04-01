import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';
import { DEFAULT_GEMINI_HISTORY_PAGE_URL } from '@packages/core/config';
import { getProviderSession } from './sessionManager';

const PROVIDER_LOGIN_URLS = new Map<string, string>([
    ['chatgpt-web', 'https://chatgpt.com/'],
    ['gemini-web', DEFAULT_GEMINI_HISTORY_PAGE_URL]
]);

type WindowLike = Pick<BrowserWindow, 'loadURL' | 'show' | 'focus' | 'on' | 'isDestroyed' | 'destroy' | 'webContents'> & {
    moveTop?: () => void;
};
type LoginWindowOpenedListener = (providerId: string) => void;
type LoginWindowCompletedListener = (providerId: string) => void;
type LoginWindowClosedListener = (providerId: string) => void;
const GEMINI_HISTORY_SCAFFOLD_SELECTOR = [
    'conversations-list[data-test-id="all-conversations"]',
    'nav[aria-label="Chat history"]',
    '[data-test-id="conversation-list"]',
    'a[data-test-id="conversation"]',
    'a[href*="/app/"]'
].join(', ');

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

function getProviderWindowTitle(providerId: string): string {
    if (providerId === 'chatgpt-web') {
        return '登录 ChatGPT';
    }

    if (providerId === 'gemini-web') {
        return '登录 Gemini';
    }

    return `登录 ${providerId}`;
}

type TimerHandle = ReturnType<typeof setInterval>;

async function isGeminiLoginComplete(windowRef: WindowLike): Promise<{ authenticated: boolean; href: string }> {
    const evaluation = await windowRef.webContents.executeJavaScript(`
        (() => {
            const loginGate = document.querySelector('a[href*="ServiceLogin"], form[action*="ServiceLogin"]');
            const historyScaffold = document.querySelector(${JSON.stringify(GEMINI_HISTORY_SCAFFOLD_SELECTOR)});
            const href = window.location.href;
            const pathname = window.location.pathname;
            const hostname = window.location.hostname;
            const authenticated = hostname === 'gemini.google.com'
                && !/signin|login/i.test(pathname)
                && !loginGate
                && !!historyScaffold;

            return {
                authenticated,
                href,
                hasLoginGate: Boolean(loginGate),
                hasHistoryScaffold: Boolean(historyScaffold)
            };
        })()
    `, true) as {
        authenticated?: boolean;
        href?: string;
        hasLoginGate?: boolean;
        hasHistoryScaffold?: boolean;
    } | null;

    return {
        authenticated: evaluation?.authenticated === true,
        href: evaluation?.href || ''
    };
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
    probeGeminiHistoryReady?: (options?: { forceReload?: boolean }) => Promise<boolean>;
}): AuthWindowManager {
    const createWindow = options?.createWindow ?? ((windowOptions) => new BrowserWindow(windowOptions));
    const resolveProviderSession = options?.getProviderSession ?? getProviderSession;
    const probeGeminiHistoryReady = options?.probeGeminiHistoryReady ?? (async () => true);
    const windows = new Map<string, WindowLike>();
    const geminiWatchers = new Map<string, TimerHandle>();
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

    function stopGeminiLoginWatcher(providerId: string) {
        const timer = geminiWatchers.get(providerId);
        if (!timer) {
            return;
        }

        clearInterval(timer);
        geminiWatchers.delete(providerId);
    }

    function startGeminiLoginWatcher(providerId: string, windowRef: WindowLike) {
        if (providerId !== 'gemini-web') {
            return;
        }

        stopGeminiLoginWatcher(providerId);
        let pending = false;
        let hasForcedHistoryReadyReload = false;
        const timer = setInterval(() => {
            if (pending || windowRef.isDestroyed() || windows.get(providerId) !== windowRef) {
                if (windowRef.isDestroyed() || windows.get(providerId) !== windowRef) {
                    stopGeminiLoginWatcher(providerId);
                }
                return;
            }

            pending = true;
            void isGeminiLoginComplete(windowRef)
                .then(async ({ authenticated }) => {
                    if (!authenticated || windowRef.isDestroyed() || windows.get(providerId) !== windowRef) {
                        return;
                    }

                    const forceReload = !hasForcedHistoryReadyReload;
                    hasForcedHistoryReadyReload = true;
                    const historyReady = await probeGeminiHistoryReady({ forceReload });
                    if (!historyReady || windowRef.isDestroyed() || windows.get(providerId) !== windowRef) {
                        return;
                    }

                    for (const listener of completedListeners) {
                        listener(providerId);
                    }
                    stopGeminiLoginWatcher(providerId);
                    windowRef.destroy();
                })
                .catch(() => undefined)
                .finally(() => {
                    pending = false;
                });
        }, 1500);

        geminiWatchers.set(providerId, timer);
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
                startGeminiLoginWatcher(providerId, existing);
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
                stopGeminiLoginWatcher(providerId);
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
            startGeminiLoginWatcher(providerId, windowRef);
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
            for (const providerId of Array.from(geminiWatchers.keys())) {
                stopGeminiLoginWatcher(providerId);
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
