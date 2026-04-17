import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { applyBoundNodeNameMigration } from '../src/migrations/boundNodeNameMigration.js';
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
    const cliDbPath = explicitPath?.trim();
    if (cliDbPath) {
        const cliBaseDir = process.env.INIT_CWD?.trim() || process.cwd();
        return path.isAbsolute(cliDbPath) ? cliDbPath : path.resolve(cliBaseDir, cliDbPath);
    }

    const envDbPath = process.env.CHATPRISM_SYNC_DB_PATH?.trim();
    if (!envDbPath) {
        throw new Error('请通过 --db 或 CHATPRISM_SYNC_DB_PATH 提供 SQLite 数据库路径。');
    }

    return path.resolve(envDbPath);
}

async function main(): Promise<void> {
    const { dbPath: cliDbPath, dryRun } = parseArgs(process.argv.slice(2));
    const dbPath = resolveDbPath(cliDbPath);
    const database = new BetterSqlite3(dbPath);
    const rows = database.prepare(`
        SELECT sync_key, conversation_id, payload_json
        FROM synced_conversations
    `).all() as Row[];

    let scanned = 0;
    let migrated = 0;
    let skippedWithExisting = 0;
    let skippedWithoutSource = 0;
    const update = database.prepare(`
        UPDATE synced_conversations
        SET payload_json = @payloadJson
        WHERE sync_key = @syncKey AND conversation_id = @conversationId
    `);

    const transaction = database.transaction((items: Row[]) => {
        for (const row of items) {
            scanned += 1;
            const parsed = JSON.parse(row.payload_json) as SyncConversation;
            const result = applyBoundNodeNameMigration(parsed);
            if (!result.changed) {
                if (result.source === 'existing') {
                    skippedWithExisting += 1;
                    console.log(
                        `skip sync_key=${row.sync_key} conversation_id=${row.conversation_id} reason=existing boundNodeName=${parsed.boundNodeName?.trim() ?? ''}`
                    );
                } else {
                    skippedWithoutSource += 1;
                    console.log(
                        `skip sync_key=${row.sync_key} conversation_id=${row.conversation_id} reason=unresolved`
                    );
                }
                continue;
            }

            migrated += 1;
            console.log(
                `update sync_key=${row.sync_key} conversation_id=${row.conversation_id} boundNodeName=${result.conversation.boundNodeName ?? ''} source=${result.source ?? 'unknown'} mode=${dryRun ? 'dry-run' : 'write'}`
            );
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
        'bound-node-name migration complete',
        `db=${dbPath}`,
        `scanned=${scanned}`,
        `migrated=${migrated}`,
        `skippedExisting=${skippedWithExisting}`,
        `skippedUnresolved=${skippedWithoutSource}`,
        `mode=${dryRun ? 'dry-run' : 'write'}`
    ].join(' '));
}

void main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`bound-node-name migration failed: ${message}`);
    process.exitCode = 1;
});
