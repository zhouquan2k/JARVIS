import localforage from 'localforage';
import type {
    ISyncTransport,
    SyncDeletedConversation,
    SyncPushResult
} from '../../interfaces/ISyncTransport';
import {
    cloneConversation,
    normalizeConversation,
    type Conversation,
    type ConversationSyncState,
} from '../../interfaces/IStorageProvider';
import type { IConversationPersistProvider } from '../../interfaces/IConversationPersistProvider';

export interface SyncStateStore {
    getCursor(syncKey: string): Promise<number | null>;
    setCursor(syncKey: string, cursor: number | null): Promise<void>;
}

export interface DeletedConversationStateStore {
    getDeletedConversations(syncKey: string): Promise<SyncDeletedConversation[]>;
    setDeletedConversations(syncKey: string, conversations: SyncDeletedConversation[]): Promise<void>;
}

export interface SyncStorageProviderOptions {
    localStore: IConversationPersistProvider;
    transport: ISyncTransport;
    syncKey: string;
    initialCursor?: number | null;
    stateStore?: SyncStateStore;
    deletedConversationStore?: DeletedConversationStateStore;
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

function mergeCursor(current: number | null, next?: number | null): number | null {
    if (typeof next !== 'number') {
        return current;
    }

    if (typeof current !== 'number') {
        return next;
    }

    return Math.max(current, next);
}

function dedupeDeletedConversations(conversations: SyncDeletedConversation[]): SyncDeletedConversation[] {
    const byId = new Map<string, SyncDeletedConversation>();
    for (const conversation of conversations) {
        const current = byId.get(conversation.id);
        if (!current || conversation.updatedAt >= current.updatedAt) {
            byId.set(conversation.id, { ...conversation });
        }
    }

    return Array.from(byId.values()).sort((left, right) => left.updatedAt - right.updatedAt);
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

class LocalForageDeletedConversationStateStore implements DeletedConversationStateStore {
    private readonly store: LocalForage;

    constructor() {
        this.store = localforage.createInstance({
            name: 'chatprism',
            storeName: 'sync-metadata'
        });
    }

    async getDeletedConversations(syncKey: string): Promise<SyncDeletedConversation[]> {
        const value = await this.store.getItem<SyncDeletedConversation[]>(`deleted:${syncKey}`);
        return Array.isArray(value) ? dedupeDeletedConversations(value) : [];
    }

    async setDeletedConversations(syncKey: string, conversations: SyncDeletedConversation[]): Promise<void> {
        await this.store.setItem(`deleted:${syncKey}`, dedupeDeletedConversations(conversations));
    }
}

export class SyncStorageProvider implements IConversationPersistProvider {
    public readonly id: string;

    private readonly localStore: IConversationPersistProvider;
    private readonly transport: ISyncTransport;
    private readonly syncKey: string;
    private readonly stateStore: SyncStateStore;
    private readonly deletedConversationStore: DeletedConversationStateStore;
    private cursorLoaded = false;
    private cursor: number | null;
    private activeSync: Promise<void> | null = null;
    private pendingSync = false;

    constructor(options: SyncStorageProviderOptions) {
        this.localStore = options.localStore;
        this.transport = options.transport;
        this.syncKey = options.syncKey;
        this.stateStore = options.stateStore ?? new LocalForageSyncStateStore();
        this.deletedConversationStore = options.deletedConversationStore ?? new LocalForageDeletedConversationStateStore();
        this.cursor = options.initialCursor ?? null;
        this.id = `sync-storage:${options.localStore.id}`;
    }

    async saveConversation(chat: Conversation): Promise<void> {
        if (chat.compare) {
            await this.localStore.saveConversation(cloneConversation(normalizeConversation(chat)));
            return;
        }

        await this.removePendingDeletedConversation(chat.id);
        const nextConversation = this.prepareLocalConversation(normalizeConversation(chat), {
            deleted: false
        });
        await this.localStore.saveConversation(nextConversation);
        this.queueSync();
    }

    async getConversation(id: string): Promise<Conversation | null> {
        const conversation = await this.localStore.getConversation(id);
        return conversation ? normalizeConversation(conversation) : null;
    }

    async getAllConversations(): Promise<Conversation[]> {
        const conversations = await this.localStore.getAllConversations();
        return conversations.map(normalizeConversation);
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

        const deletedConversation: SyncDeletedConversation = {
            id,
            updatedAt: Date.now()
        };

        await this.localStore.deleteConversation(id);
        await this.addPendingDeletedConversation(deletedConversation);
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
        const pullCursor = this.cursor;
        const dirtyConversations = await this.listDirtyConversations();
        const deletedConversations = await this.listPendingDeletedConversations();
        let nextCursor = this.cursor;

        if (dirtyConversations.length > 0 || deletedConversations.length > 0) {
            const pushResult = await this.transport.push(
                dirtyConversations.map(stripComparePayload),
                deletedConversations
            );
            await this.markProcessedConversations(pushResult);
            await this.markProcessedDeletedConversations(pushResult);
            nextCursor = mergeCursor(nextCursor, pushResult.nextCursor);
        }

        // Pull from the cursor observed before this sync cycle so local pushes do not skip older remote rows.
        const pullResult = await this.transport.pull(pullCursor);
        for (const remoteConversation of pullResult.conversations) {
            await this.mergeRemoteConversation(remoteConversation);
        }
        for (const deletedConversation of pullResult.deletedConversations) {
            await this.mergeRemoteDeletedConversation(deletedConversation);
        }

        nextCursor = mergeCursor(nextCursor, pullResult.nextCursor);
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

    private async listPendingDeletedConversations(): Promise<SyncDeletedConversation[]> {
        return this.deletedConversationStore.getDeletedConversations(this.syncKey);
    }

    private async markProcessedConversations(pushResult: SyncPushResult): Promise<void> {
        const processedIds = new Set(pushResult.processedIds);
        if (processedIds.size === 0) {
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
    }

    private async markProcessedDeletedConversations(pushResult: SyncPushResult): Promise<void> {
        const processedDeletedIds = new Set(pushResult.processedDeletedIds ?? []);
        if (processedDeletedIds.size === 0) {
            return;
        }

        const pendingDeletedConversations = await this.listPendingDeletedConversations();
        await this.deletedConversationStore.setDeletedConversations(
            this.syncKey,
            pendingDeletedConversations.filter((conversation) => !processedDeletedIds.has(conversation.id))
        );
    }

    private async mergeRemoteConversation(remoteConversation: Conversation): Promise<void> {
        const sanitizedRemoteConversation = stripComparePayload({
            ...cloneConversation(remoteConversation),
            sync: buildSyncedState(remoteConversation.sync)
        });
        const localConversation = await this.localStore.getConversation(sanitizedRemoteConversation.id);
        const pendingDeletedConversation = await this.getPendingDeletedConversation(sanitizedRemoteConversation.id);

        if (localConversation && localConversation.updatedAt > sanitizedRemoteConversation.updatedAt) {
            return;
        }

        if (pendingDeletedConversation) {
            if (pendingDeletedConversation.updatedAt >= sanitizedRemoteConversation.updatedAt) {
                return;
            }

            await this.removePendingDeletedConversation(sanitizedRemoteConversation.id);
        }

        await this.localStore.saveConversation(sanitizedRemoteConversation);
    }

    private async mergeRemoteDeletedConversation(remoteConversation: SyncDeletedConversation): Promise<void> {
        const localConversation = await this.localStore.getConversation(remoteConversation.id);
        const pendingDeletedConversation = await this.getPendingDeletedConversation(remoteConversation.id);
        const latestLocalUpdatedAt = Math.max(
            localConversation?.updatedAt ?? Number.NEGATIVE_INFINITY,
            pendingDeletedConversation?.updatedAt ?? Number.NEGATIVE_INFINITY
        );

        if (latestLocalUpdatedAt > remoteConversation.updatedAt) {
            return;
        }

        if (pendingDeletedConversation && pendingDeletedConversation.updatedAt <= remoteConversation.updatedAt) {
            await this.removePendingDeletedConversation(remoteConversation.id);
        }

        if (localConversation) {
            await this.localStore.deleteConversation(remoteConversation.id);
        }
    }

    private async addPendingDeletedConversation(conversation: SyncDeletedConversation): Promise<void> {
        const pendingDeletedConversations = await this.listPendingDeletedConversations();
        await this.deletedConversationStore.setDeletedConversations(this.syncKey, [
            ...pendingDeletedConversations,
            conversation
        ]);
    }

    private async removePendingDeletedConversation(id: string): Promise<void> {
        const pendingDeletedConversations = await this.listPendingDeletedConversations();
        if (!pendingDeletedConversations.some((conversation) => conversation.id === id)) {
            return;
        }

        await this.deletedConversationStore.setDeletedConversations(
            this.syncKey,
            pendingDeletedConversations.filter((conversation) => conversation.id !== id)
        );
    }

    private async getPendingDeletedConversation(id: string): Promise<SyncDeletedConversation | null> {
        const pendingDeletedConversations = await this.listPendingDeletedConversations();
        return pendingDeletedConversations.find((conversation) => conversation.id === id) ?? null;
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
