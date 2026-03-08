import { describe, expect, it, vi } from 'vitest';
import { ChatGPTWebProvider, normalizeChatGPTConversationDetail } from './ChatGPTWebProvider';

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
        expect(conversation.sourceType).toBe('chatgpt_web');
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
                { id: 'gpt-4o', name: 'GPT-4o' },
                { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' }
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
                { id: 'auto', name: 'Auto (默认)' },
                { id: 'gpt-4o', name: 'GPT-4o' }
            ],
            defaultModel: 'auto'
        });

        vi.unstubAllGlobals();
    });
});
