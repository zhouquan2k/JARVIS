import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackgroundProxyProvider } from './BackgroundProxyProvider';

describe('BackgroundProxyProvider', () => {
    afterEach(() => {
        // @ts-expect-error test cleanup
        delete globalThis.chrome;
    });

    it('proxies getAvailableModels through the background channel', async () => {
        let onMessage: ((message: unknown) => void) | undefined;
        const postMessage = vi.fn((message: { requestId: string; channelId: string; action: string; providerId: string }) => {
            onMessage?.({
                type: 'DONE',
                requestId: message.requestId,
                channelId: message.channelId,
                result: {
                    models: [{ id: 'gpt-4o', name: 'GPT-4o' }],
                    defaultModel: 'gpt-4o'
                }
            });
        });

        // @ts-expect-error simplified test double
        globalThis.chrome = {
            runtime: {
                connect: () => ({
                    postMessage,
                    onDisconnect: { addListener: vi.fn() },
                    onMessage: {
                        addListener: (listener: (message: unknown) => void) => {
                            onMessage = listener;
                        }
                    }
                })
            }
        };

        const provider = new BackgroundProxyProvider('chatgpt-web', { channelId: 'test-channel' });
        await expect(provider.getAvailableModels()).resolves.toEqual({
            models: [{ id: 'gpt-4o', name: 'GPT-4o' }],
            defaultModel: 'gpt-4o'
        });
        expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
            action: 'GET_AVAILABLE_MODELS',
            providerId: 'chatgpt-web',
            channelId: 'test-channel'
        }));
    });

    it('proxies getDocumentCapability through the background channel', async () => {
        let onMessage: ((message: unknown) => void) | undefined;
        const postMessage = vi.fn((message: { requestId: string; channelId: string; action: string; providerId: string }) => {
            onMessage?.({
                type: 'DONE',
                requestId: message.requestId,
                channelId: message.channelId,
                result: {
                    acceptedMimeTypes: ['text/plain', 'text/markdown', 'application/pdf']
                }
            });
        });

        // @ts-expect-error simplified test double
        globalThis.chrome = {
            runtime: {
                connect: () => ({
                    postMessage,
                    onDisconnect: { addListener: vi.fn() },
                    onMessage: {
                        addListener: (listener: (message: unknown) => void) => {
                            onMessage = listener;
                        }
                    }
                })
            }
        };

        const provider = new BackgroundProxyProvider('chatgpt-web', { channelId: 'capability-channel' });
        await expect(provider.getDocumentCapability()).resolves.toEqual({
            acceptedMimeTypes: ['text/plain', 'text/markdown', 'application/pdf']
        });
        expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
            action: 'GET_DOCUMENT_CAPABILITY',
            providerId: 'chatgpt-web',
            channelId: 'capability-channel'
        }));
    });

    it('proxies generateConversationTitle through the background channel', async () => {
        let onMessage: ((message: unknown) => void) | undefined;
        const postMessage = vi.fn((message: { requestId: string; channelId: string; action: string; providerId: string; prompt: string }) => {
            onMessage?.({
                type: 'DONE',
                requestId: message.requestId,
                channelId: message.channelId,
                result: '事故时间线'
            });
        });

        // @ts-expect-error simplified test double
        globalThis.chrome = {
            runtime: {
                connect: () => ({
                    postMessage,
                    onDisconnect: { addListener: vi.fn() },
                    onMessage: {
                        addListener: (listener: (message: unknown) => void) => {
                            onMessage = listener;
                        }
                    }
                })
            }
        };

        const provider = new BackgroundProxyProvider('chatgpt-web', { channelId: 'title-channel' });
        await expect(provider.generateConversationTitle?.('请帮我梳理事故时间线', { maxLength: 12 })).resolves.toBe('事故时间线');
        expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
            action: 'GENERATE_CONVERSATION_TITLE',
            providerId: 'chatgpt-web',
            channelId: 'title-channel',
            prompt: '请帮我梳理事故时间线',
            options: {
                maxLength: 12
            }
        }));
    });

    it('forwards attachments and structured updates for sendMessage', async () => {
        let onMessage: ((message: unknown) => void) | undefined;
        const postMessage = vi.fn((message: { requestId: string; channelId: string; action: string; options?: unknown }) => {
            if (message.action !== 'SEND_MESSAGE') {
                return;
            }

            onMessage?.({
                type: 'UPDATE',
                requestId: message.requestId,
                channelId: message.channelId,
                chunk: {
                    text: '阶段性结果 [1]',
                    annotations: [
                        {
                            kind: 'cite',
                            range: { start: 6, end: 9 },
                            payload: {
                                refId: 'ref-1',
                                label: '[1]'
                            }
                        }
                    ],
                    functionalParts: [
                        {
                            id: 'part-1',
                            kind: 'tool_call',
                            title: 'Tool call',
                            content: '{"name":"lookup"}'
                        }
                    ]
                }
            });
            onMessage?.({
                type: 'DONE',
                requestId: message.requestId,
                channelId: message.channelId,
                result: {
                    text: '阶段性结果 [1]',
                    conversationId: 'conversation-1',
                    messageId: 'message-1',
                    annotations: [
                        {
                            kind: 'cite',
                            range: { start: 6, end: 9 },
                            payload: {
                                refId: 'ref-1',
                                label: '[1]'
                            }
                        }
                    ],
                    functionalParts: [
                        {
                            id: 'part-1',
                            kind: 'tool_call',
                            title: 'Tool call',
                            content: '{"name":"lookup"}'
                        }
                    ]
                }
            });
        });

        // @ts-expect-error simplified test double
        globalThis.chrome = {
            runtime: {
                connect: () => ({
                    postMessage,
                    onDisconnect: { addListener: vi.fn() },
                    onMessage: {
                        addListener: (listener: (message: unknown) => void) => {
                            onMessage = listener;
                        }
                    }
                })
            }
        };

        const provider = new BackgroundProxyProvider('chatgpt-web', { channelId: 'test-channel' });
        const updates: Array<{ text: string; annotations?: unknown[]; functionalParts?: unknown[] }> = [];
        const result = await provider.sendMessage(
            '分析附件',
            {
                modelId: 'gpt-4o',
                modelOptions: {
                    web_search: true
                },
                attachments: [
                    {
                        id: 'attachment-1',
                        type: 'image',
                        name: 'diagram.png',
                        mimeType: 'image/png',
                        size: 128,
                        base64Data: 'c25hcHNob3Q='
                    }
                ]
            },
            (update) => {
                if (typeof update !== 'string') {
                    updates.push(update);
                }
            }
        );

        expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
            action: 'SEND_MESSAGE',
            providerId: 'chatgpt-web',
            channelId: 'test-channel',
            options: expect.objectContaining({
                modelId: 'gpt-4o',
                modelOptions: {
                    web_search: true
                },
                attachments: [
                    expect.objectContaining({
                        id: 'attachment-1',
                        type: 'image'
                    })
                ]
            })
        }));
        expect(updates[0]?.text).toBe('阶段性结果 [1]');
        expect(updates[0]?.functionalParts).toHaveLength(1);
        expect(result.annotations).toHaveLength(1);
        expect(result.functionalParts).toHaveLength(1);
    });
});
