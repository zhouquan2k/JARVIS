import localforage from 'localforage';
import type { ISyncTransport, SyncPushResult } from '../interfaces/ISyncTransport';
import type { Conversation, ConversationSyncState, IStorageProvider } from '../interfaces/IStorageProvider';

export interface SyncStateStore {
    getCursor(syncKey: string): Promise<number | null>;
    setCursor(syncKey: string, cursor: number | null): Promise<void>;
}

export interface SyncStorageProviderOptions {
    localStore: IStorageProvider;
    transport: ISyncTransport;
    syncKey: string;
    initialCursor?: number | null;
    stateStore?: SyncStateStore;
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
        messages: conversation.messages.map((message) => ({ ...message }))
    };
}

function stripComparePayload(conversation: Conversation): Conversation {
    const sanitized = cloneConversation(conversation);
    delete sanitized.compare;
    return sanitized;
}

function buildSyncedState(sync?: ConversationSyncState): ConversationSyncState {
    return {
        ...sync,
        dirty: false,
        syncedAt: Date.now()
    };
}

function shouldTrackForStartupSync(conversation: Conversation): boolean {
    if (conversation.compare) {
        return false;
    }

    return !conversation.sync || conversation.sync.dirty === true;
}

class LocalForageSyncStateStore implements SyncStateStore {
    private readonly store: LocalForage;

    constructor() {
        this.store = localforage.createInstance({
            name: 'chatprism',
            storeName: 'sync-metadata'
        });
    }

    async getCursor(syncKey: string): Promise<number | null> {
        const value = await this.store.getItem<number>(`cursor:${syncKey}`);
        return typeof value === 'number' ? value : null;
    }

    async setCursor(syncKey: string, cursor: number | null): Promise<void> {
        await this.store.setItem(`cursor:${syncKey}`, cursor);
    }
}

export class SyncStorageProvider implements IStorageProvider {
    public readonly id: string;

    private readonly localStore: IStorageProvider;
    private readonly transport: ISyncTransport;
    private readonly syncKey: string;
    private readonly stateStore: SyncStateStore;
    private cursorLoaded = false;
    private cursor: number | null;
    private activeSync: Promise<void> | null = null;
    private pendingSync = false;

    constructor(options: SyncStorageProviderOptions) {
        this.localStore = options.localStore;
        this.transport = options.transport;
        this.syncKey = options.syncKey;
        this.stateStore = options.stateStore ?? new LocalForageSyncStateStore();
        this.cursor = options.initialCursor ?? null;
        this.id = `sync-storage:${options.localStore.id}`;
    }

    async saveConversation(chat: Conversation): Promise<void> {
        if (chat.compare) {
            await this.localStore.saveConversation(cloneConversation(chat));
            return;
        }

        const nextConversation = this.prepareLocalConversation(chat, {
            deleted: chat.sync?.deleted ?? false
        });
        await this.localStore.saveConversation(nextConversation);
        this.queueSync();
    }

    async getConversation(id: string): Promise<Conversation | null> {
        return this.localStore.getConversation(id);
    }

    async getAllConversations(): Promise<Conversation[]> {
        return this.localStore.getAllConversations();
    }

    async deleteConversation(id: string): Promise<void> {
        const existing = await this.localStore.getConversation(id);
        if (!existing) {
            return;
        }

        if (existing.compare) {
            await this.localStore.deleteConversation(id);
            return;
        }

        const deletedConversation = this.prepareLocalConversation(existing, { deleted: true });
        await this.localStore.saveConversation(deletedConversation);
        this.queueSync();
    }

    async hydrate(): Promise<void> {
        await this.ensureCursorLoaded();
        await this.markPendingUnsyncedConversations();
        await this.syncNow();
    }

    async syncNow(): Promise<void> {
        if (this.activeSync) {
            this.pendingSync = true;
            return this.activeSync;
        }

        this.activeSync = this.performSync().finally(() => {
            this.activeSync = null;
            if (this.pendingSync) {
                this.pendingSync = false;
                void this.syncNow();
            }
        });

        return this.activeSync;
    }

