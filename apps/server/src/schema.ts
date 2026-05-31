export const SCHEMA_STATEMENTS = [
    `
    CREATE TABLE IF NOT EXISTS sync_cursor_state (
        sync_key TEXT PRIMARY KEY,
        current_cursor INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
    )
    `,
    `
    CREATE TABLE IF NOT EXISTS synced_conversations (
        sync_key TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        title TEXT NOT NULL,
        agent_key TEXT,
        document_paths TEXT,
        backend_id TEXT,
        source_type TEXT,
        external_id TEXT,
        messages_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        synced_at INTEGER,
        server_cursor INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        PRIMARY KEY (sync_key, conversation_id)
    )
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_synced_conversations_sync_cursor
    ON synced_conversations (sync_key, server_cursor)
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_synced_conversations_updated_at
    ON synced_conversations (sync_key, updated_at)
    `,
    `
    CREATE TABLE IF NOT EXISTS sync_deleted_conversations (
        sync_key TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        server_cursor INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        PRIMARY KEY (sync_key, conversation_id)
    )
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_sync_deleted_conversations_sync_cursor
    ON sync_deleted_conversations (sync_key, server_cursor)
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_sync_deleted_conversations_updated_at
    ON sync_deleted_conversations (sync_key, updated_at)
    `
] as const;

export const MIGRATION_STATEMENTS = [
    `
    ALTER TABLE synced_conversations
    ADD COLUMN agent_key TEXT
    `,
    `
    ALTER TABLE synced_conversations
    ADD COLUMN document_paths TEXT
    `,
    `
    ALTER TABLE synced_conversations
    ADD COLUMN document_ids TEXT
    `
] as const;

export const POST_MIGRATION_STATEMENTS = [
    `
    CREATE INDEX IF NOT EXISTS idx_synced_conversations_sync_key_agent_key
    ON synced_conversations (sync_key, agent_key)
    `
] as const;
