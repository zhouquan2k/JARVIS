import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthWindowManager, getProviderLoginConfig, getProviderLoginUrl } from './authWindow';

function createWindowHarness() {
    const listeners = new Map<string, Array<() => void>>();

    return {
        loadURL: vi.fn().mockResolvedValue(undefined),
        show: vi.fn(),
        focus: vi.fn(),
        destroy: vi.fn(),
        isDestroyed: vi.fn().mockReturnValue(false),
        on: vi.fn((event: string, listener: () => void) => {
            const existing = listeners.get(event) ?? [];
            existing.push(listener);
            listeners.set(event, existing);
            return undefined;
        }),
        webContents: {
            getURL: vi.fn().mockReturnValue(''),
            executeJavaScript: vi.fn().mockResolvedValue({
                authenticated: false,
                href: 'https://gemini.google.com/app'
            })
        },
        emit(event: string) {
            for (const listener of listeners.get(event) ?? []) {
                listener();
            }
        }
    };
}

describe('createAuthWindowManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    it('opens a session-bound chatgpt login window and reuses it', () => {
        const windowHarness = createWindowHarness();
        const createWindow = vi.fn().mockReturnValue(windowHarness);
        const getProviderSession = vi.fn().mockReturnValue({ id: 'chatgpt-session' });
        const manager = createAuthWindowManager({
            createWindow,
            getProviderSession
        });

        const firstWindow = manager.openProviderLoginWindow('chatgpt-web');
        windowHarness.webContents.getURL.mockReturnValue('https://chatgpt.com/');
        const reusedWindow = manager.openProviderLoginWindow('chatgpt-web');

        expect(firstWindow).toBe(reusedWindow);
        expect(createWindow).toHaveBeenCalledTimes(1);
        expect(getProviderSession).toHaveBeenCalledWith('chatgpt-web');
        expect(createWindow).toHaveBeenCalledWith(expect.objectContaining({
            title: '登录 ChatGPT',
            webPreferences: expect.objectContaining({
                session: { id: 'chatgpt-session' }
            })
        }));
        expect(windowHarness.loadURL).toHaveBeenCalledWith('https://chatgpt.com/');
        expect(windowHarness.show).toHaveBeenCalledTimes(2);
        expect(windowHarness.focus).toHaveBeenCalledTimes(2);
    });

    it('uses the resolved provider login config for title and target url', () => {
        const windowHarness = createWindowHarness();
        const manager = createAuthWindowManager({
            createWindow: vi.fn().mockReturnValue(windowHarness),
            getProviderSession: vi.fn().mockReturnValue({}),
            resolveProviderLoginConfig(providerId) {
                if (providerId !== 'custom-provider') {
                    return undefined;
                }

                return {
                    title: '登录 Custom',
                    targetUrl: 'https://example.com/login',
                    completionStrategy: 'default'
                };
            }
        });

        manager.openProviderLoginWindow('custom-provider');

        expect(windowHarness.loadURL).toHaveBeenCalledWith('https://example.com/login');
    });

    it('notifies listeners when the login window closes', () => {
        const windowHarness = createWindowHarness();
        const manager = createAuthWindowManager({
            createWindow: vi.fn().mockReturnValue(windowHarness),
            getProviderSession: vi.fn().mockReturnValue({})
        });
        const onClosed = vi.fn();
        manager.onLoginWindowClosed(onClosed);

        manager.openProviderLoginWindow('chatgpt-web');
        windowHarness.emit('closed');

        expect(onClosed).toHaveBeenCalledWith('chatgpt-web');
    });

    it('notifies listeners when the login window opens', () => {
        const windowHarness = createWindowHarness();
        const manager = createAuthWindowManager({
            createWindow: vi.fn().mockReturnValue(windowHarness),
            getProviderSession: vi.fn().mockReturnValue({})
        });
        const onOpened = vi.fn();
        manager.onLoginWindowOpened(onOpened);

        manager.openProviderLoginWindow('chatgpt-web');

        expect(onOpened).toHaveBeenCalledWith('chatgpt-web');
    });

    it('auto closes the Gemini login window after login is detected', async () => {
        vi.useFakeTimers();
        const windowHarness = createWindowHarness();
        windowHarness.webContents.executeJavaScript = vi.fn()
            .mockResolvedValueOnce({
                authenticated: false,
                href: 'https://accounts.google.com/ServiceLogin'
            })
            .mockResolvedValueOnce({
                authenticated: false,
                href: 'https://gemini.google.com/app'
            })
            .mockResolvedValueOnce({
                authenticated: true,
                href: 'https://gemini.google.com/app'
            })
            .mockResolvedValueOnce({
                authenticated: true,
                href: 'https://gemini.google.com/app'
            });
        const probeGeminiHistoryReady = vi.fn()
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true);
        const manager = createAuthWindowManager({
            createWindow: vi.fn().mockReturnValue(windowHarness),
            getProviderSession: vi.fn().mockReturnValue({}),
            probeGeminiHistoryReady
        });
        const onCompleted = vi.fn();
        manager.onLoginWindowCompleted(onCompleted);

        manager.openProviderLoginWindow('gemini-web');
        await vi.advanceTimersByTimeAsync(1500);
        expect(windowHarness.destroy).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1500);
        expect(onCompleted).not.toHaveBeenCalled();
        expect(windowHarness.destroy).not.toHaveBeenCalled();
        expect(probeGeminiHistoryReady).toHaveBeenCalledTimes(0);

        await vi.advanceTimersByTimeAsync(1500);
        expect(onCompleted).not.toHaveBeenCalled();
        expect(windowHarness.destroy).not.toHaveBeenCalled();
        expect(probeGeminiHistoryReady).toHaveBeenCalledTimes(1);
        expect(probeGeminiHistoryReady).toHaveBeenNthCalledWith(1, { forceReload: true });

        await vi.advanceTimersByTimeAsync(1500);
        expect(onCompleted).toHaveBeenCalledWith('gemini-web');
        expect(windowHarness.destroy).toHaveBeenCalledTimes(1);
        expect(probeGeminiHistoryReady).toHaveBeenCalledTimes(2);
        expect(probeGeminiHistoryReady).toHaveBeenNthCalledWith(2, { forceReload: false });
    });

    it('throws when no provider login config can be resolved', () => {
        const manager = createAuthWindowManager({
            createWindow: vi.fn().mockReturnValue(createWindowHarness()),
            getProviderSession: vi.fn().mockReturnValue({}),
            resolveProviderLoginConfig() {
                return undefined;
            }
        });

        expect(() => manager.openProviderLoginWindow('unknown-provider')).toThrow(
            "Provider 'unknown-provider' does not support desktop login windows"
        );
    });
});

describe('provider login config', () => {
    it('returns the chatgpt desktop login config', () => {
        expect(getProviderLoginConfig('chatgpt-web')).toEqual({
            title: '登录 ChatGPT',
            targetUrl: 'https://chatgpt.com/',
            completionStrategy: 'default'
        });
    });

    it('returns the gemini desktop login url', () => {
        expect(getProviderLoginUrl('gemini-web')).toBe('https://gemini.google.com/app');
    });
});
