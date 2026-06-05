import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type {
    Conversation,
    DeletedConversationStateStore,
    IConversationPersistProvider,
    IModelProvider,
    ProviderStreamUpdate,
    SendMessageOptions,
    SyncDeletedConversation,
    SyncStateStore
} from '@plugins/ai-agent/src/internal';
import { resolveSyncBaseUrl, resolveSyncKey } from '@packages/core/config';
import { SyncStorageProvider as SyncStorageProviderImpl, type SyncStorageProvider } from '../providers/storage/SyncStorageProvider';
import { createApp } from '../../../../apps/server/src/app.js';
import { FetchSyncTransport as FetchSyncTransportImpl } from '../providers/sync/FetchSyncTransport';
import { useChatStore } from './chat';

class MemoryStorageProvider implements IConversationPersistProvider {
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

class MemoryDeletedConversationStateStore implements DeletedConversationStateStore {
    private readonly deletedConversations = new Map<string, SyncDeletedConversation[]>();

    async getDeletedConversations(syncKey: string): Promise<SyncDeletedConversation[]> {
        return (this.deletedConversations.get(syncKey) ?? []).map((conversation) => ({ ...conversation }));
    }

    async setDeletedConversations(syncKey: string, conversations: SyncDeletedConversation[]): Promise<void> {
        this.deletedConversations.set(syncKey, conversations.map((conversation) => ({ ...conversation })));
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

function createSyncStorageProvider(input: {
    env: Record<string, string | undefined>;
    isDevelopment: boolean;
    localStore: IConversationPersistProvider;
    fetchImpl?: typeof fetch;
    stateStore?: SyncStateStore;
    deletedConversationStore?: DeletedConversationStateStore;
}): SyncStorageProvider {
    const syncKey = resolveSyncKey({
        env: input.env,
        isDevelopment: input.isDevelopment
    });

    const transport = new FetchSyncTransportImpl({
        syncKey,
        baseUrl: resolveSyncBaseUrl({ env: input.env }),
        fetchImpl: input.fetchImpl
    });

    return new SyncStorageProviderImpl({
        localStore: input.localStore,
        transport,
        syncKey,
        stateStore: input.stateStore,
        deletedConversationStore: input.deletedConversationStore
    });
}

describe('extension sync bootstrap', () => {
    it('syncs imported history through the real server and propagates hard-deleted conversations', async () => {
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

        const sourceProvider = createSyncStorageProvider({
            env,
            isDevelopment: true,
            localStore: new MemoryStorageProvider(),
            fetchImpl,
            stateStore: new MemorySyncStateStore(),
            deletedConversationStore: new MemoryDeletedConversationStateStore()
        });
        const targetProvider = createSyncStorageProvider({
            env,
            isDevelopment: true,
            localStore: new MemoryStorageProvider(),
            fetchImpl,
            stateStore: new MemorySyncStateStore(),
            deletedConversationStore: new MemoryDeletedConversationStateStore()
        });

        await sourceProvider.saveConversation(createConversation('import-1', 100, {
            origin: 'chatgpt-web',
            externalId: 'history-1'
        }));
        await sourceProvider.saveConversation(createConversation('soft-delete-1', 110));
        await sourceProvider.syncNow();
        await sourceProvider.deleteConversation('soft-delete-1');
        expect(await sourceProvider.getConversation('soft-delete-1')).toBeNull();
        await sourceProvider.syncNow();

        await targetProvider.hydrate();
        expect(await targetProvider.getConversation('soft-delete-1')).toBeNull();

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
        expect(() => createSyncStorageProvider({
            env: {
                WXT_E2E: '1',
                WXT_USE_MOCK_SYNC: '0'
            },
            isDevelopment: false,
            localStore: new MemoryStorageProvider(),
            stateStore: new MemorySyncStateStore(),
            deletedConversationStore: new MemoryDeletedConversationStateStore()
        })).toThrow('syncKey=0 is only allowed in development; configure a real syncKey first.');
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

        const startupProvider = createSyncStorageProvider({
            env,
            isDevelopment: true,
            localStore: new MemoryStorageProvider([
                createConversation('legacy-import', 410, {
                    origin: 'chatgpt-web',
                    externalId: 'history-legacy'
                }),
                createConversation('compare-legacy', 411, {
                    compare: {
                        prompt: 'compare',
                        modelAProviderId: 'a',
                        modelAModelId: 'a1',
                        modelBProviderId: 'b',
                        modelBModelId: 'b1',
                        outputA: 'A',
                        outputB: 'B'
                    }
                })
            ]),
            fetchImpl,
            stateStore: new MemorySyncStateStore(),
            deletedConversationStore: new MemoryDeletedConversationStateStore()
        });

        const verificationProvider = createSyncStorageProvider({
            env,
            isDevelopment: true,
            localStore: new MemoryStorageProvider(),
            fetchImpl,
            stateStore: new MemorySyncStateStore(),
            deletedConversationStore: new MemoryDeletedConversationStateStore()
        });

        await startupProvider.hydrate();
        await verificationProvider.hydrate();

        const conversations = await verificationProvider.getAllConversations();
        expect(conversations.map((conversation) => conversation.id).sort()).toEqual(['legacy-import']);
    });
});
