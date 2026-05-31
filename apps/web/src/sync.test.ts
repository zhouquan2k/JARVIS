import { describe, expect, it } from 'vitest';
import type {
    Conversation,
    DeletedConversationStateStore,
    IConversationPersistProvider,
    SyncDeletedConversation,
    SyncStateStore
} from '@packages/core/src';
import { createApp } from '../../server/src/app.js';
import { createWebSyncStorageProvider, resetWebSyncCache } from './sync';

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

    async clear(): Promise<void> {
        this.conversations.clear();
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

    async clear(): Promise<void> {
        this.cursors.clear();
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

    async clear(): Promise<void> {
        this.deletedConversations.clear();
    }
}

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

describe('web sync bootstrap', () => {
    it('syncs normal and imported conversations against the real server while keeping compare local-only', async () => {
        const app = createApp({
            config: {
                port: 8787,
                dbPath: ':memory:',
                isDevelopment: true,
                corsAllowlist: [],
                contextBackend: 'database',
                codexCommand: 'codex',
                codexWorkingDirectory: process.cwd()
            }
        });
        const fetchImpl = createFetchImpl(app);
        const env = {
            VITE_E2E: '1',
            VITE_USE_MOCK_SYNC: '0',
            VITE_SYNC_KEY: 'web-live',
            VITE_SYNC_BASE_URL: 'http://sync.test/api/sync'
        };

        const sourceProvider = createWebSyncStorageProvider({
            env,
            isDevelopment: true,
            localStore: new MemoryStorageProvider(),
            fetchImpl,
            stateStore: new MemorySyncStateStore(),
            deletedConversationStore: new MemoryDeletedConversationStateStore()
        });
        const targetProvider = createWebSyncStorageProvider({
            env,
            isDevelopment: true,
            localStore: new MemoryStorageProvider(),
            fetchImpl,
            stateStore: new MemorySyncStateStore(),
            deletedConversationStore: new MemoryDeletedConversationStateStore()
        });

        await sourceProvider.saveConversation(createConversation('normal-1', 100));
        await sourceProvider.saveConversation(createConversation('import-1', 110, {
            origin: 'chatgpt-web',
            externalId: 'external-42'
        }));
        await sourceProvider.saveConversation(createConversation('compare-1', 120, {
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
        }));

        await sourceProvider.syncNow();
        await targetProvider.hydrate();

        const conversations = await targetProvider.getAllConversations();
        expect(conversations.map((item) => item.id).sort()).toEqual(['import-1', 'normal-1']);
        expect(conversations.find((item) => item.id === 'import-1')?.externalId).toBe('external-42');
        expect(conversations.some((item) => item.compare)).toBe(false);
    });

    it('rejects syncKey=0 outside development when wiring the real server transport', () => {
        expect(() => createWebSyncStorageProvider({
            env: {
                VITE_E2E: '1',
                VITE_USE_MOCK_SYNC: '0'
            },
            isDevelopment: false,
            localStore: new MemoryStorageProvider(),
            stateStore: new MemorySyncStateStore(),
            deletedConversationStore: new MemoryDeletedConversationStateStore()
        })).toThrow('syncKey=0 is only allowed in development; configure a real syncKey first.');
    });

    it('resets local web sync cache including conversations and sync metadata', async () => {
        const localStore = new MemoryStorageProvider([
            createConversation('cached-1', 100)
        ]);
        const stateStore = new MemorySyncStateStore();
        const deletedConversationStore = new MemoryDeletedConversationStateStore();
        await stateStore.setCursor('web-reset', 17);
        await deletedConversationStore.setDeletedConversations('web-reset', [
            {
                id: 'deleted-1',
                updatedAt: 12
            }
        ]);

        await resetWebSyncCache({
            env: {
                VITE_E2E: '1',
                VITE_USE_MOCK_SYNC: '1',
                VITE_SYNC_KEY: 'web-reset'
            },
            isDevelopment: true,
            localStore,
            stateStore,
            deletedConversationStore
        });

        expect(await localStore.getAllConversations()).toEqual([]);
        expect(await stateStore.getCursor('web-reset')).toBeNull();
        expect(await deletedConversationStore.getDeletedConversations('web-reset')).toEqual([]);
    });

    it('pushes pre-existing local unsynced conversations to the server on startup', async () => {
        const app = createApp({
            config: {
                port: 8787,
                dbPath: ':memory:',
                isDevelopment: true,
                corsAllowlist: [],
                contextBackend: 'database',
                codexCommand: 'codex',
                codexWorkingDirectory: process.cwd()
            }
        });
        const fetchImpl = createFetchImpl(app);
        const env = {
            VITE_E2E: '1',
            VITE_USE_MOCK_SYNC: '0',
            VITE_SYNC_KEY: 'web-backlog',
            VITE_SYNC_BASE_URL: 'http://sync.test/api/sync'
        };

        const startupProvider = createWebSyncStorageProvider({
            env,
            isDevelopment: true,
            localStore: new MemoryStorageProvider([
                createConversation('legacy-1', 300),
                createConversation('compare-legacy', 301, {
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
            stateStore: new MemorySyncStateStore(),
            deletedConversationStore: new MemoryDeletedConversationStateStore()
        });
        const remoteReader = createWebSyncStorageProvider({
            env,
            isDevelopment: true,
            localStore: new MemoryStorageProvider(),
            fetchImpl,
            stateStore: new MemorySyncStateStore(),
            deletedConversationStore: new MemoryDeletedConversationStateStore()
        });

        await startupProvider.hydrate();
        await remoteReader.hydrate();

        const conversations = await remoteReader.getAllConversations();
        expect(conversations.map((item) => item.id)).toEqual(['legacy-1']);
        expect(conversations[0].sync?.dirty).toBe(false);
        expect(conversations[0].updatedAt).toBe(300);
    });

    it('hydrates startup conversations that contain an empty assistant placeholder without sync 400', async () => {
        const app = createApp({
            config: {
                port: 8787,
                dbPath: ':memory:',
                isDevelopment: true,
                corsAllowlist: [],
                contextBackend: 'database',
                codexCommand: 'codex',
                codexWorkingDirectory: process.cwd()
            }
        });
        const fetchImpl = createFetchImpl(app);
        const env = {
            VITE_E2E: '1',
            VITE_USE_MOCK_SYNC: '0',
            VITE_SYNC_KEY: 'web-placeholder',
            VITE_SYNC_BASE_URL: 'http://sync.test/api/sync'
        };

        const startupProvider = createWebSyncStorageProvider({
            env,
            isDevelopment: true,
            localStore: new MemoryStorageProvider([
                createConversation('placeholder-1', 300, {
                    messages: [
                        {
                            id: 'placeholder-1-user',
                            role: 'user',
                            content: 'hello'
                        },
                        {
                            id: 'placeholder-1-assistant',
                            role: 'assistant',
                            content: ''
                        }
                    ]
                })
            ]),
            fetchImpl,
            stateStore: new MemorySyncStateStore(),
            deletedConversationStore: new MemoryDeletedConversationStateStore()
        });
        const remoteReader = createWebSyncStorageProvider({
            env,
            isDevelopment: true,
            localStore: new MemoryStorageProvider(),
            fetchImpl,
            stateStore: new MemorySyncStateStore(),
            deletedConversationStore: new MemoryDeletedConversationStateStore()
        });

        await expect(startupProvider.hydrate()).resolves.toBeUndefined();
        await remoteReader.hydrate();

        const conversations = await remoteReader.getAllConversations();
        expect(conversations.map((item) => item.id)).toEqual(['placeholder-1']);
        expect(conversations[0].messages).toEqual([
            {
                id: 'placeholder-1-user',
                role: 'user',
                content: 'hello'
            },
            {
                id: 'placeholder-1-assistant',
                role: 'assistant',
                content: ''
            }
        ]);
        expect(conversations[0].sync?.dirty).toBe(false);
    });

    it('propagates hard-deleted conversations through the real server', async () => {
        const app = createApp({
            config: {
                port: 8787,
                dbPath: ':memory:',
                isDevelopment: true,
                corsAllowlist: [],
                contextBackend: 'database',
                codexCommand: 'codex',
                codexWorkingDirectory: process.cwd()
            }
        });
        const fetchImpl = createFetchImpl(app);
        const env = {
            VITE_E2E: '1',
            VITE_USE_MOCK_SYNC: '0',
            VITE_SYNC_KEY: 'web-delete',
            VITE_SYNC_BASE_URL: 'http://sync.test/api/sync'
        };

        const sourceProvider = createWebSyncStorageProvider({
            env,
            isDevelopment: true,
            localStore: new MemoryStorageProvider(),
            fetchImpl,
            stateStore: new MemorySyncStateStore(),
            deletedConversationStore: new MemoryDeletedConversationStateStore()
        });
        const targetProvider = createWebSyncStorageProvider({
            env,
            isDevelopment: true,
            localStore: new MemoryStorageProvider(),
            fetchImpl,
            stateStore: new MemorySyncStateStore(),
            deletedConversationStore: new MemoryDeletedConversationStateStore()
        });

        await sourceProvider.saveConversation(createConversation('delete-1', 150));
        await sourceProvider.syncNow();
        await sourceProvider.deleteConversation('delete-1');
        expect(await sourceProvider.getConversation('delete-1')).toBeNull();
        await sourceProvider.syncNow();

        await targetProvider.hydrate();
        expect(await targetProvider.getConversation('delete-1')).toBeNull();
        expect((await targetProvider.getAllConversations()).map((item) => item.id)).toEqual([]);
    });
});
