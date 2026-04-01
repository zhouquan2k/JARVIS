import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExternalHistoryError } from '@packages/core/src';
import { DesktopHistoryProxy } from './DesktopHistoryProxy';

describe('DesktopHistoryProxy', () => {
    afterEach(() => {
        delete window.chatprismDesktop;
    });

    it('forwards history list requests through the desktop bridge', async () => {
        const listeners = new Set<(message: unknown) => void>();

        window.chatprismDesktop = {
            sendProxyRequest(message) {
                listeners.forEach((listener) => {
                    listener({
                        type: 'DONE',
                        requestId: message.requestId,
                        channelId: message.channelId,
                        result: [
                            {
                                id: 'history-1',
                                title: '桌面对话',
                                updatedAt: 1,
                                origin: 'chatgpt-web'
                            }
                        ]
                    });
                });
            },
            onProxyResponse(listener) {
                listeners.add(listener);
                return () => listeners.delete(listener);
            }
        };

        const provider = new DesktopHistoryProxy('chatgpt-web', { channelId: 'desktop-history-channel' });
        await expect(provider.getHistoryList()).resolves.toEqual([
            {
                id: 'history-1',
                title: '桌面对话',
                updatedAt: 1,
                origin: 'chatgpt-web'
            }
        ]);
    });

    it('rejects history detail requests when host returns an error', async () => {
        const listeners = new Set<(message: unknown) => void>();
        const sendProxyRequest = vi.fn((message: { requestId: string; channelId: string }) => {
            listeners.forEach((listener) => {
                listener({
                    type: 'ERROR',
                    requestId: message.requestId,
                    channelId: message.channelId,
                    error: '桌面历史不可用'
                });
            });
        });

        window.chatprismDesktop = {
            sendProxyRequest,
            onProxyResponse(listener) {
                listeners.add(listener);
                return () => listeners.delete(listener);
            }
        };

        const provider = new DesktopHistoryProxy('gemini-web', { channelId: 'desktop-history-error-channel' });
        await expect(provider.getHistoryDetail('external-id')).rejects.toThrow('桌面历史不可用');
        expect(sendProxyRequest).toHaveBeenCalledWith(expect.objectContaining({
            action: 'GET_HISTORY_DETAIL',
            providerId: 'gemini-web'
        }));
    });

    it('preserves structured external history errors from the desktop host', async () => {
        const listeners = new Set<(message: unknown) => void>();

        window.chatprismDesktop = {
            sendProxyRequest(message) {
                listeners.forEach((listener) => {
                    listener({
                        type: 'ERROR',
                        requestId: message.requestId,
                        channelId: message.channelId,
                        error: 'Gemini 页面当前未登录。',
                        historyErrorCode: 'AUTH_REQUIRED',
                        historyProviderId: 'gemini-web'
                    });
                });
            },
            onProxyResponse(listener) {
                listeners.add(listener);
                return () => listeners.delete(listener);
            }
        };

        const provider = new DesktopHistoryProxy('gemini-web', { channelId: 'desktop-history-auth-channel' });

        await expect(provider.getHistoryList()).rejects.toMatchObject({
            name: 'ExternalHistoryError',
            code: 'AUTH_REQUIRED',
            providerId: 'gemini-web'
        });
        await expect(provider.getHistoryList()).rejects.toBeInstanceOf(ExternalHistoryError);
    });
});