    private async performSync(): Promise<void> {
        await this.ensureCursorLoaded();
        const dirtyConversations = await this.listDirtyConversations();

        if (dirtyConversations.length > 0) {
            const pushResult = await this.transport.push(dirtyConversations.map(stripComparePayload));
            await this.markProcessedConversations(pushResult);
        }

        const pullResult = await this.transport.pull(this.cursor);
        for (const remoteConversation of pullResult.conversations) {
            await this.mergeRemoteConversation(remoteConversation);
        }

        const nextCursor = pullResult.nextCursor ?? this.cursor;
        if (nextCursor !== this.cursor) {
            await this.updateCursor(nextCursor);
        }
    }

    private prepareLocalConversation(
        chat: Conversation,
        overrides: { deleted: boolean }
    ): Conversation {
        const nextConversation = cloneConversation(chat);
        const syncedAt = nextConversation.sync?.syncedAt ?? null;
        return {
            ...nextConversation,
            updatedAt: Date.now(),
            sync: {
                ...nextConversation.sync,
                dirty: true,
                deleted: overrides.deleted,
                syncedAt
            }
        };
    }

    private async markPendingUnsyncedConversations(): Promise<void> {
        const conversations = await this.localStore.getAllConversations();
        const pendingConversations = conversations.filter((conversation) => shouldTrackForStartupSync(conversation));

        await Promise.all(
            pendingConversations.map(async (conversation) => {
                if (conversation.sync?.dirty) {
                    return;
                }

                await this.localStore.saveConversation({
                    ...cloneConversation(conversation),
                    sync: {
                        ...conversation.sync,
                        dirty: true,
                        deleted: conversation.sync?.deleted ?? false,
                        syncedAt: conversation.sync?.syncedAt ?? null
                    }
                });
            })
        );
    }

    private async listDirtyConversations(): Promise<Conversation[]> {
        const conversations = await this.localStore.getAllConversations();
        return conversations.filter((conversation) => conversation.sync?.dirty && !conversation.compare);
    }

    private async markProcessedConversations(pushResult: SyncPushResult): Promise<void> {
        const processedIds = new Set(pushResult.processedIds);
        if (processedIds.size === 0) {
            if (pushResult.nextCursor !== undefined) {
                await this.updateCursor(pushResult.nextCursor ?? null);
            }
            return;
        }

        const conversations = await this.localStore.getAllConversations();
        await Promise.all(
            conversations
                .filter((conversation) => processedIds.has(conversation.id))
                .map(async (conversation) => {
                    await this.localStore.saveConversation({
                        ...cloneConversation(conversation),
                        sync: buildSyncedState(conversation.sync)
                    });
                })
        );

        if (pushResult.nextCursor !== undefined) {
            await this.updateCursor(pushResult.nextCursor ?? null);
        }
    }

    private async mergeRemoteConversation(remoteConversation: Conversation): Promise<void> {
        const sanitizedRemoteConversation = stripComparePayload({
            ...cloneConversation(remoteConversation),
            sync: buildSyncedState(remoteConversation.sync)
        });
        const localConversation = await this.localStore.getConversation(sanitizedRemoteConversation.id);

        if (localConversation && localConversation.updatedAt > sanitizedRemoteConversation.updatedAt) {
            return;
        }

        await this.localStore.saveConversation(sanitizedRemoteConversation);
    }

    private queueSync(): void {
        void Promise.resolve().then(() => this.syncNow().catch(() => undefined));
    }

    private async ensureCursorLoaded(): Promise<void> {
        if (this.cursorLoaded) {
            return;
        }

        const persistedCursor = await this.stateStore.getCursor(this.syncKey);
        if (persistedCursor !== null || this.cursor === null) {
            this.cursor = persistedCursor;
        }
        this.cursorLoaded = true;
    }

    private async updateCursor(cursor: number | null): Promise<void> {
        this.cursor = cursor;
        await this.stateStore.setCursor(this.syncKey, cursor);
    }
}
