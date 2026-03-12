import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { Conversation, ConversationHistorySummary, IHistoryProvider, IModelProvider, IStorageProvider } from '@packages/core/src';
import type { ProviderConfig } from '@packages/core/config';
import { useChatStore } from './chat';

class MockModelProvider implements IModelProvider {
    id = 'mock-provider';
    optionsUsed: Array<Record<string, unknown>> = [];

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
        _options = {},
        onUpdate: (update: { text: string }) => void
    ): Promise<{ text: string; conversationId: string; messageId: string }> {
        this.optionsUsed.push(_options as Record<string, unknown>);
        const text = `reply:${prompt}`;
        onUpdate({
            text,
            annotations: [
                {
                    kind: 'cite',
                    range: { start: 0, end: text.length },
                    payload: {
                        refId: 'ref-1',
                        label: '[1]'
                    }
                }
            ]
        });
        return {
            text,
            conversationId: 'conversation-id',
            messageId: 'message-id',
            annotations: [
                {
                    kind: 'cite',
                    range: { start: 0, end: text.length },
                    payload: {
                        refId: 'ref-1',
                        label: '[1]'
                    }
                }
            ]
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

class DeferredHistoryProvider extends MockHistoryProvider {
    private pendingResolve: (() => void) | null = null;

    async getHistoryDetail(externalId: string): Promise<Conversation> {
        await new Promise<void>((resolve) => {
            this.pendingResolve = resolve;
        });

        return super.getHistoryDetail(externalId);
    }

    resolvePendingDetail() {
        this.pendingResolve?.();
        this.pendingResolve = null;
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
                origin: 'chatgpt-web',
                externalId: 'remote-1',
                backendId: 'remote-1',
                updatedAt: 3,
                messages: []
            }
        ]);
        const history = new MockHistoryProvider(
            [
                { id: 'remote-1', title: 'Imported chat', updatedAt: 2, origin: 'chatgpt-web' },
                { id: 'remote-2', title: 'Fresh chat', updatedAt: 1, origin: 'chatgpt-web' }
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
            origin: 'chatgpt-web',
            externalId: 'remote-1',
            backendId: 'remote-1',
            updatedAt: 100,
            messages: [
                { id: 'm1', role: 'user', content: 'hello' }
            ]
        };
        const storage = new MockStorageProvider([existingConversation]);
        const history = new MockHistoryProvider(
            [{ id: 'remote-1', title: 'Imported chat', updatedAt: 90, origin: 'chatgpt-web' }],
            {
                'remote-1': {
                    id: 'preview-1',
                    title: 'Imported chat',
                    origin: 'chatgpt-web',
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
        await store.previewExternalConversation('chatgpt-web', 'remote-1');
        expect(store.workspaceMode).toBe('preview');
        expect(store.previewConversation?.externalId).toBe('remote-1');

        await store.importPreviewConversation();

        expect(store.workspaceMode).toBe('active');
        expect(store.historySource).toBe('local');
        expect(store.currentConversation?.id).toBe('local-existing');
        expect((await storage.getAllConversations()).length).toBe(1);
    });

    it('tracks the loading external item while preview detail is pending', async () => {
        const storage = new MockStorageProvider([]);
        const history = new DeferredHistoryProvider(
            [{ id: 'remote-1', title: 'Imported chat', updatedAt: 90, origin: 'chatgpt-web' }],
            {
                'remote-1': {
                    id: 'preview-1',
                    title: 'Imported chat',
                    origin: 'chatgpt-web',
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
        const loadingPromise = store.previewExternalConversation('chatgpt-web', 'remote-1');

        expect(store.isExternalPreviewLoading).toBe(true);
        expect(store.externalPreviewLoadingId).toBe('remote-1');

        history.resolvePendingDetail();
        await loadingPromise;

        expect(store.isExternalPreviewLoading).toBe(false);
        expect(store.externalPreviewLoadingId).toBeNull();
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

    it('queues attachments, sends them with the prompt, and persists assistant annotations', async () => {
        const provider = new MockModelProvider();
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(provider, storage);
        await store.initializeProviderCatalog(providerCatalog);

        const file = {
            name: 'diagram.png',
            type: 'image/png',
            size: 3,
            async arrayBuffer() {
                return new Uint8Array([1, 2, 3]).buffer;
            }
        } as File;

        await store.queueAttachments([file]);
        expect(store.draftAttachments).toHaveLength(1);
        expect(store.draftAttachments[0]).toMatchObject({
            type: 'image',
            name: 'diagram.png',
            previewBase64: 'AQID'
        });

        await store.sendMessage('请分析');

        expect(provider.optionsUsed[0]?.attachments).toEqual([
            expect.objectContaining({
                name: 'diagram.png',
                mimeType: 'image/png',
                base64Data: 'AQID'
            })
        ]);
        expect(store.draftAttachments).toHaveLength(0);
        expect(store.currentConversation?.messages[0]).toMatchObject({
            role: 'user',
            content: '请分析',
            attachments: [
                expect.objectContaining({
                    name: 'diagram.png'
                })
            ]
        });
        expect(store.currentConversation?.messages[1]?.annotations).toEqual([
            expect.objectContaining({
                kind: 'cite'
            })
        ]);
    });

    it('imports external files and preserves origin metadata', async () => {
        const storage = new MockStorageProvider([]);
        const store = useChatStore();
        store.setProviders(new MockModelProvider(), storage);
        store.setHistoryProviders([
            {
                id: 'external-file',
                label: '外部文件导入',
                kind: 'file-import'
            }
        ]);
        store.setExternalFileImportHandler(async () => ({
            id: 'file-preview',
            title: 'Imported File Chat',
            origin: 'external-file',
            externalId: 'file-1',
            backendId: 'file-1',
            updatedAt: 50,
            messages: [
                { id: 'm1', role: 'user', content: 'from file' }
            ]
        }));

        await store.setHistorySource('external');

        expect(store.historySource).toBe('local');
        expect(store.currentConversation?.title).toBe('Imported File Chat');
        expect(store.currentConversation?.origin).toBe('external-file');
        expect((await storage.getAllConversations())[0]?.origin).toBe('external-file');
    });

    it('marks external history loading while provider history is being fetched', async () => {
        let resolveHistoryList: ((value: ConversationHistorySummary[]) => void) | null = null;
        const historyProvider: IHistoryProvider = {
            id: 'chatgpt-web',
            getHistoryList() {
                return new Promise((resolve) => {
                    resolveHistoryList = resolve;
                });
            },
            async getHistoryDetail() {
                throw new Error('not used');
            }
        };

        const store = useChatStore();
        store.setProviders(new MockModelProvider(), new MockStorageProvider([]));
        store.setHistoryProviders([
            {
                id: 'chatgpt-web',
                label: 'ChatGPT',
                kind: 'history-provider',
                provider: historyProvider
            }
        ]);

        const pending = store.setHistorySource('external');
        expect(store.isExternalHistoryLoading).toBe(true);
        expect(store.externalHistoryItems).toEqual([]);

        resolveHistoryList?.([
            { id: 'remote-1', title: 'Remote Chat', updatedAt: 1, origin: 'chatgpt-web' }
        ]);
        await pending;

        expect(store.isExternalHistoryLoading).toBe(false);
        expect(store.externalHistoryItems).toHaveLength(1);
    });
});
