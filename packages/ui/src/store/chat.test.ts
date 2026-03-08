import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { Conversation, ConversationHistorySummary, IHistoryProvider, IModelProvider, IStorageProvider } from '@packages/core/src';
import type { ProviderConfig } from '@packages/core/config';
import { useChatStore } from './chat';

class MockModelProvider implements IModelProvider {
    id = 'mock-provider';

    async getAvailableModels() {
        return {
            models: [{ id: 'mock-model', name: 'Mock Model' }],
            defaultModel: 'mock-model'
        };
    }

    async checkAuth(): Promise<boolean> {
        return true;
    }

    async sendMessage(
        prompt: string,
        _options: { modelId?: string } = {},
        onUpdate: (chunk: string) => void
    ): Promise<{ text: string; conversationId: string; messageId: string }> {
        const text = `reply:${prompt}`;
        onUpdate(text);
        return {
            text,
            conversationId: 'conversation-id',
            messageId: 'message-id'
        };
    }

    abort(): void {}
}

class MockStorageProvider implements IStorageProvider {
    id = 'mock-storage';

    constructor(private readonly conversations: Conversation[]) {}

    async saveConversation(chat: Conversation): Promise<void> {
        const index = this.conversations.findIndex((item) => item.id === chat.id);
        if (index === -1) {
            this.conversations.unshift(chat);
            return;
        }
        this.conversations[index] = chat;
    }

    async getConversation(id: string): Promise<Conversation | null> {
        return this.conversations.find((item) => item.id === id) || null;
    }

    async getAllConversations(): Promise<Conversation[]> {
        return [...this.conversations].sort((a, b) => b.updatedAt - a.updatedAt);
    }

    async deleteConversation(id: string): Promise<void> {
        const index = this.conversations.findIndex((item) => item.id === id);
        if (index >= 0) {
            this.conversations.splice(index, 1);
        }
    }
}

class MockHistoryProvider implements IHistoryProvider {
    id = 'chatgpt-web';

    constructor(
        private readonly summaries: ConversationHistorySummary[],
        private readonly details: Record<string, Conversation>
    ) {}

    async getHistoryList(): Promise<ConversationHistorySummary[]> {
        return this.summaries.map((item) => ({ ...item }));
    }

    async getHistoryDetail(externalId: string): Promise<Conversation> {
        const detail = this.details[externalId];
        if (!detail) {
            throw new Error(`Missing conversation ${externalId}`);
        }
        return {
            ...detail,
            messages: detail.messages.map((message) => ({ ...message }))
        };
    }
}

describe('useChatStore workspace history flow', () => {
    const providerCatalog: ProviderConfig[] = [
        {
            id: 'mock-provider',
            name: 'Mock Provider',
            models: [{ id: 'static-model', name: 'Static Model' }],
            defaultModel: 'static-model',
            supportedRuntimeModes: ['web']
        },
        {
            id: 'other-provider',
            name: 'Other Provider',
            models: [{ id: 'other-static', name: 'Other Static' }],
            defaultModel: 'other-static',
            supportedRuntimeModes: ['web']
        }
    ];

    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('marks imported external history items from local metadata', async () => {
        const storage = new MockStorageProvider([
            {
                id: 'local-1',
                title: 'Imported chat',
                sourceType: 'chatgpt_web',
                externalId: 'remote-1',
                backendId: 'remote-1',
                updatedAt: 3,
                messages: []
            }
        ]);
        const history = new MockHistoryProvider(
            [
                { id: 'remote-1', title: 'Imported chat', updatedAt: 2, sourceType: 'chatgpt_web' },
                { id: 'remote-2', title: 'Fresh chat', updatedAt: 1, sourceType: 'chatgpt_web' }
            ],
            {}
        );

        const store = useChatStore();
        store.setProviders(new MockModelProvider(), storage, history);

        await store.init();
        await store.loadExternalHistory();

        expect(store.externalHistoryItems.map((item) => ({ id: item.id, imported: item.isImported }))).toEqual([
            { id: 'remote-1', imported: true },
            { id: 'remote-2', imported: false }
        ]);
    });

    it('reuses existing imported conversation instead of duplicating it', async () => {
        const existingConversation: Conversation = {
            id: 'local-existing',
            title: 'Imported chat',
            sourceType: 'chatgpt_web',
            externalId: 'remote-1',
            backendId: 'remote-1',
            updatedAt: 100,
            messages: [
                { id: 'm1', role: 'user', content: 'hello' }
            ]
        };
        const storage = new MockStorageProvider([existingConversation]);
        const history = new MockHistoryProvider(
            [{ id: 'remote-1', title: 'Imported chat', updatedAt: 90, sourceType: 'chatgpt_web' }],
            {
                'remote-1': {
                    id: 'preview-1',
                    title: 'Imported chat',
                    sourceType: 'chatgpt_web',
                    externalId: 'remote-1',
                    backendId: 'remote-1',
                    updatedAt: 90,
                    messages: [
                        { id: 'pm1', role: 'user', content: 'preview' }
                    ]
                }
            }
        );

        const store = useChatStore();
        store.setProviders(new MockModelProvider(), storage, history);

        await store.init();
        await store.previewExternalConversation('remote-1');
        expect(store.workspaceMode).toBe('preview');
        expect(store.previewConversation?.externalId).toBe('remote-1');

        await store.importPreviewConversation();

        expect(store.workspaceMode).toBe('active');
        expect(store.historySource).toBe('local');
        expect(store.currentConversation?.id).toBe('local-existing');
        expect((await storage.getAllConversations()).length).toBe(1);
    });

    it('loads provider-driven model catalogs before enabling selections', async () => {
        const store = useChatStore();
        store.setProviders(new MockModelProvider(), new MockStorageProvider([]));
        store.setProviderModelsResolver(async (providerId: string) => {
            if (providerId === 'mock-provider') {
                return {
                    models: [{ id: 'dynamic-model', name: 'Dynamic Model' }],
                    defaultModel: 'dynamic-model'
                };
            }

            return {
                models: [{ id: 'other-dynamic', name: 'Other Dynamic' }],
                defaultModel: 'other-dynamic'
            };
        });

        await store.initializeProviderCatalog(providerCatalog);
        expect(store.currentProviderId).toBe('mock-provider');
        expect(store.currentModelId).toBe('dynamic-model');
        expect(store.isCurrentProviderModelsLoading).toBe(false);

        await store.setCurrentModelProvider('other-provider');
        expect(store.currentProviderId).toBe('other-provider');
        expect(store.currentModelId).toBe('other-dynamic');
    });
});
