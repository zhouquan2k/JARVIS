import type { SyncConversation, SyncPullResponse, SyncPushResponse } from '../types/sync.js';
import { SyncRepository, type PersistedConversation } from '../repositories/syncRepository.js';

function shouldAcceptConversation(
    current: PersistedConversation | null,
    incoming: SyncConversation
): boolean {
    if (!current) {
        return true;
    }

    if (incoming.updatedAt > current.conversation.updatedAt) {
        return true;
    }

    if (incoming.updatedAt < current.conversation.updatedAt) {
        return false;
    }

    const incomingDeleted = incoming.sync?.deleted === true;
    const currentDeleted = current.conversation.sync?.deleted === true;
    return incomingDeleted && !currentDeleted;
}

export class SyncService {
    constructor(private readonly repository: SyncRepository) {}

    push(syncKey: string, conversations: SyncConversation[]): SyncPushResponse {
        return this.repository.runInTransaction(() => {
            const processedIds: string[] = [];
            let nextCursor = this.repository.getCurrentCursor(syncKey);

            for (const conversation of conversations) {
                const current = this.repository.getConversation(syncKey, conversation.id);
                if (!shouldAcceptConversation(current, conversation)) {
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

            return {
                processedIds,
                nextCursor
            };
        });
    }

    pull(syncKey: string, cursor: number | null): SyncPullResponse {
        return this.repository.runInTransaction(() => ({
            conversations: this.repository
                .listConversationsAfterCursor(syncKey, cursor)
                .map((item) => item.conversation),
            nextCursor: this.repository.getCurrentCursor(syncKey)
        }));
    }
}
