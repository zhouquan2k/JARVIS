import { describe, expect, it } from 'vitest';
import type {
    ISyncTransport,
    SyncDeletedConversation,
    SyncPullResult,
    SyncPushResult
} from '../interfaces/ISyncTransport';
import { cloneConversationMessage, type Conversation, type IStorageProvider } from '../interfaces/IStorageProvider';
import {
    SyncStorageProvider,
    type DeletedConversationStateStore,
    type SyncStateStore
} from './SyncStorageProvider';

class MemoryStorageProvider implements IStorageProvider {
    id = 'memory-storage';

    private readonly conversations = new Map<string, Conversation>();

    constructor(initialConversations: Conversation[] = []) {
        initialConversations.forEach((conversation) => {
            this.conversations.set(conversation.id, cloneConversation(conversation));
        });
    }

    async saveConversation(chat: Conversation): Promise<void> {
        this.conversations.set(chat.id, cloneConversation(chat));
    }

    async getConversation(id: string): Promise<Conversation | null> {
        return this.conversations.has(id) ? cloneConversation(this.conversations.get(id)!) : null;
    }

    async getAllConversations(): Promise<Conversation[]> {
        return Array.from(this.conversations.values())
            .map(cloneConversation)
            .sort((a, b) => b.updatedAt - a.updatedAt);
    }

    async deleteConversation(id: string): Promise<void> {
        this.conversations.delete(id);
    }
}

class MemorySyncStateStore implements SyncStateStore {
    private readonly cursors = new Map<string, number | null>();

