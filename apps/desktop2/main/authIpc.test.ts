import { describe, expect, it, vi } from 'vitest';
import {
    DESKTOP_PROVIDER_LOGIN_COMPLETED_CHANNEL,
    DESKTOP_PROVIDER_LOGIN_CLOSED_CHANNEL,
    DESKTOP_PROVIDER_LOGIN_OPEN_CHANNEL,
    DESKTOP_PROVIDER_LOGIN_OPENED_CHANNEL
} from '../shared/authBridge';
import { registerProviderLoginIpc } from './authIpc';

describe('registerProviderLoginIpc', () => {
    it('opens login windows via ipc and relays close events back to renderer windows', async () => {
        let openListener: ((providerId: string) => void) | null = null;
        let completedListener: ((providerId: string) => void) | null = null;
        let closeListener: ((providerId: string) => void) | null = null;
        const openProviderLoginWindow = vi.fn();
        const ipc = {
            handle: vi.fn(),
            removeHandler: vi.fn()
        };
        const rendererSend = vi.fn();
        const dispose = registerProviderLoginIpc({
            authWindowManager: {
                openProviderLoginWindow,
                onLoginWindowOpened(listener) {
                    openListener = listener;
                    return () => {
                        openListener = null;
                    };
                },
                onLoginWindowClosed(listener) {
                    closeListener = listener;
                    return () => {
                        closeListener = null;
                    };
                },
                onLoginWindowCompleted(listener) {
                    completedListener = listener;
                    return () => {
                        completedListener = null;
                    };
                },
                dispose() {
                    return undefined;
                }
            },
            ipc,
            getBroadcastWindows: () => [
                {
                    isDestroyed: () => false,
                    webContents: {
                        send: rendererSend
                    }
                },
                {
                    isDestroyed: () => true,
                    webContents: {
                        send: vi.fn()
                    }
                }
            ]
        });

        const openHandler = ipc.handle.mock.calls[0]?.[1];
        expect(ipc.handle).toHaveBeenCalledWith(DESKTOP_PROVIDER_LOGIN_OPEN_CHANNEL, expect.any(Function));

        await openHandler?.({}, 'chatgpt-web');
        expect(openProviderLoginWindow).toHaveBeenCalledWith('chatgpt-web', {
            parent: undefined
        });

        openListener?.('chatgpt-web');
        expect(rendererSend).toHaveBeenCalledWith(DESKTOP_PROVIDER_LOGIN_OPENED_CHANNEL, {
            providerId: 'chatgpt-web'
        });

        completedListener?.('chatgpt-web');
        expect(rendererSend).toHaveBeenCalledWith(DESKTOP_PROVIDER_LOGIN_COMPLETED_CHANNEL, {
            providerId: 'chatgpt-web'
        });

        closeListener?.('chatgpt-web');
        expect(rendererSend).toHaveBeenCalledWith(DESKTOP_PROVIDER_LOGIN_CLOSED_CHANNEL, {
            providerId: 'chatgpt-web'
        });

        dispose();
        expect(ipc.removeHandler).toHaveBeenCalledWith(DESKTOP_PROVIDER_LOGIN_OPEN_CHANNEL);
    });
});
