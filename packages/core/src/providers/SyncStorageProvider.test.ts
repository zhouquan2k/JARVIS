import { describe, expect, it } from 'vitest';
import type { ISyncTransport, SyncPullResult, SyncPushResult } from '../interfaces/ISyncTransport';
import { cloneConversationMessage, type Conversation, type IStorageProvider } from '../interfaces/IStorageProvider';
import { SyncStorageProvider, type SyncStateStore } from './SyncStorageProvider';

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

class MockSyncTransport implements ISyncTransport {
    public pushes: Conversation[][] = [];
    public pushResult: SyncPushResult = { processedIds: [], nextCursor: null };
    public pushResults: SyncPushResult[] = [];
    public pullResult: SyncPullResult = { conversations: [], nextCursor: null };

    async pull(): Promise<SyncPullResult> {
        return {
            conversations: this.pullResult.conversations.map(cloneConversation),
            nextCursor: this.pullResult.nextCursor
        };
    }

    async push(conversations: Conversation[]): Promise<SyncPushResult> {
        this.pushes.push(conversations.map(cloneConversation));
        const nextResult = this.pushResults.shift();
        return {
            processedIds: [...(nextResult?.processedIds ?? this.pushResult.processedIds)],
            nextCursor: nextResult?.nextCursor ?? this.pushResult.nextCursor
        };
    }
}

function cloneConversation(conversation: Conversation): Conversation {
    return {
        ...conversation,
        sync: conversation.sync ? { ...conversation.sync } : undefined,
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
        compare: overrides.compare
            ? {
                ...overrides.compare,
                analysisResult: { ...overrides.compare.analysisResult }
            }
            : undefined
    };
}

describe('SyncStorageProvider', () => {
    it('pushes dirty conversations and keeps compare-only conversations local', async () => {
        const transport = new MockSyncTransport();
        transport.pushResult = { processedIds: ['sync-1'], nextCursor: 11 };
        const localStore = new MemoryStorageProvider();
        const stateStore = new MemorySyncStateStore();
        const provider = new SyncStorageProvider({
            localStore,
            transport,
            syncKey: 'workspace-a',
            stateStore
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
        expect(transport.pushes[0]).toHaveLength(1);
        expect(transport.pushes[0][0].id).toBe('sync-1');
        expect(transport.pushes[0][0].compare).toBeUndefined();
        expect(transport.pushes[0][0].sync?.dirty).toBe(true);
        expect(transport.pushes[0][0].messages[0].attachments?.[0]?.name).toBe('notes.txt');
        expect(transport.pushes[0][0].messages[1].annotations?.[0]?.kind).toBe('cite');

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

    it('keeps soft-deleted conversations locally until remote acknowledgement', async () => {
        const transport = new MockSyncTransport();
        transport.pushResult = { processedIds: ['sync-2'], nextCursor: 15 };
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
            stateStore: new MemorySyncStateStore()
        });

        await provider.deleteConversation('sync-2');

        const deletedConversation = await provider.getConversation('sync-2');
        expect(deletedConversation?.sync?.deleted).toBe(true);
        expect(deletedConversation?.sync?.dirty).toBe(true);

        await provider.syncNow();
        const syncedConversation = await provider.getConversation('sync-2');
        expect(syncedConversation?.sync?.deleted).toBe(true);
        expect(syncedConversation?.sync?.dirty).toBe(false);
    });

    it('uses remote last-write-wins data during pull and persists the updated cursor', async () => {
        const transport = new MockSyncTransport();
        transport.pullResult = {
            conversations: [
                createConversation({
                    id: 'shared-1',
                    updatedAt: 50,
                    title: 'Remote latest',
                    sync: {
                        deleted: false,
                        dirty: false,
                        syncedAt: 50
                    }
                })
            ],
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
            stateStore
        });

        await provider.hydrate();

        const mergedConversation = await provider.getConversation('shared-1');
        expect(mergedConversation?.title).toBe('Remote latest');
        expect(mergedConversation?.sync?.dirty).toBe(false);
        expect(await stateStore.getCursor('workspace-c')).toBe(50);
    });

    it('hydrates legacy local conversations by marking them dirty and pushing them once per startup', async () => {
        const transport = new MockSyncTransport();
        transport.pushResults = [
            { processedIds: ['legacy-1'], nextCursor: 7 }
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
            stateStore
        });

        await provider.hydrate();

        expect(transport.pushes).toHaveLength(1);
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
            { processedIds: ['legacy-2'], nextCursor: 5 },
            { processedIds: ['fresh-1'], nextCursor: 6 }
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
            stateStore: new MemorySyncStateStore()
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
