import type {
    SyncConversation,
    SyncDeletedConversation,
    SyncPullResponse,
    SyncPushResponse
} from '../types/sync.js';
import {
    SyncRepository,
    type PersistedConversation,
    type PersistedDeletedConversation
} from '../repositories/syncRepository.js';

function shouldAcceptConversation(
    current: PersistedConversation | null,
    currentDeleted: PersistedDeletedConversation | null,
    incoming: SyncConversation
): boolean {
    if (!current && !currentDeleted) {
        return true;
    }

    const currentUpdatedAt = Math.max(
        current?.conversation.updatedAt ?? Number.NEGATIVE_INFINITY,
        currentDeleted?.deletedConversation.updatedAt ?? Number.NEGATIVE_INFINITY
    );

    if (incoming.updatedAt > currentUpdatedAt) {
        return true;
    }

    if (incoming.updatedAt < currentUpdatedAt) {
        return false;
    }

    const incomingDeleted = incoming.sync?.deleted === true;
    const currentIsDeleted = currentDeleted
        ? currentDeleted.deletedConversation.updatedAt >= (current?.conversation.updatedAt ?? Number.NEGATIVE_INFINITY)
        : current?.conversation.sync?.deleted === true;

    return incomingDeleted && !currentIsDeleted;
}

function shouldAcceptDeletedConversation(
    current: PersistedConversation | null,
    currentDeleted: PersistedDeletedConversation | null,
    incoming: SyncDeletedConversation
): boolean {
    if (!current && !currentDeleted) {
        return true;
    }

    const currentUpdatedAt = Math.max(
        current?.conversation.updatedAt ?? Number.NEGATIVE_INFINITY,
        currentDeleted?.deletedConversation.updatedAt ?? Number.NEGATIVE_INFINITY
    );

    if (incoming.updatedAt > currentUpdatedAt) {
        return true;
    }

    if (incoming.updatedAt < currentUpdatedAt) {
        return false;
    }

    return !currentDeleted || incoming.updatedAt >= currentDeleted.deletedConversation.updatedAt;
}

export class SyncService {
    constructor(private readonly repository: SyncRepository) {}

    push(
        syncKey: string,
        conversations: SyncConversation[],
        deletedConversations: SyncDeletedConversation[] = []
    ): SyncPushResponse {
        return this.repository.runInTransaction(() => {
            const processedIds: string[] = [];
            const processedDeletedIds: string[] = [];
            let nextCursor = this.repository.getCurrentCursor(syncKey);

            for (const conversation of conversations) {
                const current = this.repository.getConversation(syncKey, conversation.id);
                const currentDeleted = this.repository.getDeletedConversation(syncKey, conversation.id);
                if (!shouldAcceptConversation(current, currentDeleted, conversation)) {
                    continue;
                }

                const now = Date.now();
                nextCursor = this.repository.allocateNextCursor(syncKey, now);
                this.repository.saveConversation({
                    syncKey,
                    conversation,
                    serverCursor: nextCursor,
                    receivedAt: now,
                    createdAt: current?.createdAt ?? now
                });
                processedIds.push(conversation.id);
            }

            for (const deletedConversation of deletedConversations) {
                const current = this.repository.getConversation(syncKey, deletedConversation.id);
                const currentDeleted = this.repository.getDeletedConversation(syncKey, deletedConversation.id);
                if (!shouldAcceptDeletedConversation(current, currentDeleted, deletedConversation)) {
                    continue;
                }

                const now = Date.now();
                nextCursor = this.repository.allocateNextCursor(syncKey, now);
                this.repository.deleteConversationAggregate(syncKey, deletedConversation.id);
                this.repository.saveDeletedConversation({
                    syncKey,
                    deletedConversation,
                    serverCursor: nextCursor,
                    receivedAt: now,
                    createdAt: currentDeleted?.createdAt ?? now
                });
                processedDeletedIds.push(deletedConversation.id);
            }

            return {
                processedIds,
                processedDeletedIds,
                nextCursor
            };
        });
    }

    pull(syncKey: string, cursor: number | null): SyncPullResponse {
        return this.repository.runInTransaction(() => ({
            conversations: this.repository
                .listConversationsAfterCursor(syncKey, cursor)
                .map((item) => item.conversation),
            deletedConversations: this.repository
                .listDeletedConversationsAfterCursor(syncKey, cursor)
                .map((item) => item.deletedConversation),
            nextCursor: this.repository.getCurrentCursor(syncKey)
        }));
    }
}
