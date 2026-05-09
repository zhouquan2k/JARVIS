import { describe, expect, it, vi } from 'vitest';
import { ChatGPTWebProvider, normalizeChatGPTConversationDetail } from './ChatGPTWebProvider';

function createSseResponse(events: unknown[]) {
    const encoder = new TextEncoder();
    const chunks = events.map((event) => encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    chunks.push(encoder.encode('data: [DONE]\n\n'));

    return {
        ok: true,
        body: new ReadableStream({
            start(controller) {
                chunks.forEach((chunk) => controller.enqueue(chunk));
                controller.close();
            }
        })
    };
}

describe('normalizeChatGPTConversationDetail', () => {
    it('extracts the main branch from current_node ancestry', () => {
        const conversation = normalizeChatGPTConversationDetail(
            {
                title: 'History Title',
                conversation_id: 'remote-conversation',
                current_node: 'assistant-2',
                update_time: 1_700_000_000,
                mapping: {
                    root: {
                        id: 'root',
                        children: ['system-node']
                    },
                    'system-node': {
                        id: 'system-node',
                        parent: 'root',
                        children: ['user-1'],
                        message: {
                            id: 'system-message',
                            author: { role: 'system' },
                            content: { parts: ['hidden'] }
                        }
                    },
                    'user-1': {
                        id: 'user-1',
                        parent: 'system-node',
                        children: ['assistant-1'],
                        message: {
                            id: 'user-message-1',
                            author: { role: 'user' },
                            content: { parts: ['hello'] }
                        }
                    },
                    'assistant-1': {
                        id: 'assistant-1',
                        parent: 'user-1',
                        children: ['tool-node', 'user-2'],
                        message: {
                            id: 'assistant-message-1',
                            author: { role: 'assistant' },
                            content: { parts: ['world'] }
                        }
                    },
                    'tool-node': {
                        id: 'tool-node',
                        parent: 'assistant-1',
                        children: [],
                        message: {
                            id: 'tool-message',
                            author: { role: 'tool' },
                            content: { parts: ['tool output'] }
                        }
                    },
                    'user-2': {
                        id: 'user-2',
                        parent: 'assistant-1',
                        children: ['assistant-2'],
                        message: {
                            id: 'user-message-2',
                            author: { role: 'user' },
                            content: { parts: ['follow-up'] }
                        }
                    },
                    'assistant-2': {
                        id: 'assistant-2',
                        parent: 'user-2',
                        children: [],
                        message: {
                            id: 'assistant-message-2',
                            author: { role: 'assistant' },
                            content: { parts: ['answer'] }
                        }
                    }
                }
            },
            'fallback-id'
        );

        expect(conversation.externalId).toBe('remote-conversation');
        expect(conversation.backendId).toBe('remote-conversation');
        expect(conversation.origin).toBe('chatgpt-web');
        expect(conversation.messages.map((item) => `${item.role}:${item.content}`)).toEqual([
            'user:hello',
            'assistant:world',
            'user:follow-up',
            'assistant:answer'
        ]);
        expect(conversation.updatedAt).toBe(1_700_000_000_000);
    });

    it('filters non user/assistant nodes and empty content', () => {
        const conversation = normalizeChatGPTConversationDetail(
            {
                title: 'Test',
                id: 'detail-id',
                mapping: {
                    root: {
                        id: 'root',
                        children: ['user']
                    },
                    user: {
                        id: 'user',
                        parent: 'root',
                        children: ['assistant', 'tool'],
                        message: {
                            author: { role: 'user' },
                            content: { parts: ['keep me'] }
                        }
                    },
                    assistant: {
                        id: 'assistant',
                        parent: 'user',
                        children: ['empty-assistant'],
                        message: {
                            author: { role: 'assistant' },
                            content: { parts: ['keep me too'] }
                        }
                    },
                    'empty-assistant': {
                        id: 'empty-assistant',
                        parent: 'assistant',
                        children: [],
                        message: {
                            author: { role: 'assistant' },
                            content: { parts: [''] }
                        }
                    },
                    tool: {
                        id: 'tool',
                        parent: 'user',
                        children: [],
                        message: {
                            author: { role: 'tool' },
                            content: { parts: ['drop me'] }
                        }
                    }
                }
            },
            'fallback-id'
        );

        expect(conversation.backendId).toBe('detail-id');
        expect(conversation.messages).toHaveLength(2);
        expect(conversation.messages.every((item) => item.role === 'user' || item.role === 'assistant')).toBe(true);
    });

    it('normalizes annotations and attachments from history detail', () => {
        const conversation = normalizeChatGPTConversationDetail(
            {
                title: 'Annotated',
                conversation_id: 'annotated-1',
                current_node: 'assistant',
                mapping: {
                    user: {
                        id: 'user',
                        children: ['assistant'],
                        message: {
                            id: 'user-message',
                            author: { role: 'user' },
                            content: {
                                content_type: 'multimodal_text',
                                parts: [
                                    '看一下附件',
                                    {
                                        id: 'file-1',
                                        type: 'file_attachment',
                                        name: 'spec.pdf',
                                        mimeType: 'application/pdf',
                                        size: 1024,
                                        base64Data: 'data:application/pdf;base64,Zm9v'
                                    }
                                ]
                            }
                        }
                    },
                    assistant: {
                        id: 'assistant',
                        parent: 'user',
                        children: [],
                        message: {
                            id: 'assistant-message',
                            author: { role: 'assistant' },
                            content: {
                                parts: ['总结如下 citeref-a']
                            },
                            metadata: {
                                annotations: [
                                    {
                                        kind: 'cite',
                                        ref_id: 'ref-a',
                                        label: '[1]',
                                        title: 'Spec',
                                        url: 'https://example.com/spec'
                                    }
                                ]
                            }
                        }
                    }
                }
            },
            'fallback-id'
        );

        expect(conversation.messages[0]?.attachments?.[0]).toMatchObject({
            id: 'file-1',
            name: 'spec.pdf',
            mimeType: 'application/pdf',
            base64Data: 'Zm9v'
        });
        expect(conversation.messages[1]?.content).toBe('总结如下 [1]');
        expect(conversation.messages[1]?.annotations?.[0]).toMatchObject({
            kind: 'cite',
            payload: {
                refId: 'ref-a',
                label: '[1]'
            }
        });
    });

    it('resolves citation url from nested metadata records by refId', () => {
        const conversation = normalizeChatGPTConversationDetail(
            {
                title: 'Nested refs',
                conversation_id: 'annotated-2',
                current_node: 'assistant',
                mapping: {
                    user: {
                        id: 'user',
                        children: ['assistant'],
                        message: {
                            id: 'user-message',
                            author: { role: 'user' },
                            content: { parts: ['查一下来源'] }
                        }
                    },
                    assistant: {
                        id: 'assistant',
                        parent: 'user',
                        children: [],
                        message: {
                            id: 'assistant-message',
                            author: { role: 'assistant' },
                            content: {
                                parts: ['结果如下 citeturn1search6']
                            },
                            metadata: {
                                search_source_groups: [
                                    {
                                        entries: [
                                            {
                                                id: 'turn1search6',
                                                title: 'Nested Source',
                                                url: 'https://example.com/nested-source',
                                                text: 'Nested snippet'
                                            }
                                        ]
                                    }
                                ]
                            }
                        }
                    }
                }
            },
            'fallback-id'
        );

        expect(conversation.messages[1]?.annotations?.[0]).toMatchObject({
            kind: 'cite',
            payload: {
                refId: 'turn1search6',
                label: '[1]',
                title: 'Nested Source',
                url: 'https://example.com/nested-source',
                snippet: 'Nested snippet'
            }
        });
    });

    it('falls back to default title and fallback external id', () => {
        const conversation = normalizeChatGPTConversationDetail(
            {
                title: '',
                mapping: {
                    root: {
                        id: 'root',
                        children: ['user']
                    },
                    user: {
                        id: 'user',
                        parent: 'root',
                        children: [],
                        message: {
                            author: { role: 'user' },
                            content: { parts: ['hello'] }
                        }
                    }
                }
            },
            'fallback-id'
        );

        expect(conversation.title).toBe('Untitled Conversation');
        expect(conversation.externalId).toBe('fallback-id');
        expect(conversation.backendId).toBe('fallback-id');
    });

    it('extracts model catalog from chat requirements payload', async () => {
        const provider = new ChatGPTWebProvider();
        (provider as { accessToken: string }).accessToken = 'token';
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                models: [
                    { slug: 'gpt-4o', title: 'GPT-4o' },
                    { slug: 'gpt-4.1-mini', title: 'GPT-4.1 Mini' }
                ]
            })
        });
        vi.stubGlobal('fetch', fetchMock);

        await expect(provider.getAvailableModels()).resolves.toEqual({
            models: [
                {
                    id: 'gpt-4o',
                    name: 'GPT-4o',
                    options: [
                        expect.objectContaining({ key: 'web_search', type: 'boolean' }),
                        expect.objectContaining({ key: 'deep_research', type: 'boolean' })
                    ]
                },
                {
                    id: 'gpt-4.1-mini',
                    name: 'GPT-4.1 Mini',
                    options: [
                        expect.objectContaining({ key: 'web_search', type: 'boolean' }),
                        expect.objectContaining({ key: 'deep_research', type: 'boolean' })
                    ]
                }
            ],
            defaultModel: 'gpt-4o'
        });

        vi.unstubAllGlobals();
    });

    it('falls back to static chatgpt catalog when model endpoint does not return model entries', async () => {
        const provider = new ChatGPTWebProvider();
        (provider as { accessToken: string }).accessToken = 'token';
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({})
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({})
            });
        vi.stubGlobal('fetch', fetchMock);

        await expect(provider.getAvailableModels()).resolves.toEqual({
            models: [
                {
                    id: 'auto',
                    name: 'Auto (Default)',
                    nameKey: 'model.autoDefault',
                    options: [
                        expect.objectContaining({ key: 'web_search', type: 'boolean' }),
                        expect.objectContaining({ key: 'deep_research', type: 'boolean' })
                    ]
                },
                {
                    id: 'gpt-4o',
                    name: 'GPT-4o',
                    nameKey: 'model.gpt4o',
                    options: [
                        expect.objectContaining({ key: 'web_search', type: 'boolean' }),
                        expect.objectContaining({ key: 'deep_research', type: 'boolean' })
                    ]
                }
            ],
            defaultModel: 'auto'
        });

        vi.unstubAllGlobals();
    });

    it('returns recent history summaries when query is empty', async () => {
        const requestClient = {
            fetch: vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    items: [
                        {
                            id: 'recent-1',
                            title: 'Recent Chat',
                            update_time: 1_700_000_000
                        }
                    ]
                })
            })
        };
        const provider = new ChatGPTWebProvider({ requestClient });
        (provider as { accessToken: string }).accessToken = 'token';

        await expect(provider.getHistoryList()).resolves.toEqual([
            {
                id: 'recent-1',
                title: 'Recent Chat',
                updatedAt: 1_700_000_000_000,
                origin: 'chatgpt-web'
            }
        ]);
        expect(requestClient.fetch).toHaveBeenCalledWith(
            'https://chatgpt.com/backend-api/conversations?offset=0&limit=28&order=updated',
            expect.objectContaining({
                credentials: 'include',
                headers: expect.objectContaining({
                    Authorization: 'Bearer token'
                })
            })
        );
    });

    it('uses the ChatGPT history search path and normalizes nested result payloads', async () => {
        const requestClient = {
            fetch: vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    results: [
                        {
                            conversation: {
                                id: 'search-1',
                                title: 'Incident Search Result',
                                update_time: 1_700_000_123
                            }
                        }
                    ]
                })
            })
        };
        const provider = new ChatGPTWebProvider({ requestClient });
        (provider as { accessToken: string }).accessToken = 'token';

        await expect(provider.getHistoryList({ query: 'incident' })).resolves.toEqual([
            {
                id: 'search-1',
                title: 'Incident Search Result',
                updatedAt: 1_700_000_123_000,
                origin: 'chatgpt-web'
            }
        ]);
        expect(requestClient.fetch).toHaveBeenCalledWith(
            'https://chatgpt.com/backend-api/conversations/search?query=incident&offset=0&limit=28',
            expect.objectContaining({
                credentials: 'include',
                headers: expect.objectContaining({
                    Authorization: 'Bearer token'
                })
            })
        );
    });

    it('declares no document upload capability', async () => {
        const provider = new ChatGPTWebProvider();

        await expect(provider.getDocumentCapability()).resolves.toEqual({
            acceptedMimeTypes: []
        });
    });

    it('rejects file attachments before sending a conversation request', async () => {
        const provider = new ChatGPTWebProvider();
        (provider as { accessToken: string }).accessToken = 'token';
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ token: 'requirements-token' })
        });
        vi.stubGlobal('fetch', fetchMock);

        await expect(provider.sendMessage(
            '看看附件',
            {
                attachments: [
                    {
                        id: 'attachment-1',
                        type: 'image',
                        name: 'diagram.png',
                        mimeType: 'image/png',
                        size: 42,
                        base64Data: 'c25hcHNob3Q='
                    }
                ]
            },
            () => undefined
        )).rejects.toThrow('ChatGPT Web provider does not support file attachments.');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0]?.[0]).toBe('https://chatgpt.com/backend-api/sentinel/chat-requirements');

        vi.unstubAllGlobals();
    });

    it('sends text payload and normalizes cite/image_group updates', async () => {
        const provider = new ChatGPTWebProvider();
        (provider as { accessToken: string }).accessToken = 'token';
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ token: 'requirements-token' })
            })
            .mockResolvedValueOnce(
                createSseResponse([
                    {
                        conversation_id: 'conversation-123',
                        message: {
                            id: 'message-123',
                            content: {
                                parts: ['答案如下 citeref-a\nimage_groupgallery-1']
                            },
                            metadata: {
                                annotations: [
                                    {
                                        kind: 'cite',
                                        ref_id: 'ref-a',
                                        label: '[1]',
                                        title: 'Source A',
                                        url: 'https://example.com/a'
                                    },
                                    {
                                        kind: 'image_group',
                                        group_id: 'gallery-1',
                                        images: [
                                            {
                                                id: 'img-1',
                                                mime_type: 'image/png',
                                                preview_base64: 'data:image/png;base64,aW1hZ2U=',
                                                width: 256,
                                                height: 256
                                            }
                                        ]
                                    }
                                ]
                            }
                        }
                    }
                ])
            );
        vi.stubGlobal('fetch', fetchMock);

        const updates: Array<{ text: string; annotations?: unknown[]; functionalParts?: unknown[] }> = [];
        const result = await provider.sendMessage(
            '看看来源',
            {
                modelId: 'gpt-4o',
                modelOptions: { web_search: true }
            },
            (update) => updates.push(update)
        );

        expect(fetchMock).toHaveBeenCalledTimes(2);
        const requestBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
        expect(requestBody.model).toBe('gpt-4o');
        expect(requestBody.conversation_mode).toEqual({ kind: 'primary_assistant' });
        expect(requestBody.client_contextual_info).toEqual({ use_search: true });
        expect(requestBody.messages[0]?.content).toEqual({
            content_type: 'text',
            parts: ['看看来源']
        });

        expect(updates[0]?.text).toBe('答案如下 [1]');
        expect(updates[0]?.functionalParts).toEqual([
            expect.objectContaining({
                kind: 'search',
                title: 'Source A'
            })
        ]);
        expect(result.text).toBe('答案如下 [1]');
        expect(result.functionalParts).toEqual([
            expect.objectContaining({
                kind: 'search',
                title: 'Source A'
            })
        ]);
        expect(result.annotations).toEqual([
            expect.objectContaining({
                kind: 'cite',
                payload: expect.objectContaining({
                    refId: 'ref-a',
                    label: '[1]'
                })
            }),
            expect.objectContaining({
                kind: 'image_group',
                payload: expect.objectContaining({
                    groupId: 'gallery-1'
                })
            })
        ]);

        vi.unstubAllGlobals();
    });

    it('translates deep research option into chatgpt request mode', async () => {
        const provider = new ChatGPTWebProvider();
        (provider as { accessToken: string }).accessToken = 'token';
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ token: 'requirements-token' })
            })
            .mockResolvedValueOnce(
                createSseResponse([
                    {
                        conversation_id: 'conversation-123',
                        message: {
                            id: 'message-123',
                            content: {
                                parts: ['研究结果']
                            }
                        }
                    }
                ])
            );
        vi.stubGlobal('fetch', fetchMock);

        const result = await provider.sendMessage(
            '做研究',
            {
                modelId: 'gpt-4o',
                modelOptions: { deep_research: true }
            },
            () => undefined
        );

        const requestBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
        expect(requestBody.conversation_mode).toEqual({ kind: 'research' });
        expect(requestBody.client_contextual_info).toEqual({ is_deep_research: true });
        expect(result.functionalParts).toBeUndefined();

        vi.unstubAllGlobals();
    });

    it('resolves citation url from nested metadata during streaming updates', async () => {
        const provider = new ChatGPTWebProvider();
        (provider as { accessToken: string }).accessToken = 'token';
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ token: 'requirements-token' })
            })
            .mockResolvedValueOnce(
                createSseResponse([
                    {
                        conversation_id: 'conversation-debug',
                        message: {
                            id: 'message-debug',
                            content: {
                                parts: ['答案如下 citeturn1search6']
                            },
                            metadata: {
                                annotations: [
                                    {
                                        kind: 'cite',
                                        ref_id: 'turn1search6',
                                        label: '[1]'
                                    }
                                ],
                                search_source_groups: [
                                    {
                                        entries: [
                                            {
                                                id: 'turn1search6',
                                                title: 'Nested Stream Source',
                                                url: 'https://example.com/stream-source',
                                                text: 'Stream snippet'
                                            }
                                        ]
                                    }
                                ]
                            }
                        }
                    }
                ])
            );
        vi.stubGlobal('fetch', fetchMock);

        const result = await provider.sendMessage('看看来源', {}, () => undefined);

        expect(result.annotations).toEqual([
            expect.objectContaining({
                kind: 'cite',
                payload: expect.objectContaining({
                    refId: 'turn1search6',
                    label: '[1]',
                    title: 'Nested Stream Source',
                    url: 'https://example.com/stream-source',
                    snippet: 'Stream snippet'
                })
            })
        ]);
        expect(result.functionalParts).toEqual([
            expect.objectContaining({
                id: 'chatgpt-search-turn1search6',
                kind: 'search',
                title: 'Nested Stream Source'
            })
        ]);

        vi.unstubAllGlobals();
    });

    it('prefers injected request client and cookie store in host environments', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ accessToken: 'desktop-token' })
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ token: 'requirements-token' })
            })
            .mockResolvedValueOnce(
                createSseResponse([
                    {
                        conversation_id: 'desktop-conversation',
                        message: {
                            id: 'desktop-message',
                            content: {
                                parts: ['桌面端结果']
                            }
                        }
                    }
                ])
            );
        const cookieStore = {
            get: vi.fn().mockResolvedValue({ value: 'desktop-device-id' })
        };
        const provider = new ChatGPTWebProvider({
            requestClient: { fetch: fetchMock },
            cookieStore,
            userAgent: 'Desktop UA'
        });

        await expect(provider.checkAuth()).resolves.toBe(true);
        await expect(provider.sendMessage('桌面端请求', { modelId: 'gpt-4o' }, () => undefined)).resolves.toMatchObject({
            text: '桌面端结果',
            conversationId: 'desktop-conversation',
            messageId: 'desktop-message'
        });

        expect(cookieStore.get).toHaveBeenCalledWith({ url: 'https://chatgpt.com', name: 'oai-did' });
        expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({
            'OAI-Device-Id': 'desktop-device-id'
        });
        expect(fetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({
            'OAI-Device-Id': 'desktop-device-id'
        });
    });

    it('generates a normalized conversation title with a dedicated low-cost model path', async () => {
        const requestClient = {
            fetch: vi.fn()
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ token: 'requirements-token' })
                })
                .mockResolvedValueOnce(
                    createSseResponse([
                        {
                            message: {
                                id: 'title-message',
                                content: {
                                    parts: ['"事故时间线梳理"']
                                }
                            }
                        }
                    ])
                )
        };

        const provider = new ChatGPTWebProvider({ requestClient });
        (provider as { accessToken: string }).accessToken = 'token';
        vi.stubGlobal('fetch', requestClient.fetch);

        await expect(provider.generateConversationTitle?.('请帮我梳理事故时间线和修复步骤', { maxLength: 12 })).resolves.toBe('事故时间线梳理');

        expect(requestClient.fetch).toHaveBeenCalledTimes(2);
        const requestBody = JSON.parse(String(requestClient.fetch.mock.calls[1]?.[1]?.body));
        expect(requestBody.model).toBe('gpt-4o-mini');
        expect(requestBody.messages[0]?.content.parts[0]).toContain('Generate a concise conversation title');

        vi.unstubAllGlobals();
    });
});
