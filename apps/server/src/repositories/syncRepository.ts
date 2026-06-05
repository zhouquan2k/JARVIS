import type { Conversation, ConversationOrigin, ConversationQuery, IConversationQueryProvider } from '@plugins/ai-agent/api';
import type { SyncDatabase } from '../db.js';
import type { SyncConversation, SyncDeletedConversation } from '../types/sync.js';

interface CursorRow {
    current_cursor: number;
}

interface ConversationRow {
    agent_key: string | null;
    document_paths: string | null;
    document_ids: string | null;
    payload_json: string;
    server_cursor: number;
    created_at: number;
    last_seen_at: number;
}

interface DeletedConversationRow {
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

export interface PersistedDeletedConversation {
    deletedConversation: SyncDeletedConversation;
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

export interface SaveDeletedConversationInput {
    syncKey: string;
    deletedConversation: SyncDeletedConversation;
    serverCursor: number;
    receivedAt: number;
    createdAt: number;
}

export class SyncRepository implements IConversationQueryProvider {
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
                SELECT agent_key, document_paths, document_ids, payload_json, server_cursor, created_at, last_seen_at
                FROM synced_conversations
                WHERE sync_key = ? AND conversation_id = ?
            `)
            .get(syncKey, conversationId) as ConversationRow | undefined;

        if (!row) {
            return null;
        }

        return {
            conversation: this.hydrateConversation(row),
            serverCursor: row.server_cursor,
            createdAt: row.created_at,
            lastSeenAt: row.last_seen_at
        };
    }

    listConversationsAfterCursor(syncKey: string, cursor: number | null): PersistedConversation[] {
        const minCursor = cursor ?? 0;
        const rows = this.database
            .prepare(`
                SELECT agent_key, document_paths, document_ids, payload_json, server_cursor, created_at, last_seen_at
                FROM synced_conversations
                WHERE sync_key = ? AND server_cursor > ?
                ORDER BY server_cursor ASC
            `)
            .all(syncKey, minCursor) as ConversationRow[];

        return rows.map((row) => ({
            conversation: this.hydrateConversation(row),
            serverCursor: row.server_cursor,
            createdAt: row.created_at,
            lastSeenAt: row.last_seen_at
        }));
    }

    async getConversations(query: ConversationQuery): Promise<Conversation[]> {
        if (query.documentId) {
            return this._getConversationsByDocumentId(query.documentId);
        }
        return this._getConversationsByPath(query.documentPath);
    }

    private _allConversationRows(): ConversationRow[] {
        return this.database
            .prepare(`
                SELECT agent_key, document_paths, document_ids, payload_json, server_cursor, created_at, last_seen_at
                FROM synced_conversations
                WHERE deleted = 0
                ORDER BY updated_at DESC
            `)
            .all() as ConversationRow[];
    }

    private _normalizeConversation(conversation: SyncConversation): Conversation {
        const validOrigins: ConversationOrigin[] = ['chatgpt-web', 'gemini-web', 'external-file', 'local'];
        const origin: ConversationOrigin = validOrigins.includes(conversation.origin as ConversationOrigin)
            ? conversation.origin as ConversationOrigin
            : 'local';
        return {
            ...conversation,
            origin,
            documentPaths: Array.isArray(conversation.documentPaths)
                ? Array.from(new Set(conversation.documentPaths.filter((path): path is string => {
                    return typeof path === 'string' && path.trim().length > 0;
                }).map((path) => path.trim())))
                : undefined,
            documentIds: Array.isArray(conversation.documentIds)
                ? Array.from(new Set(conversation.documentIds.filter((id): id is string => {
                    return typeof id === 'string' && id.trim().length > 0;
                })))
                : undefined
        };
    }

    private _getConversationsByDocumentId(documentId: string): Conversation[] {
        return this._allConversationRows()
            .map((row) => this.hydrateConversation(row))
            .filter((c) => c.documentIds?.includes(documentId))
            .map((c) => this._normalizeConversation(c));
    }

    private _getConversationsByPath(documentPath?: string): Conversation[] {
        return this._allConversationRows()
            .map((row) => this.hydrateConversation(row))
            .filter((c) => documentPath ? c.documentPaths?.includes(documentPath) : true)
            .map((c) => this._normalizeConversation(c));
    }

    getDeletedConversation(syncKey: string, conversationId: string): PersistedDeletedConversation | null {
        const row = this.database
            .prepare(`
                SELECT payload_json, server_cursor, created_at, last_seen_at
                FROM sync_deleted_conversations
                WHERE sync_key = ? AND conversation_id = ?
            `)
            .get(syncKey, conversationId) as DeletedConversationRow | undefined;

        if (!row) {
            return null;
        }

        return {
            deletedConversation: JSON.parse(row.payload_json) as SyncDeletedConversation,
            serverCursor: row.server_cursor,
            createdAt: row.created_at,
            lastSeenAt: row.last_seen_at
        };
    }

    listDeletedConversationsAfterCursor(syncKey: string, cursor: number | null): PersistedDeletedConversation[] {
        const minCursor = cursor ?? 0;
        const rows = this.database
            .prepare(`
                SELECT payload_json, server_cursor, created_at, last_seen_at
                FROM sync_deleted_conversations
                WHERE sync_key = ? AND server_cursor > ?
                ORDER BY server_cursor ASC
            `)
            .all(syncKey, minCursor) as DeletedConversationRow[];

        return rows.map((row) => ({
            deletedConversation: JSON.parse(row.payload_json) as SyncDeletedConversation,
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
                    agent_key,
                    document_paths,
                    document_ids,
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
                    @agentKey,
                    @documentPaths,
                    @documentIds,
                    @backendId,
                    @origin,
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
                    agent_key = excluded.agent_key,
                    document_paths = excluded.document_paths,
                    document_ids = excluded.document_ids,
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
                agentKey: conversation.agentKey ?? null,
                documentPaths: Array.isArray(conversation.documentPaths) && conversation.documentPaths.length > 0
                    ? JSON.stringify(conversation.documentPaths)
                    : null,
                documentIds: Array.isArray(conversation.documentIds) && conversation.documentIds.length > 0
                    ? JSON.stringify(conversation.documentIds)
                    : null,
                backendId: conversation.backendId ?? null,
                origin: conversation.origin ?? null,
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

    private hydrateConversation(row: ConversationRow): SyncConversation {
        const conversation = JSON.parse(row.payload_json) as SyncConversation;
        const resolvedDocumentPaths = this.parseJsonStringArrayColumn(row.document_paths);
        const resolvedDocumentIds = this.parseJsonStringArrayColumn(row.document_ids);
        let nextConversation: SyncConversation = conversation;
        if (resolvedDocumentPaths) {
            nextConversation = { ...nextConversation, documentPaths: resolvedDocumentPaths };
        }
        if (resolvedDocumentIds) {
            nextConversation = { ...nextConversation, documentIds: resolvedDocumentIds };
        }

        // Prefer the actual column value. This allows manual DB patches to the agent_key column
        // to take effect without having to parse and re-stringify the entire payload_json.
        if (typeof row.agent_key === 'string' && row.agent_key.trim()) {
            return {
                ...nextConversation,
                agentKey: row.agent_key
            };
        }

        if (typeof nextConversation.agentKey === 'string' && nextConversation.agentKey.trim()) {
            return nextConversation;
        }

        return nextConversation;
    }

    private parseJsonStringArrayColumn(value: string | null): string[] | undefined {
        if (typeof value !== 'string' || value.trim().length === 0) {
            return undefined;
        }

        try {
            const parsed = JSON.parse(value) as unknown;
            if (!Array.isArray(parsed)) {
                return undefined;
            }

            const normalized = parsed.filter((item): item is string => {
                return typeof item === 'string' && item.trim().length > 0;
            }).map((item) => item.trim());

            return normalized.length > 0 ? Array.from(new Set(normalized)) : undefined;
        } catch {
            return undefined;
        }
    }

    saveDeletedConversation(input: SaveDeletedConversationInput): void {
        const { syncKey, deletedConversation, serverCursor, receivedAt, createdAt } = input;
        this.database
            .prepare(`
                INSERT INTO sync_deleted_conversations (
                    sync_key,
                    conversation_id,
                    updated_at,
                    server_cursor,
                    payload_json,
                    created_at,
                    last_seen_at
                )
                VALUES (
                    @syncKey,
                    @conversationId,
                    @updatedAt,
                    @serverCursor,
                    @payloadJson,
                    @createdAt,
                    @lastSeenAt
                )
                ON CONFLICT(sync_key, conversation_id) DO UPDATE SET
                    updated_at = excluded.updated_at,
                    server_cursor = excluded.server_cursor,
                    payload_json = excluded.payload_json,
                    last_seen_at = excluded.last_seen_at
            `)
            .run({
                syncKey,
                conversationId: deletedConversation.id,
                updatedAt: deletedConversation.updatedAt,
                serverCursor,
                payloadJson: JSON.stringify(deletedConversation),
                createdAt,
                lastSeenAt: receivedAt
            });
    }

    deleteConversationAggregate(syncKey: string, conversationId: string): void {
        this.database
            .prepare('DELETE FROM synced_conversations WHERE sync_key = ? AND conversation_id = ?')
            .run(syncKey, conversationId);
    }

    getConversationsNeedingMigration(): Array<{ syncKey: string; conversationId: string; documentPaths: string[] }> {
        const rows = this.database
            .prepare(`
                SELECT sync_key, conversation_id, document_paths
                FROM synced_conversations
                WHERE document_ids IS NULL AND document_paths IS NOT NULL AND deleted = 0
            `)
            .all() as Array<{ sync_key: string; conversation_id: string; document_paths: string }>;

        return rows.flatMap((row) => {
            const paths = this.parseJsonStringArrayColumn(row.document_paths);
            if (!paths || paths.length === 0) return [];
            return [{ syncKey: row.sync_key, conversationId: row.conversation_id, documentPaths: paths }];
        });
    }

    setConversationDocumentIds(syncKey: string, conversationId: string, documentIds: string[]): void {
        this.database
            .prepare(`
                UPDATE synced_conversations
                SET document_ids = @documentIds
                WHERE sync_key = @syncKey AND conversation_id = @conversationId
            `)
            .run({
                syncKey,
                conversationId,
                documentIds: JSON.stringify(documentIds)
            });
    }
}
