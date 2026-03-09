import type { Conversation } from './IStorageProvider';

export interface SyncPullResult {
    conversations: Conversation[];
    nextCursor: number | null;
}

export interface SyncPushResult {
    processedIds: string[];
    nextCursor?: number | null;
}

export interface ISyncTransport {
    pull(cursor: number | null): Promise<SyncPullResult>;
    push(conversations: Conversation[]): Promise<SyncPushResult>;
}
