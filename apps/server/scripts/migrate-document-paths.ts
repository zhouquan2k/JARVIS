import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { applyDocumentPathMigration } from '../src/migrations/documentPathMigration.js';
import type { SyncConversation } from '../src/types/sync.js';

interface Row {
    sync_key: string;
    conversation_id: string;
    payload_json: string;
}

function parseArgs(argv: string[]): { dbPath?: string; dryRun: boolean } {
    let dbPath: string | undefined;
    let dryRun = false;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--db') {
            dbPath = argv[index + 1];
            index += 1;
            continue;
        }
        if (arg === '--dry-run') {
            dryRun = true;
        }
    }

    return { dbPath, dryRun };
}

function resolveDbPath(explicitPath?: string): string {
    const value = explicitPath?.trim() || process.env.CHATPRISM_SYNC_DB_PATH?.trim();
    if (!value) {
        throw new Error('请通过 --db 或 CHATPRISM_SYNC_DB_PATH 提供 SQLite 数据库路径。');
    }
    return path.resolve(value);
}

async function main(): Promise<void> {
    const { dbPath: cliDbPath, dryRun } = parseArgs(process.argv.slice(2));
    const dbPath = resolveDbPath(cliDbPath);
    const database = new BetterSqlite3(dbPath);
    const rows = database.prepare(`
        SELECT sync_key, conversation_id, payload_json
        FROM synced_conversations
        WHERE deleted = 0
    `).all() as Row[];

    let scanned = 0;
    let migrated = 0;
    const update = database.prepare(`
        UPDATE synced_conversations
        SET payload_json = @payloadJson
        WHERE sync_key = @syncKey AND conversation_id = @conversationId
    `);

    const transaction = database.transaction((items: Row[]) => {
        for (const row of items) {
            scanned += 1;
            const parsed = JSON.parse(row.payload_json) as SyncConversation;
            const result = applyDocumentPathMigration(parsed);
            if (!result.changed) {
                continue;
            }

            migrated += 1;
            if (!dryRun) {
                update.run({
                    syncKey: row.sync_key,
                    conversationId: row.conversation_id,
                    payloadJson: JSON.stringify(result.conversation)
                });
            }
        }
    });

    try {
        transaction(rows);
    } finally {
        database.close();
    }

    console.log([
        'document-path migration complete',
        `db=${dbPath}`,
        `scanned=${scanned}`,
        `migrated=${migrated}`,
        `mode=${dryRun ? 'dry-run' : 'write'}`
    ].join(' '));
}

void main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`document-path migration failed: ${message}`);
    process.exitCode = 1;
});
