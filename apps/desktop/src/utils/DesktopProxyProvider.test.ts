import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopProxyProvider } from './DesktopProxyProvider';

describe('DesktopProxyProvider', () => {
    afterEach(() => {
        delete window.chatprismDesktop;
    });

    it('proxies getAvailableModels through the desktop bridge', async () => {
        const listeners = new Set<(message: unknown) => void>();
        const sendProxyRequest = vi.fn((message: { requestId: string; channelId: string; action: string; providerId: string }) => {
            listeners.forEach((listener) => {
                listener({
                    type: 'DONE',
                    requestId: message.requestId,
                    channelId: message.channelId,
                    result: {
                        models: [{ id: 'gpt-4o', name: 'GPT-4o' }],
                        defaultModel: 'gpt-4o'
                    }
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

        const provider = new DesktopProxyProvider('chatgpt-web', { channelId: 'desktop-test-channel' });
        await expect(provider.getAvailableModels()).resolves.toEqual({
            models: [{ id: 'gpt-4o', name: 'GPT-4o' }],
            defaultModel: 'gpt-4o'
        });
        expect(sendProxyRequest).toHaveBeenCalledWith(expect.objectContaining({
            action: 'GET_AVAILABLE_MODELS',
            providerId: 'chatgpt-web',
            channelId: 'desktop-test-channel'
        }));
    });

    it('proxies getDocumentCapability through the desktop bridge', async () => {
        const listeners = new Set<(message: unknown) => void>();
        const sendProxyRequest = vi.fn((message: { requestId: string; channelId: string; action: string; providerId: string }) => {
            listeners.forEach((listener) => {
                listener({
                    type: 'DONE',
                    requestId: message.requestId,
                    channelId: message.channelId,
                    result: {
                        acceptedMimeTypes: ['text/plain', 'text/markdown', 'application/pdf']
                    }
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

        const provider = new DesktopProxyProvider('chatgpt-web', { channelId: 'desktop-capability-channel' });
        await expect(provider.getDocumentCapability()).resolves.toEqual({
            acceptedMimeTypes: ['text/plain', 'text/markdown', 'application/pdf']
        });
        expect(sendProxyRequest).toHaveBeenCalledWith(expect.objectContaining({
            action: 'GET_DOCUMENT_CAPABILITY',
            providerId: 'chatgpt-web',
            channelId: 'desktop-capability-channel'
        }));
    });

    it('proxies generateConversationTitle through the desktop bridge', async () => {
        const listeners = new Set<(message: unknown) => void>();
        const sendProxyRequest = vi.fn((message: { requestId: string; channelId: string; action: string; providerId: string; prompt: string }) => {
            listeners.forEach((listener) => {
                listener({
                    type: 'DONE',
                    requestId: message.requestId,
                    channelId: message.channelId,
                    result: '文档归档策略'
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

        const provider = new DesktopProxyProvider('chatgpt-web', { channelId: 'desktop-title-channel' });
        await expect(provider.generateConversationTitle?.('请为文档归档策略写一个简短标题', { maxLength: 10 })).resolves.toBe('文档归档策略');
        expect(sendProxyRequest).toHaveBeenCalledWith(expect.objectContaining({
            action: 'GENERATE_CONVERSATION_TITLE',
            providerId: 'chatgpt-web',
            channelId: 'desktop-title-channel',
            prompt: '请为文档归档策略写一个简短标题',
            options: {
                maxLength: 10
            }
        }));
    });

    it('forwards structured updates and abort requests independently', async () => {
        const listeners = new Set<(message: unknown) => void>();
        const sendProxyRequest = vi.fn((message: { requestId: string; channelId: string; action: string; options?: unknown }) => {
            if (message.action === 'SEND_MESSAGE' && message.channelId === 'desktop-send-channel') {
                listeners.forEach((listener) => {
                    listener({
                        type: 'UPDATE',
                        requestId: message.requestId,
                        channelId: message.channelId,
                        chunk: {
                            text: '桌面结果 [1]',
                            annotations: [
                                {
                                    kind: 'cite',
                                    range: { start: 5, end: 8 },
                                    payload: {
                                        refId: 'ref-1',
                                        label: '[1]'
                                    }
                                }
                            ],
                            functionalParts: [
                                {
                                    id: 'part-1',
                                    kind: 'search',
                                    title: 'Search',
                                    content: 'Structured search metadata'
                                }
                            ]
                        }
                    });
                    listener({
                        type: 'DONE',
                        requestId: message.requestId,
                        channelId: message.channelId,
                        result: {
                            text: '桌面结果 [1]',
                            conversationId: 'conversation-1',
                            messageId: 'message-1',
                            annotations: [
                                {
                                    kind: 'cite',
                                    range: { start: 5, end: 8 },
                                    payload: {
                                        refId: 'ref-1',
                                        label: '[1]'
                                    }
                                }
                            ],
                            functionalParts: [
                                {
                                    id: 'part-1',
                                    kind: 'search',
                                    title: 'Search',
                                    content: 'Structured search metadata'
                                }
                            ]
                        }
                    });
                });
            }
        });

        window.chatprismDesktop = {
            sendProxyRequest,
            onProxyResponse(listener) {
                listeners.add(listener);
                return () => listeners.delete(listener);
            }
        };

        const provider = new DesktopProxyProvider('chatgpt-web', { channelId: 'desktop-send-channel' });
        const updates: Array<{ text: string; annotations?: unknown[]; functionalParts?: unknown[] }> = [];
        const result = await provider.sendMessage(
            '桌面消息',
            {
                modelId: 'gpt-4o',
                modelOptions: { web_search: true }
            },
            (update) => {
                if (typeof update !== 'string') {
                    updates.push(update);
                }
            }
        );

        expect(updates[0]?.text).toBe('桌面结果 [1]');
        expect(updates[0]?.functionalParts).toHaveLength(1);
        expect(result.annotations).toHaveLength(1);
        expect(result.functionalParts).toHaveLength(1);

        const pendingProvider = new DesktopProxyProvider('chatgpt-web', { channelId: 'desktop-abort-channel' });
        const pendingPromise = pendingProvider.sendMessage('待中止请求', {}, () => undefined);
        pendingProvider.abort();
        expect(sendProxyRequest).toHaveBeenLastCalledWith(expect.objectContaining({
            action: 'ABORT',
            channelId: 'desktop-abort-channel'
        }));
        void pendingPromise.catch(() => undefined);
    });
});