    async getCursor(syncKey: string): Promise<number | null> {
        return this.cursors.has(syncKey) ? this.cursors.get(syncKey)! : null;
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

class MockSyncTransport implements ISyncTransport {
    public pushes: Conversation[][] = [];
    public deletedPushes: SyncDeletedConversation[][] = [];
    public pushResult: SyncPushResult = { processedIds: [], processedDeletedIds: [], nextCursor: null };
    public pushResults: SyncPushResult[] = [];
    public pullResult: SyncPullResult = { conversations: [], deletedConversations: [], nextCursor: null };

    async pull(): Promise<SyncPullResult> {
        return {
            conversations: this.pullResult.conversations.map(cloneConversation),
            deletedConversations: this.pullResult.deletedConversations.map((conversation) => ({ ...conversation })),
            nextCursor: this.pullResult.nextCursor
        };
    }

    async push(
        conversations: Conversation[],
        deletedConversations: SyncDeletedConversation[] = []
    ): Promise<SyncPushResult> {
        this.pushes.push(conversations.map(cloneConversation));
        this.deletedPushes.push(deletedConversations.map((conversation) => ({ ...conversation })));
        const nextResult = this.pushResults.shift();
        return {
            processedIds: [...(nextResult?.processedIds ?? this.pushResult.processedIds)],
            processedDeletedIds: [...(nextResult?.processedDeletedIds ?? this.pushResult.processedDeletedIds ?? [])],
            nextCursor: nextResult?.nextCursor ?? this.pushResult.nextCursor
        };
    }
}

function cloneConversation(conversation: Conversation): Conversation {
    return {
        ...conversation,
        sync: conversation.sync ? { ...conversation.sync } : undefined,
        modelSelection: conversation.modelSelection
            ? {
                providerId: conversation.modelSelection.providerId,
                modelId: conversation.modelSelection.modelId,
                modelOptions: { ...conversation.modelSelection.modelOptions }
            }
            : undefined,
        compare: conversation.compare
            ? {
                ...conversation.compare,
                analysisResult: { ...conversation.compare.analysisResult }
            }
            : undefined,
        messages: conversation.messages.map(cloneConversationMessage)
    };
}

function createConversation(
    overrides: Partial<Conversation> & Pick<Conversation, 'id' | 'updatedAt'>
): Conversation {
    return {
        id: overrides.id,
        title: overrides.title ?? `Conversation ${overrides.id}`,
        origin: overrides.origin ?? 'local',
        messages: overrides.messages ?? [],
        updatedAt: overrides.updatedAt,
        backendId: overrides.backendId,
        externalId: overrides.externalId,
        sync: overrides.sync ? { ...overrides.sync } : undefined,
        modelSelection: overrides.modelSelection
            ? {
                providerId: overrides.modelSelection.providerId,
                modelId: overrides.modelSelection.modelId,
                modelOptions: { ...overrides.modelSelection.modelOptions }
            }
            : undefined,
        compare: overrides.compare
            ? {
                ...overrides.compare,
                analysisResult: { ...overrides.compare.analysisResult }
            }
            : undefined
    };
}

describe('SyncStorageProvider', () => {
    it('preserves conversation model selection across save load and sync push', async () => {
        const transport = new MockSyncTransport();
        transport.pushResult = { processedIds: ['sync-1'], processedDeletedIds: [], nextCursor: 2 };
        const localStore = new MemoryStorageProvider();
        const provider = new SyncStorageProvider({
            localStore,
            transport,
            syncKey: 'workspace-a',
            stateStore: new MemorySyncStateStore(),
            deletedConversationStore: new MemoryDeletedConversationStateStore()
        });

        await provider.saveConversation(createConversation({
            id: 'sync-1',
            updatedAt: 100,
            modelSelection: {
                providerId: 'chatgpt-web',
                modelId: 'gpt-4o',
                modelOptions: {
                    web_search: true
                }
            }
        }));

        expect((await provider.getConversation('sync-1'))?.modelSelection).toEqual({
            providerId: 'chatgpt-web',
            modelId: 'gpt-4o',
            modelOptions: {
                web_search: true
            }
        });

        await provider.syncNow();

        expect(transport.pushes[0]?.[0]?.modelSelection).toEqual({
            providerId: 'chatgpt-web',
            modelId: 'gpt-4o',
            modelOptions: {
                web_search: true
            }
        });
    });

    it('pushes dirty conversations and keeps compare-only conversations local', async () => {
        const transport = new MockSyncTransport();
        transport.pushResult = { processedIds: ['sync-1'], processedDeletedIds: [], nextCursor: 11 };
        const localStore = new MemoryStorageProvider();
        const stateStore = new MemorySyncStateStore();
        const provider = new SyncStorageProvider({
            localStore,
            transport,
            syncKey: 'workspace-a',
            stateStore,
            deletedConversationStore: new MemoryDeletedConversationStateStore()
        });

        await provider.saveConversation(createConversation({
            id: 'sync-1',
            updatedAt: 100,
            title: 'Sync me',
            messages: [
                {
                    id: 'message-1',
                    role: 'user',
                    content: 'hello',
                    createdAt: 1000,
                    questionId: 'question-1',
                    starred: true,
                    deleted: false,
                    attachments: [
                        {
                            id: 'attachment-1',
                            type: 'file',
                            name: 'notes.txt',
                            mimeType: 'text/plain',
                            size: 42,
                            base64Data: 'aGVsbG8='
                        }
                    ]
                },
                {
                    id: 'message-2',
                    role: 'assistant',
                    content: '已处理 [1]',
                    createdAt: 1001,
                    questionId: 'question-1',
                    deleted: false,
                    annotations: [
                        {
                            kind: 'cite',
                            range: { start: 4, end: 7 },
                            payload: {
                                refId: 'source-1',
                                label: '[1]',
                                title: 'Spec',
                                url: 'https://example.com/spec'
                            }
                        }
                    ]
                }
            ]
        }));

        await provider.saveConversation(createConversation({
            id: 'compare-only',
            updatedAt: 101,
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
                    uniqueA: 'alpha only',
                    uniqueB: 'beta only'
                }
            }
        }));

        await provider.syncNow();

        expect(transport.pushes).toHaveLength(1);
        expect(transport.deletedPushes).toEqual([[]]);
        expect(transport.pushes[0]).toHaveLength(1);
        expect(transport.pushes[0][0].id).toBe('sync-1');
        expect(transport.pushes[0][0].compare).toBeUndefined();
        expect(transport.pushes[0][0].sync?.dirty).toBe(true);
        expect(transport.pushes[0][0].messages[0].questionId).toBe('question-1');
        expect(transport.pushes[0][0].messages[0].starred).toBe(true);
        expect(transport.pushes[0][0].messages[1].createdAt).toBe(1001);

        const persisted = await provider.getConversation('sync-1');
        expect(persisted?.sync?.dirty).toBe(false);
        expect(persisted?.sync?.syncedAt).toEqual(expect.any(Number));
        expect(persisted?.messages[0].attachments?.[0]?.base64Data).toBe('aGVsbG8=');
        expect(persisted?.messages[1].annotations?.[0]?.kind).toBe('cite');

        const compareOnlyConversation = await provider.getConversation('compare-only');
        expect(compareOnlyConversation?.compare?.prompt).toBe('compare');
        expect(compareOnlyConversation?.sync).toBeUndefined();
        expect(await stateStore.getCursor('workspace-a')).toBe(11);
    });

    it('hard-deletes local conversations and clears the delete outbox after remote acknowledgement', async () => {
        const transport = new MockSyncTransport();
        transport.pushResult = { processedIds: [], processedDeletedIds: ['sync-2'], nextCursor: 15 };
        const deletedConversationStore = new MemoryDeletedConversationStateStore();
        const localStore = new MemoryStorageProvider([
            createConversation({
                id: 'sync-2',
                updatedAt: 20,
                sync: {
                    dirty: false,
                    deleted: false,
                    syncedAt: 18
                }
            })
        ]);
        const provider = new SyncStorageProvider({
            localStore,
            transport,
            syncKey: 'workspace-b',
            stateStore: new MemorySyncStateStore(),
            deletedConversationStore
        });

        await provider.deleteConversation('sync-2');

        expect(await provider.getConversation('sync-2')).toBeNull();
        expect(await deletedConversationStore.getDeletedConversations('workspace-b')).toEqual([
            expect.objectContaining({ id: 'sync-2', updatedAt: expect.any(Number) })
        ]);

        await provider.syncNow();

        expect(transport.pushes).toEqual([[]]);
        expect(transport.deletedPushes).toHaveLength(1);
        expect(transport.deletedPushes[0][0]).toEqual(expect.objectContaining({ id: 'sync-2' }));
        expect(await deletedConversationStore.getDeletedConversations('workspace-b')).toEqual([]);
        expect(await provider.getConversation('sync-2')).toBeNull();
    });

    it('uses remote last-write-wins data during pull and persists the updated cursor', async () => {
        const transport = new MockSyncTransport();
        transport.pullResult = {
            conversations: [
                createConversation({
                    id: 'shared-1',
                    updatedAt: 50,
                    title: 'Remote latest',
                    messages: [
                        {
                            id: 'remote-user',
                            role: 'user',
                            content: 'remote question',
                            createdAt: 49,
                            questionId: 'question-remote',
                            starred: false,
                            deleted: true
                        },
                        {
                            id: 'remote-assistant',
                            role: 'assistant',
                            content: 'remote answer',
                            createdAt: 50,
                            questionId: 'question-remote',
                            deleted: true
                        }
                    ],
                    sync: {
                        deleted: false,
                        dirty: false,
                        syncedAt: 50
                    }
                })
            ],
            deletedConversations: [],
            nextCursor: 50
        };
        const stateStore = new MemorySyncStateStore();
        const provider = new SyncStorageProvider({
            localStore: new MemoryStorageProvider([
                createConversation({
                    id: 'shared-1',
                    updatedAt: 40,
                    title: 'Local older',
                    sync: {
                        dirty: false,
                        deleted: false,
                        syncedAt: 40
                    }
                })
            ]),
            transport,
            syncKey: 'workspace-c',
            stateStore,
            deletedConversationStore: new MemoryDeletedConversationStateStore()
        });

        await provider.hydrate();

        const mergedConversation = await provider.getConversation('shared-1');
        expect(mergedConversation?.title).toBe('Remote latest');
        expect(mergedConversation?.messages[0].questionId).toBe('question-remote');
        expect(mergedConversation?.messages[0].deleted).toBe(true);
        expect(mergedConversation?.sync?.deleted).toBe(false);
        expect(mergedConversation?.sync?.dirty).toBe(false);
        expect(await stateStore.getCursor('workspace-c')).toBe(50);
    });

    it('applies remote delete events and removes matching local conversations', async () => {
        const transport = new MockSyncTransport();
        transport.pullResult = {
            conversations: [],
            deletedConversations: [
                {
                    id: 'shared-delete',
                    updatedAt: 80
                }
            ],
            nextCursor: 80
        };
        const provider = new SyncStorageProvider({
            localStore: new MemoryStorageProvider([
                createConversation({
                    id: 'shared-delete',
                    updatedAt: 70,
                    title: 'Local draft'
                })
            ]),
            transport,
            syncKey: 'workspace-delete',
            stateStore: new MemorySyncStateStore(),
            deletedConversationStore: new MemoryDeletedConversationStateStore()
        });

        await provider.hydrate();

        expect(await provider.getConversation('shared-delete')).toBeNull();
    });

    it('ignores stale remote delete events when the local conversation is newer', async () => {
        const transport = new MockSyncTransport();
        transport.pullResult = {
            conversations: [],
            deletedConversations: [
                {
                    id: 'shared-stale-delete',
                    updatedAt: 50
                }
            ],
            nextCursor: 50
        };
        const provider = new SyncStorageProvider({
            localStore: new MemoryStorageProvider([
                createConversation({
                    id: 'shared-stale-delete',
                    updatedAt: 60,
                    title: 'Local latest'
                })
            ]),
            transport,
            syncKey: 'workspace-stale',
            stateStore: new MemorySyncStateStore(),
            deletedConversationStore: new MemoryDeletedConversationStateStore()
        });

        await provider.hydrate();

        expect((await provider.getConversation('shared-stale-delete'))?.title).toBe('Local latest');
    });

    it('hydrates legacy local conversations by marking them dirty and pushing them once per startup', async () => {
        const transport = new MockSyncTransport();
        transport.pushResults = [
            { processedIds: ['legacy-1'], processedDeletedIds: [], nextCursor: 7 }
        ];
        const stateStore = new MemorySyncStateStore();
        const provider = new SyncStorageProvider({
            localStore: new MemoryStorageProvider([
                createConversation({
                    id: 'legacy-1',
                    updatedAt: 123,
                    title: 'Legacy local conversation'
                }),
                createConversation({
                    id: 'compare-legacy',
                    updatedAt: 124,
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
            transport,
            syncKey: 'workspace-d',
            stateStore,
            deletedConversationStore: new MemoryDeletedConversationStateStore()
        });

        await provider.hydrate();

        expect(transport.pushes).toHaveLength(1);
        expect(transport.deletedPushes).toEqual([[]]);
        expect(transport.pushes[0]).toHaveLength(1);
        expect(transport.pushes[0][0].id).toBe('legacy-1');
        expect(transport.pushes[0][0].updatedAt).toBe(123);
        expect(transport.pushes[0][0].compare).toBeUndefined();

        const legacyConversation = await provider.getConversation('legacy-1');
        expect(legacyConversation?.sync?.dirty).toBe(false);
        expect(legacyConversation?.sync?.syncedAt).toEqual(expect.any(Number));

        const compareConversation = await provider.getConversation('compare-legacy');
        expect(compareConversation?.compare?.prompt).toBe('compare');
        expect(compareConversation?.sync).toBeUndefined();
        expect(await stateStore.getCursor('workspace-d')).toBe(7);
    });

    it('continues pushing newly created conversations after startup hydration', async () => {
        const transport = new MockSyncTransport();
        transport.pushResults = [
            { processedIds: ['legacy-2'], processedDeletedIds: [], nextCursor: 5 },
            { processedIds: ['fresh-1'], processedDeletedIds: [], nextCursor: 6 }
        ];
        const provider = new SyncStorageProvider({
            localStore: new MemoryStorageProvider([
                createConversation({
                    id: 'legacy-2',
                    updatedAt: 200
                })
            ]),
            transport,
            syncKey: 'workspace-e',
            stateStore: new MemorySyncStateStore(),
            deletedConversationStore: new MemoryDeletedConversationStateStore()
        });

        await provider.hydrate();
        await provider.saveConversation(createConversation({
            id: 'fresh-1',
            updatedAt: 201
        }));
        await provider.syncNow();

        expect(transport.pushes).toHaveLength(2);
        expect(transport.pushes[0].map((conversation) => conversation.id)).toEqual(['legacy-2']);
        expect(transport.pushes[1].map((conversation) => conversation.id)).toEqual(['fresh-1']);

        const freshConversation = await provider.getConversation('fresh-1');
        expect(freshConversation?.sync?.dirty).toBe(false);
    });
});
