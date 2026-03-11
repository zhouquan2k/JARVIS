import type { ISyncTransport, SyncPullResult, SyncPushResult } from '../interfaces/ISyncTransport';
import { cloneConversation, type Conversation } from '../interfaces/IStorageProvider';

export const MOCK_SYNC_EVENTS_STORAGE_KEY = 'chatprism:mock-sync-events';

export interface MockSyncEvent {
    type: 'pull' | 'push';
    syncKey: string;
    cursor?: number | null;
    nextCursor?: number | null;
    conversations?: Conversation[];
}

export interface MockSyncTransportOptions {
    storage?: Pick<Storage, 'getItem' | 'setItem'>;
}

function readEvents(storage?: Pick<Storage, 'getItem'>): MockSyncEvent[] {
    if (!storage) {
        return [];
    }

    const raw = storage.getItem(MOCK_SYNC_EVENTS_STORAGE_KEY);
    if (!raw) {
        return [];
    }

    try {
        return JSON.parse(raw) as MockSyncEvent[];
    } catch {
        return [];
    }
}

function writeEvents(storage: Pick<Storage, 'setItem'> | undefined, events: MockSyncEvent[]): void {
    if (!storage) {
        return;
    }

    storage.setItem(MOCK_SYNC_EVENTS_STORAGE_KEY, JSON.stringify(events));
}

export function createMockSyncTransport(
    syncKey: string,
    options: MockSyncTransportOptions = {}
): ISyncTransport {
    const storage = options.storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);

    return {
        async pull(cursor: number | null): Promise<SyncPullResult> {
            const nextEvents = readEvents(storage);
            nextEvents.push({
                type: 'pull',
                syncKey,
                cursor,
                nextCursor: cursor
            });
            writeEvents(storage, nextEvents);
            return {
                conversations: [],
                nextCursor: cursor
            };
        },

        async push(conversations: Conversation[]): Promise<SyncPushResult> {
            const nextCursor = conversations.reduce<number | null>(
                (maxCursor, conversation) => Math.max(maxCursor ?? conversation.updatedAt, conversation.updatedAt),
                null
            );
            const clonedConversations = conversations.map(cloneConversation);
            const nextEvents = readEvents(storage);
            nextEvents.push({
                type: 'push',
                syncKey,
                conversations: clonedConversations,
                nextCursor
            });
            writeEvents(storage, nextEvents);
            return {
                processedIds: clonedConversations.map((conversation) => conversation.id),
                nextCursor
            };
        }
    };
}
