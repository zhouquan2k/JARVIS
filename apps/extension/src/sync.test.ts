import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useChatStore } from '@packages/ui';
import type {
    Conversation,
    IModelProvider,
    IStorageProvider,
    ProviderStreamUpdate,
    SendMessageOptions,
    SyncStateStore
} from '@packages/core/src';
import { createApp } from '../../server/src/app.js';
import { createExtensionSyncStorageProvider } from './sync';

class MemoryStorageProvider implements IStorageProvider {
    id = 'memory-storage';

    private readonly conversations = new Map<string, Conversation>();

    constructor(initialConversations: Conversation[] = []) {
        initialConversations.forEach((conversation) => {
            this.conversations.set(conversation.id, structuredClone(conversation));
        });
    }

    async saveConversation(chat: Conversation): Promise<void> {
        this.conversations.set(chat.id, structuredClone(chat));
    }

    async getConversation(id: string): Promise<Conversation | null> {
        return this.conversations.has(id) ? structuredClone(this.conversations.get(id)!) : null;
    }

    async getAllConversations(): Promise<Conversation[]> {
        return Array.from(this.conversations.values()).map((conversation) => structuredClone(conversation));
    }

    async deleteConversation(id: string): Promise<void> {
        this.conversations.delete(id);
    }
}

class MemorySyncStateStore implements SyncStateStore {
    private readonly cursors = new Map<string, number | null>();

    async getCursor(syncKey: string): Promise<number | null> {
        return this.cursors.get(syncKey) ?? null;
    }

    async setCursor(syncKey: string, cursor: number | null): Promise<void> {
        this.cursors.set(syncKey, cursor);
    }
}

const dummyModelProvider: IModelProvider = {
    id: 'dummy',
    async getAvailableModels() {
        return {
            models: [{ id: 'dummy-model', name: 'Dummy Model' }],
            defaultModel: 'dummy-model'
        };
    },
    async checkAuth() {
        return true;
    },
    async sendMessage(_prompt: string, _options: SendMessageOptions, _onUpdate: (update: ProviderStreamUpdate) => void) {
        return {
            text: 'ok',
            conversationId: 'dummy-conversation',
            messageId: 'dummy-message'
        };
    },
    abort() {}
};

function createFetchImpl(app: ReturnType<typeof createApp>): typeof fetch {
    return ((input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === 'string'
            ? input
            : input instanceof URL
                ? input.toString()
                : input.url;
        return app.request(url, init);
    }) as typeof fetch;
}

function createConversation(id: string, updatedAt: number, extra: Partial<Conversation> = {}): Conversation {
    return {
        id,
        title: `Conversation ${id}`,
        updatedAt,
        messages: [
            {
                id: `${id}-m1`,
                role: 'user',
                content: `message:${id}`
            }
        ],
        ...extra
    };
}

describe('extension sync bootstrap', () => {
    it('syncs imported history through the real server and keeps soft-deleted conversations hidden', async () => {
        const app = createApp({
            config: {
                port: 8787,
                dbPath: ':memory:',
                isDevelopment: true,
                corsAllowlist: []
            }
        });
        const fetchImpl = createFetchImpl(app);
        const env = {
            WXT_E2E: '1',
            WXT_USE_MOCK_SYNC: '0',
            WXT_SYNC_KEY: 'extension-live',
            WXT_SYNC_BASE_URL: 'http://sync.test/api/sync'
        };

        const sourceProvider = createExtensionSyncStorageProvider({
            env,
            isDevelopment: true,
            localStore: new MemoryStorageProvider(),
            fetchImpl,
            stateStore: new MemorySyncStateStore()
        });
        const targetProvider = createExtensionSyncStorageProvider({
            env,
            isDevelopment: true,
            localStore: new MemoryStorageProvider(),
            fetchImpl,
            stateStore: new MemorySyncStateStore()
        });

        await sourceProvider.saveConversation(createConversation('import-1', 100, {
            sourceType: 'external',
            externalId: 'history-1'
        }));
        await sourceProvider.saveConversation(createConversation('soft-delete-1', 110));
        await sourceProvider.syncNow();
        await sourceProvider.deleteConversation('soft-delete-1');
        await sourceProvider.syncNow();

        await targetProvider.hydrate();

        setActivePinia(createPinia());
        const chatStore = useChatStore();
        chatStore.setProviders(dummyModelProvider, targetProvider);
        await chatStore.loadLocalConversations();

        expect(chatStore.conversations).toHaveLength(1);
        expect(chatStore.conversations[0].id).toBe('import-1');
        expect(chatStore.conversations[0].externalId).toBe('history-1');
        expect(chatStore.conversations.some((conversation) => conversation.id === 'soft-delete-1')).toBe(false);
    });

    it('rejects syncKey=0 outside development when wiring the real server transport', () => {
        expect(() => createExtensionSyncStorageProvider({
            env: {
                WXT_E2E: '1',
                WXT_USE_MOCK_SYNC: '0'
            },
            isDevelopment: false,
            localStore: new MemoryStorageProvider(),
            stateStore: new MemorySyncStateStore()
        })).toThrow('syncKey=0 仅允许在开发环境使用');
    });

    it('pushes pre-existing local unsynced conversations to the server on every startup', async () => {
        const app = createApp({
            config: {
                port: 8787,
                dbPath: ':memory:',
                isDevelopment: true,
                corsAllowlist: []
            }
        });
        const fetchImpl = createFetchImpl(app);
        const env = {
            WXT_E2E: '1',
            WXT_USE_MOCK_SYNC: '0',
            WXT_SYNC_KEY: 'extension-backlog',
            WXT_SYNC_BASE_URL: 'http://sync.test/api/sync'
        };

        const startupProvider = createExtensionSyncStorageProvider({
            env,
            isDevelopment: true,
            localStore: new MemoryStorageProvider([
                createConversation('legacy-import', 410, {
                    sourceType: 'external',
                    externalId: 'history-legacy'
                }),
                createConversation('compare-legacy', 411, {
                    compare: {
                        prompt: 'compare',
                        modelAProviderId: 'a',
                        modelAModelId: 'a1',
                        modelBProviderId: 'b',
                        modelBModelId: 'b1',
                        outputA: 'alpha',
                        outputB: 'beta',
                        analysisResult: {
                            agreements: 'same',
                            conflictsA: 'alpha',
                            conflictsB: 'beta',
                            uniqueA: 'alpha-only',
                            uniqueB: 'beta-only'
                        }
                    }
                })
            ]),
            fetchImpl,
            stateStore: new MemorySyncStateStore()
        });
        const readerProvider = createExtensionSyncStorageProvider({
            env,
            isDevelopment: true,
            localStore: new MemoryStorageProvider(),
            fetchImpl,
            stateStore: new MemorySyncStateStore()
        });

        await startupProvider.hydrate();
        await readerProvider.hydrate();

        setActivePinia(createPinia());
        const chatStore = useChatStore();
        chatStore.setProviders(dummyModelProvider, readerProvider);
        await chatStore.loadLocalConversations();

        expect(chatStore.conversations).toHaveLength(1);
        expect(chatStore.conversations[0].id).toBe('legacy-import');
        expect(chatStore.conversations[0].externalId).toBe('history-legacy');
    });
});
