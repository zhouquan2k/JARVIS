import type { Conversation } from './Conversation';

export interface SyncDeletedConversation {
    id: string;
    updatedAt: number;
}

export interface SyncPullResult {
    conversations: Conversation[];
    deletedConversations: SyncDeletedConversation[];
    nextCursor: number | null;
}

export interface SyncPushResult {
    processedIds: string[];
    processedDeletedIds?: string[];
    nextCursor?: number | null;
}

export interface ISyncTransport {
    pull(cursor: number | null): Promise<SyncPullResult>;
    push(conversations: Conversation[], deletedConversations?: SyncDeletedConversation[]): Promise<SyncPushResult>;
}
