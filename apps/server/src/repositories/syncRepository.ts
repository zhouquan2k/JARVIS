import type { SyncDatabase } from '../db.js';
import type { SyncConversation } from '../types/sync.js';

interface CursorRow {
    current_cursor: number;
}

interface ConversationRow {
    payload_json: string;
    server_cursor: number;
    created_at: number;
    last_seen_at: number;
}

export interface PersistedConversation {
    conversation: SyncConversation;
    serverCursor: number;
    createdAt: number;
    lastSeenAt: number;
}

export interface SaveConversationInput {
    syncKey: string;
    conversation: SyncConversation;
    serverCursor: number;
    receivedAt: number;
    createdAt: number;
}

export class SyncRepository {
    constructor(private readonly database: SyncDatabase) {}

    runInTransaction<T>(callback: () => T): T {
        return this.database.transaction(callback)();
    }

    getCurrentCursor(syncKey: string): number {
        const row = this.database
            .prepare('SELECT current_cursor FROM sync_cursor_state WHERE sync_key = ?')
            .get(syncKey) as CursorRow | undefined;

        return row?.current_cursor ?? 0;
    }

    allocateNextCursor(syncKey: string, timestamp: number): number {
        const nextCursor = this.getCurrentCursor(syncKey) + 1;
        this.database
            .prepare(`
                INSERT INTO sync_cursor_state (sync_key, current_cursor, updated_at)
                VALUES (@syncKey, @currentCursor, @updatedAt)
                ON CONFLICT(sync_key) DO UPDATE SET
                    current_cursor = excluded.current_cursor,
                    updated_at = excluded.updated_at
            `)
            .run({
                syncKey,
                currentCursor: nextCursor,
                updatedAt: timestamp
            });

        return nextCursor;
    }

    getConversation(syncKey: string, conversationId: string): PersistedConversation | null {
        const row = this.database
            .prepare(`
                SELECT payload_json, server_cursor, created_at, last_seen_at
                FROM synced_conversations
                WHERE sync_key = ? AND conversation_id = ?
            `)
            .get(syncKey, conversationId) as ConversationRow | undefined;

        if (!row) {
            return null;
        }

        return {
            conversation: JSON.parse(row.payload_json) as SyncConversation,
            serverCursor: row.server_cursor,
            createdAt: row.created_at,
            lastSeenAt: row.last_seen_at
        };
    }

    listConversationsAfterCursor(syncKey: string, cursor: number | null): PersistedConversation[] {
        const minCursor = cursor ?? 0;
        const rows = this.database
            .prepare(`
                SELECT payload_json, server_cursor, created_at, last_seen_at
                FROM synced_conversations
                WHERE sync_key = ? AND server_cursor > ?
                ORDER BY server_cursor ASC
            `)
            .all(syncKey, minCursor) as ConversationRow[];

        return rows.map((row) => ({
            conversation: JSON.parse(row.payload_json) as SyncConversation,
            serverCursor: row.server_cursor,
            createdAt: row.created_at,
            lastSeenAt: row.last_seen_at
        }));
    }

    saveConversation(input: SaveConversationInput): void {
        const { syncKey, conversation, serverCursor, receivedAt, createdAt } = input;
        this.database
            .prepare(`
                INSERT INTO synced_conversations (
                    sync_key,
                    conversation_id,
                    title,
                    backend_id,
                    source_type,
                    external_id,
                    messages_json,
                    updated_at,
                    deleted,
                    synced_at,
                    server_cursor,
                    payload_json,
                    created_at,
                    last_seen_at
                )
                VALUES (
                    @syncKey,
                    @conversationId,
                    @title,
                    @backendId,
                    @sourceType,
                    @externalId,
                    @messagesJson,
                    @updatedAt,
                    @deleted,
                    @syncedAt,
                    @serverCursor,
                    @payloadJson,
                    @createdAt,
                    @lastSeenAt
                )
                ON CONFLICT(sync_key, conversation_id) DO UPDATE SET
                    title = excluded.title,
                    backend_id = excluded.backend_id,
                    source_type = excluded.source_type,
                    external_id = excluded.external_id,
                    messages_json = excluded.messages_json,
                    updated_at = excluded.updated_at,
                    deleted = excluded.deleted,
                    synced_at = excluded.synced_at,
                    server_cursor = excluded.server_cursor,
                    payload_json = excluded.payload_json,
                    last_seen_at = excluded.last_seen_at
            `)
            .run({
                syncKey,
                conversationId: conversation.id,
                title: conversation.title,
                backendId: conversation.backendId ?? null,
                sourceType: conversation.sourceType ?? null,
                externalId: conversation.externalId ?? null,
                messagesJson: JSON.stringify(conversation.messages),
                updatedAt: conversation.updatedAt,
                deleted: conversation.sync?.deleted ? 1 : 0,
                syncedAt: receivedAt,
                serverCursor,
                payloadJson: JSON.stringify(conversation),
                createdAt,
                lastSeenAt: receivedAt
            });
    }
}
